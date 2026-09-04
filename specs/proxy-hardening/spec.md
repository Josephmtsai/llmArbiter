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
4. **Path allowlist** — first path segment must be one of `analyze`, `decisions`, `config`, `cases`, `evaluate`, `eval-pool`, `review-queue`, `optimizer`, `health` (every endpoint used in `composables/useApi.ts`). Non-listed → `404`. Paths containing `..` or `//` → `404` before allowlist lookup. Empty wildcard → `404`.
5. **Upstream timeout** — `AbortSignal.timeout(30_000)`. Timeout → `504` with message `upstream-timeout`. Other network failure → `502` with message `upstream-unreachable: <cause>` where `<cause>` is the underlying error message with the API key redacted (defensive; the key should never appear, but the redaction is a hard guarantee).
6. **Query serialization** — keys whose value is `null`/`undefined` are skipped (not sent as `key=`). Array values are flattened to repeated keys; `null`/`undefined` array items are skipped.
7. **Pure policy module** — `server/utils/proxyPolicy.ts` exports the allowlist checks, header filtering, query serialization, error classification and secret redaction as side-effect-free functions with Vitest coverage in `tests/proxyPolicy.test.ts`.

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
3. `validateProxyPath(wildcard)` → else `404`. Rejects empty, `..`, `//`, or first segment not in `ALLOWED_PATH_PREFIXES`. Match is **segment-based** (`health` ok, `healthz` not).
4. `serializeQuery(getQuery(event))` → query string with null/undefined skipped.
5. `pickForwardHeaders(getRequestHeaders(event))` → `{ 'content-type'?, accept? }`, then add `X-API-Key`.
6. Body: `readRawBody(event, false)` only for `POST | PATCH | DELETE` (the same payload-method set h3 uses today).
7. `$fetch.raw(url, { method, headers, body, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS), responseType: 'stream', ignoreResponseError: true, retry: 0 })` inside `try/catch`.
   - `catch` → `classifyUpstreamError(err, apiKey)` returns `{ statusCode: 504, message: 'upstream-timeout' }` or `{ statusCode: 502, message: 'upstream-unreachable: ' + redactSecret(cause, apiKey) }` → `throw createError(...)`.
   - `$fetch` (ofetch) is used instead of global `fetch` to comply with CLAUDE.md §3 ("API 呼叫統一透過 `useFetch` / `$fetch`"). `retry: 0` is set explicitly because ofetch retries idempotent requests on retryable 5xx by default, which would double the effective timeout and re-issue requests to an already-slow upstream. `ignoreResponseError: true` keeps upstream 4xx/5xx as pass-through status codes instead of thrown errors.
8. `setResponseStatus(event, sanitizeStatusCode(res.status, 502))`, `setResponseHeaders(event, pickResponseHeaders(res.headers))` (only `content-type`), then `return sendStream(event, res.body)`; if `res.body` is null, `return null`.

Behaviour preserved from today: upstream status codes pass through unchanged (e.g. backend `422` reaches the browser as `422`); response body is streamed; request body is buffered.

### Error-message safety
`createError({ statusCode, message })` messages are visible to the browser. The 504 message is a fixed string. The 502 message includes the underlying error message (e.g. `fetch failed`, `ECONNREFUSED …`) which may contain the upstream base URL but never the key; `redactSecret` replaces any occurrence of `config.apiKey` with `[redacted]` as a hard guarantee. `cause` is **not** attached to the thrown error (Nitro may serialize it in dev).

### Testing strategy
All policy logic is pure → `tests/proxyPolicy.test.ts` imports `../server/utils/proxyPolicy` directly (no Nitro/h3 runtime needed; the module must therefore contain **no** auto-imported h3 helpers — it takes plain `Record<string, string | undefined>` / `Headers` inputs). The route file itself is glue and is verified via the manual AC in `tasks.md` Task 2.

## Acceptance Criteria
See `tasks.md`.
