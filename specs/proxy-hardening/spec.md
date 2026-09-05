# Spec: Proxy Hardening

## Feature ID
`proxy-hardening`

## Summary
Harden the Nuxt server proxy at `server/api/arbiter/[...].ts` — the single path through which the browser reaches the FastAPI backend. Today the proxy forwards **every** browser request header (including `cookie`, `authorization`, `referer`, `user-agent`) to the upstream, relays upstream `Set-Cookie` back to the browser, accepts any HTTP method and any path, has no upstream timeout, and serializes `undefined` query values as empty strings. This feature closes those gaps with explicit allowlists, a hard timeout, and a pure-function policy module (`server/utils/proxyPolicy.ts`) that is unit-tested with Vitest.

## Source doc
SA system assessment (2026-09-04), roadmap item 2 / audit P0 #2 — "Proxy 轉發全部 browser headers、無 timeout、無 method/path allowlist".

## Scope

### In Scope
1. **Request header whitelist** — forward only `content-type` and `accept` to the upstream, plus the server-added `X-API-Key`. `cookie`, `authorization`, `referer`, `user-agent`, and everything else from the browser are **not** forwarded.
2. **No `Set-Cookie` relay** — upstream `Set-Cookie` headers are never written to the browser response. Only `content-type` is relayed from the upstream response.
3. **Method allowlist** — `GET`, `POST`, `PATCH`, `DELETE`. Anything else (`PUT`, `HEAD`, `OPTIONS`, …) → `405` with an `Allow` header.
4. **Path allowlist** — first path segment must be one of `analyze`, `decisions`, `config`, `cases`, `evaluate`, `eval-pool`, `review-queue`, `optimizer`, `health` (every endpoint used in `composables/useApi.ts`). Non-listed → `404`. **Revised in review round 2:** the path is taken from the **raw** request target (`event.node.req.originalUrl`) and validated undecoded — h3 percent-decodes before routing, so the router's own wildcard has already lost information (see "Implementation note — the raw request target"). Paths containing `..` or a `%2E` escape → `404` before allowlist lookup; a leading `/` or an internal `//` → `404`. Empty wildcard → `404`. The path must additionally survive the WHATWG URL parser byte-for-byte (see "Implementation note — path traversal").
5. **Upstream timeout** — `AbortSignal.timeout(30_000)`. Timeout → `504` with message `upstream-timeout`. Other network failure → `502` with message `upstream-unreachable`. **Revised in review round 1:** both messages are now fixed tokens with no cause text. The cause is carried in a separate `detail` field that is written to stderr only — raw fetch causes name internal hostnames, IPs and ports (`connect ECONNREFUSED 10.0.7.12:8000`), which redacting the API key does not cover. The API key is still redacted from `detail` as a hard guarantee.
6. **Query relay** — **Revised in review round 2:** the query is relayed byte for byte out of the raw request target. It is no longer parsed into an object and re-serialized, and `serializeQuery` is deleted: that round trip is exactly what lost and rewrote data. The only decision made here is where to split — the first `?` in the raw target — plus a refusal (`unsafe-char`) of a query carrying a raw control character, a raw space or a `#`.
7. **Pure policy module** — `server/utils/proxyPolicy.ts` exports the allowlist checks, raw-target splitting, header filtering, error classification and secret redaction as side-effect-free functions with Vitest coverage in `tests/proxyPolicy.test.ts`.

### Out of Scope
- Changing the session check (`getUserSession` 401 gate stays exactly as is — auth changes belong to `auth-hardening`).
- Rate limiting, CSRF tokens, request body size limits, response size limits.
- Changing `composables/useApi.ts`, `types/api.ts`, any page or component.
- Backend (FastAPI) changes.
- Updating the outdated proxy snippet in `README.md` (docs-only; can be a separate `docs:` commit).
- Streaming request bodies (`streamRequest`) — request bodies keep being buffered as today.

## Architecture Decision

### Why `proxyRequest` cannot be kept
h3 1.15.11 `proxyRequest` (dist `index.mjs` ~L1148) always computes

```
fetchHeaders = mergeHeaders(getProxyRequestHeaders(event), opts.fetchOptions?.headers, opts.headers)
```

`getProxyRequestHeaders` copies **all** request headers except `transfer-encoding, accept-encoding, connection, keep-alive, upgrade, expect, host, accept`. `mergeHeaders` only ever **sets** keys (`if (value !== undefined) merged.set(key, value)`); there is no way to delete a forwarded header through `opts.headers` or `opts.fetchOptions.headers`. So a whitelist is impossible with `proxyRequest`.

### Options considered
| Option | Headers | Set-Cookie | Timeout / 504 | Verdict |
|---|---|---|---|---|
| A. keep `proxyRequest` | cannot remove browser headers | relayed | `fetchOptions.signal` works, but a thrown fetch is always converted to `502 Bad Gateway` inside `sendProxy` (would need re-classification in an outer `catch` via `error.cause`) | **Rejected** — fails requirement 1 outright |
| B. call `sendProxy` directly | `sendProxy` passes `{ headers: opts.headers, ...opts.fetchOptions }` to fetch with no merge, so a self-built `fetchOptions.headers` is the full header set | `sendProxy` writes `set-cookie` to `event.node.res` **before** `onResponse`; would need `event.node.res.removeHeader('set-cookie')` inside `onResponse` | same as A | **Rejected** — a security control that depends on undocumented call ordering inside a third-party function is fragile, and the route would still be ~25 lines of glue around it |
| C. own minimal proxy: `$fetch.raw` + `sendStream` | fully explicit | never written | explicit `AbortSignal.timeout`; classify `TimeoutError` → 504, anything else → 502 | **Chosen** |

### Chosen design (Option C)
`server/api/arbiter/[...].ts` becomes a thin, ordered pipeline; every decision point is a pure function in `server/utils/proxyPolicy.ts` (Nitro auto-imports `server/utils/*`):

1. `getUserSession` → `401` (unchanged).
2. `isAllowedMethod(event.method)` → else `405` + `Allow: GET, POST, PATCH, DELETE`.
3. `validateProxyTarget(event.node.req.originalUrl)` → else `404`. **Revised in review round 2.** It splits the raw request line at the first `?`, checks the path half is under `/api/arbiter/`, and hands the remainder to `validateProxyPath`, which rejects empty, `..`, `%2E`, a leading `/`, `//`, or a first segment not in `ALLOWED_PATH_PREFIXES`. Match is **segment-based** (`health` ok, `healthz` not).
4. The query half is carried through verbatim — no parse, no re-serialize.
5. `pickForwardHeaders(getRequestHeaders(event))` → `{ 'content-type'?, accept? }`, then add `X-API-Key`.
6. Body: `readRawBody(event, false)` only for `POST | PATCH | DELETE` (the same payload-method set h3 uses today).
7. `$fetch.raw(url, { method, headers, body, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS), responseType: 'stream', ignoreResponseError: true, retry: 0 })` inside `try/catch`.
   - `redirect: 'manual'` is set so a 3xx is neither followed nor relayed (see the redirect note below).
   - `catch` → `classifyUpstreamError(err, apiKey)` returns `{ statusCode, message, detail }` where `message` is the fixed token `upstream-timeout` or `upstream-unreachable` and `detail` is the redacted cause, logged to stderr only → `throw createError({ statusCode, message })`.
   - `$fetch` (ofetch) is used instead of global `fetch` to comply with CLAUDE.md §3 ("API 呼叫統一透過 `useFetch` / `$fetch`"). `retry: 0` is set explicitly because ofetch retries idempotent requests on retryable 5xx by default, which would double the effective timeout and re-issue requests to an already-slow upstream. `ignoreResponseError: true` keeps upstream 4xx/5xx as pass-through status codes instead of thrown errors.
8. `setResponseStatus`, `setResponseHeaders(event, pickResponseHeaders(res.headers))` (only `content-type`), then pipe the body with `pipeline(Readable.fromWeb(res.body), event.node.res)`; if `res.body` is null, `return null`. Statuses outside 200–599 collapse to 502.

Steps 2–8 live in `runProxy` (`server/utils/proxyHandler.ts`) rather than in the route file — see the functional-core note below.

Behaviour preserved from today: upstream status codes pass through unchanged (e.g. backend `422` reaches the browser as `422`); response body is streamed; request body is buffered.

### Error-message safety
`createError({ statusCode, message })` messages are visible to the browser. **Revised in review round 1:** both the 504 and the 502 message are fixed strings. The underlying cause (e.g. `connect ECONNREFUSED 10.0.7.12:8000`) is no longer sent to the browser at all — it names internal hostnames, IPs and ports that redacting the API key does not cover. It is returned as `UpstreamFailure.detail` and written to stderr, still with `redactSecret` applied to `config.apiKey` as a hard guarantee. `cause` is **not** attached to the thrown error (Nitro may serialize it in dev).

### Implementation note — outgoing `User-Agent` (added during implementation)
The fetch specification requires a `User-Agent` on every outgoing request: if the caller
sets none, the runtime appends its own default (`node` under undici). The header therefore
cannot simply be omitted, and runtime verification confirmed `user-agent: node` reaching the
mock upstream. The browser's own `User-Agent` was **not** leaked, but rather than depend on a
runtime default, the proxy now pins `PROXY_USER_AGENT = 'arbiter-proxy'` explicitly. This
satisfies the intent of AC-2.4 (no browser-supplied `User-Agent` reaches the upstream) with a
deliberate, testable value.

### Implementation note — path traversal and client normalisation
`undici`'s `fetch` resolves `..` in a URL before the request leaves the client, so a traversal
probe sent with `fetch` never reaches the server with the literal path. AC-2.3 is therefore
verified over a raw `node:http` socket, which preserves the path verbatim. Confirmed:
`/api/arbiter/cases/../config/provider` returns `404` and the upstream is never contacted.

**Corrected twice — read this whole note before trusting either earlier version.**

*Round 1, first pass.* The original implementation recorded a residual: a percent-encoded
`%2e%2e` in a later segment was not caught, judged "not exploitable because the upstream is an
HTTP API, not a file server, and the first-segment allowlist still applies." Review round 1
challenged that, and unit-level measurement appeared to confirm a full allowlist bypass:

```
validateProxyPath('health/%2e%2e/admin')            -> { ok: true, path: '/health/%2e%2e/admin' }
new URL(base + '/health/%2e%2e/admin').pathname     -> '/admin'
```

*Round 1, second pass — what is actually true.* The bypass above is real **in the pure
function** but was **not reachable through the route**, and the "Critical" severity assigned to
it in the first retraction is withdrawn. Both the original residual note and the first
retraction rested on the same unverified premise: that `getRouterParam` hands the wildcard over
percent-encoded. It does not. Nitro/h3 decodes the catch-all with `decodeURI` semantics before
the handler runs. Instrumented against the built server:

```
request line  /api/arbiter/health/%2e%2e/admin       routerParam  "health/../admin"
request line  /api/arbiter/config/rules/my%20rule    routerParam  "config/rules/my rule"
request line  /api/arbiter/health/..%2fadmin         routerParam  "health/..%2Fadmin"
```

So `%2e%2e` arrived at the original literal `..` check already decoded, and was rejected. A
reserved `%2f` stays encoded, so it cannot smuggle a separator either.

The premise error cut the other way too, and cost a real regression. The first fix decoded the
wildcard a *second* time and rejected raw spaces, which 404'd the legitimate
`/api/arbiter/config/rules/my%20rule` — a path `composables/useApi.ts` produces with
`encodeURIComponent`. Every unit test stayed green, because the tests were written against the
same wrong premise. This is why Task 5 / AC-5.x now exists (see "Testing strategy"): the route is
covered end to end against a built server, so the shape of the input it really receives is
asserted rather than assumed.

*Round 2 — the premise was wrong again, and this time it was reachable.* Review round 2
measured the built server once more. The decode is not `decodeURI` semantics but ufo's
`decodePath` — `decodeURIComponent` with `%2F` and `%25` protected — applied to the path half of
the raw URL **before** the router splits it. Three consequences, all confirmed against
`.output/`:

```
/api/arbiter/config/rules/a%3Fb          routerParam "config/rules/a"          query {b:''}
/api/arbiter/config/rules/rate%25limit   routerParam "config/rules/rate%limit"
/api/arbiter/config/rules/a%23b          routerParam "config/rules/a"          (rest is a fragment)
```

The first is the serious one: an encoded `?` became a real query delimiter, so the proxy issued
a **200 against a different resource** than the client asked for, silently. The other two were
404s on legitimate input. No validation placed *after* that split can recover the lost bytes, so
the fix is structural rather than another rule — the handler stops reading `getRouterParam` /
`getQuery` altogether and validates the raw request target itself.

**The hardening is kept and now operates on the raw bytes.** `validateProxyPath` receives the
wildcard exactly as it appeared on the request line and does **not** decode — a decode is its
own bypass class. Escapes are only case-canonicalised (`%2f` → `%2F`), since hex case does not
change which path is named. Three independent invariants hold:

1. **Literal form.** No `..`, no leading `/`, no `//`, and no character that would let the
   parser split or rewrite the path: anything outside printable ASCII (so C0 controls, DEL and
   un-encoded non-ASCII bytes), plus backslash, `?` and `#`. A raw space is refused as well: it
   cannot appear in a request line, so its presence means something decoded the path already.
2. **No encoded dot segment.** A `.` never needs encoding inside a path segment, so `%2E` only
   ever appears in order to slip a dot segment past invariant 1. The rule is load-bearing, not
   redundant with invariant 3: the WHATWG parser does not treat a reserved `%2F` as a separator,
   so `health/%2F%2E%2E/admin` survives identity byte-for-byte while an upstream that decodes
   the whole target lands on `/health/../admin`.
3. **Parser identity.** The canonicalised wildcard is run through the same parser that builds
   the request URL and must come back byte-for-byte unchanged, origin included:
   `new URL(canonical, 'https://proxy.invalid/').pathname === '/' + canonical`. Anything the
   parser would rewrite is `not-normalized` — a single `.` segment, most obviously. The
   comparison is against the raw pathname rather than a decoded round trip: nothing is decoded
   anywhere now, so `%20` is simply carried through as `%20`.

A malformed escape (`%zz`, a trailing `%`, a literal `%` a client failed to encode) is rejected
as `malformed` rather than ignored — the parser passes every one of those through untouched, so
invariant 3 cannot see them. `config/rules/my%20rule`, `rate%25limit`, `a%3Fb`, `a%23b` and
`cases/abc%2Fdef` all reach the upstream byte-for-byte as the client sent them.

The rejection reason is logged but never returned: distinguishing `not-allowed` from
`traversal` in a response hands a caller a map of the allowlist. Every path rejection is a
bare `404`.

### Implementation note — the raw request target (added in review round 2)
The handler reads `event.node.req.originalUrl` — not `getRouterParam` / `getQuery`, and not
`event.node.req.url`. From h3 1.15.11 `createAppEventHandler`: `originalUrl` is assigned once,
before any layer runs, and no layer rewrites it; `req.url` is reassigned per layer, and the path
is decoded (`_decodePath`) before the router matches. Taking the original target and doing the
`?` split here makes the proxy's view of the request the client's own bytes, and drops the
dependency on undocumented h3 behaviour that produced two wrong premises in a row.

`event.node.req.url` happens to hold the same string today, because h3 restores the raw URL
whenever decoding changed it and the layer is mounted at `/`. That is measured, not relied on:
the mutation check records it as an equivalent mutant rather than as covered behaviour.

### Implementation note — upstream redirects (added in review round 1)
`redirect: 'manual'` is now set on the upstream fetch and any 3xx is turned into a `502`
rather than followed or relayed. Verified against Node 22 / undici: undici strips
`authorization`, `cookie` and `host` on a cross-origin redirect but **keeps custom headers**,
so a followed redirect would have carried `X-API-Key` to whatever origin the upstream named.
Relaying the 3xx instead would let the upstream steer the browser to an arbitrary origin, so
the `location` header is dropped with the rest (only `content-type` is ever relayed).

**Revised in review round 2:** the refused response's body is now cancelled before returning.
A manual-redirect response still carries a live body, and the streaming path that would drain
it never runs for a 3xx, so the upstream socket stayed occupied until GC or the 30s signal — a
redirect loop could have drained the connection pool while every request got a prompt 502.

### Implementation note — unreadable request bodies (added in review round 1)
`readRawBody` was previously wrapped in `.catch(() => undefined)`, so a client that aborted
mid-upload produced a *successful* upstream write with an empty body. The read is no longer
swallowed: a failure returns `400 Invalid Request Body` and the upstream is never called.

### Implementation note — response streaming (added in review round 1)
`sendStream` is no longer used. Its web-stream branch pipes through
`new WritableStream({ write(chunk) { event.node.res.write(chunk) } })`, which discards
`res.write`'s backpressure signal and never cancels the upstream body when the client
disconnects — a slow or vanished client would buffer the whole upstream response in memory.
The route now uses `pipeline(Readable.fromWeb(body), event.node.res)`, which propagates
backpressure and destroys the source on client disconnect. It also ends the response, setting
`writableEnded`, which is what h3's `event.handled` getter reads, so the handler is correctly
seen as having handled the event.

### Accepted boundary — failures after the response headers are committed
Review round 1 also raised that `classifyUpstreamError` only covers the window up to the
upstream's response headers. Once a status is written, a body that then stalls or whose socket
dies cannot become a `504` — the status line has already gone out. **Accepted; it is a property
of streaming, not a defect.** Buffering the whole body to keep the option of changing the status
would give up the streaming the design exists for, and would cap response size by memory.

What did change is the failure mode. `sendStream` would have ended the response cleanly, so a
truncated body looked to the browser like a complete `200`. `pipeline` destroys the response
socket on a source error instead, so the client sees an aborted transfer — which `$fetch`
surfaces as a rejected promise rather than as silently short data. The 30 s `AbortSignal` still
covers the body, so a stalled upstream is torn down rather than held open.

### Accepted boundary — upstream error response bodies
Review round 1 raised that upstream 4xx/5xx bodies are streamed to the browser verbatim, so an
upstream that echoed a secret in an error payload would relay it. **Accepted, not fixed.**
Requirement 5 above governs *this proxy's own* error messages; it does not require rewriting
upstream payloads. The upstream is our own FastAPI service, and pass-through of its status and
body is deliberate behaviour the UI depends on to show real validation errors (`422` detail
bodies in particular). Buffering every error response to inspect it would cost the streaming
property the design was chosen for. If the upstream ever becomes third-party, this is the
first thing to revisit.

### Architecture note — functional core (added in review round 1)
The route file previously carried all the ordering logic and had 0 % test coverage, because
exercising it needs a booted Nitro server. It is now split:

- `server/utils/proxyHandler.ts` — `runProxy(request, deps): Promise<ProxyOutcome>`, the whole
  policy behind injected `getSessionUser` / `readBody` / `fetchUpstream` / `logError`. No h3
  imports, so `tests/proxyHandler.test.ts` covers auth ordering, both gates, header wiring,
  body handling, redirect refusal, error classification and status pass-through as ordinary
  unit tests that run in CI.
- `server/api/arbiter/[...].ts` — the imperative shell: read the h3 event, call `runProxy`,
  write the outcome back. No decisions of its own.

Error details are written with `process.stderr.write` rather than a logger, because no logger
utility exists in this codebase yet; `utils/logger.ts` arrives with `silent-failure-elimination`
and this call site should move to it then.

### Measured coverage
`pnpm test:coverage` on this branch: lines 45.36 / statements 45.36 / functions 59.33 /
branches 83.15. `server/utils/proxyHandler.ts` is at 100 % on all four metrics;
`server/utils/proxyPolicy.ts` is at 98.33 / 97.18 / 100 / 98.33 (the two uncovered lines are the
`new URL` catch, unreachable by construction and kept as a degrade-to-404 guard). Thresholds
ratcheted to 43 / 43 / 57 / 81.

`server/api/arbiter/[...].ts` still reports 0 % here, and that is expected: it is exercised by
the end-to-end suite, which runs the built server in a separate process where v8 coverage cannot
see it. It is not untested — see below.

### Testing strategy
Three layers, each covering what the one below cannot.

1. **Policy (pure).** `tests/proxyPolicy.test.ts` imports `../server/utils/proxyPolicy` directly
   — no Nitro/h3 runtime, so the module must contain **no** auto-imported h3 helpers; it takes
   plain `Record<string, string | undefined>` / `Headers` inputs.
2. **Pipeline (injected dependencies).** *Added in review round 1.* `tests/proxyHandler.test.ts`
   drives `runProxy`, so every ordering and wiring decision — auth before the method and path
   gates, header allowlisting, body handling, redirect refusal, error classification — runs on
   every push.
3. **Route (end to end).** *Added in review round 1, second pass.* `tests/e2e/proxy.e2e.test.ts`
   spawns the built server plus a mock upstream and drives it over a raw `node:http` socket.
   The raw socket is the point: `fetch`/undici resolves `..` client-side, so an attack path has
   to be written verbatim onto the wire to be tested at all. This layer exists because layers 1
   and 2 cannot see how Nitro parses and decodes the request line — the assumption that got that
   wrong survived a full green run of both (see "Implementation note — path traversal").
   It asserts, against what the upstream actually received and what the browser actually got
   back: no traversal shape reaches upstream, rejection reasons do not leak, every encoding a
   correct client produces arrives byte-for-byte, an upstream redirect is refused without the
   named origin ever being contacted, an unauthenticated request never reaches upstream, the
   whole response body is relayed, request bodies survive on `POST`/`PATCH`/`DELETE`, and
   `X-API-Key` / `User-Agent` / dropped `cookie` are as specified.

4. **Mutation check.** *Added in review round 2.* A green layer-3 run shows the proxy works; it
   does not show the suite would notice a control being deleted. Round 2 found four it would not
   have noticed: the redirect refusal, the auth gate, the response-body pipeline and the
   request-body relay were all invisible, because every case was an authenticated `GET` against
   an upstream that never redirected and whose body nobody read.
   `scripts/proxy-mutation-check.mjs` (`pnpm test:e2e:mutation`) deletes each control from the
   built shell chunk in turn and requires the suite to fail. All four are killed. A fifth
   mutant — reading `req.url` instead of `originalUrl` — is recorded as provably equivalent
   under Nitro's root mounting, so the script asserts it *survives* rather than pretending
   otherwise.

Layer 3 needs `.output/`, so it is excluded from `pnpm test` / `pnpm test:coverage` and has its
own config and script (`pnpm test:e2e`, `vitest.e2e.config.ts`). CI runs it as a step directly
after `pnpm build`, and the mutation check as a step after that.

Every AC that describes proxy behaviour is now automated. The one AC still unticked,
AC-2.11, is a manual smoke test of every page against the *real* backend -- it is about backend
behaviour rather than proxy routing, and no local suite can stand in for it.

## Acceptance Criteria
See `tasks.md`.
