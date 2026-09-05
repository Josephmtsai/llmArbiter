# Tasks: Proxy Hardening

## Feature ID
`proxy-hardening`

---

## Task 1 — Pure policy module
**File:** `server/utils/proxyPolicy.ts` (new)

This file must be **pure**: no h3 / Nitro auto-imports, no `useRuntimeConfig`, no I/O. It is imported directly by Vitest.

```typescript
export const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'] as const
export type AllowedMethod = (typeof ALLOWED_METHODS)[number]

export const PAYLOAD_METHODS: ReadonlySet<AllowedMethod> = new Set(['POST', 'PATCH', 'DELETE'])

export const ALLOWED_PATH_PREFIXES = [
  'analyze',
  'decisions',
  'config',
  'cases',
  'evaluate',
  'eval-pool',
  'review-queue',
  'optimizer',
  'health',
] as const

export const FORWARD_REQUEST_HEADERS = ['content-type', 'accept'] as const
export const FORWARD_RESPONSE_HEADERS = ['content-type'] as const
export const UPSTREAM_TIMEOUT_MS = 30_000

export function isAllowedMethod(method: string): method is AllowedMethod
// case-sensitive; h3 `event.method` is already upper-case.

export type PathValidation =
  | { ok: true; path: string }              // path is '/' + wildcard (no query)
  | { ok: false; reason: 'empty' | 'traversal' | 'double-slash' | 'not-allowed' }
export function validateProxyPath(wildcard: string): PathValidation
// - '' → empty
// - contains '..' → traversal
// - contains '//' → double-slash
// - first segment (before first '/') not in ALLOWED_PATH_PREFIXES → not-allowed
// - order of checks: empty → traversal → double-slash → allowlist
// - leading slash in wildcard is NOT expected (h3 router param has none); if present, treat as double-slash after prefixing.

export type QueryInput = Record<string, unknown>
export function serializeQuery(query: QueryInput): string
// - null / undefined values skipped
// - arrays flattened to repeated keys; null / undefined items skipped
// - other values: String(v)
// - returns '' when nothing remains (caller adds '?')
// - encoding via URLSearchParams

export function pickForwardHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string>
// - input keys compared lower-case
// - keeps only FORWARD_REQUEST_HEADERS; string[] joined with ', '
// - never returns cookie / authorization / referer / user-agent / host

export function pickResponseHeaders(headers: Headers): Record<string, string>
// - keeps only FORWARD_RESPONSE_HEADERS; never set-cookie / content-length / content-encoding

export function redactSecret(message: string, secret: string): string
// - replaces every occurrence of `secret` with '[redacted]'; empty secret → message unchanged

export interface UpstreamFailure { statusCode: 502 | 504; message: string }
export function classifyUpstreamError(error: unknown, secret: string): UpstreamFailure
// - error (or error.cause) has name === 'TimeoutError' or name === 'AbortError' → { 504, 'upstream-timeout' }
// - otherwise → { 502, 'upstream-unreachable: ' + redactSecret(msg, secret) }
//   where msg = error.cause?.message ?? error.message ?? 'unknown'
```

### AC
- [x] AC-1.1: Given `'PUT'` / `'HEAD'` / `'OPTIONS'` / `'get'` When `isAllowedMethod` is called Then it returns `false`; Given `'GET'|'POST'|'PATCH'|'DELETE'` Then `true`.
- [x] AC-1.2: Given wildcard `'decisions/stats'` When `validateProxyPath` is called Then `{ ok: true, path: '/decisions/stats' }`.
- [x] AC-1.3: Given `'health'` Then ok; Given `'healthz'` Then `{ ok: false, reason: 'not-allowed' }`; Given `'admin/users'` Then `not-allowed`.
- [x] AC-1.4: Given `'cases/../config'` Then `reason: 'traversal'`; Given `'cases//1'` Then `reason: 'double-slash'`; Given `''` Then `reason: 'empty'`.
- [~] AC-1.5: **Superseded in review round 2.** `serializeQuery` is deleted; the query is relayed byte for byte (see AC-6.4). Object-shaped query input no longer exists, so there is nothing to serialize. See the delta note under Task 6.
- [~] AC-1.6: **Superseded in review round 2**, same reason as AC-1.5.
- [x] AC-1.7: Given `{ cookie: 'nuxt-session=x', authorization: 'Bearer y', referer: 'https://z', 'user-agent': 'UA', 'content-type': 'application/json', accept: 'application/json', host: 'localhost' }` When `pickForwardHeaders` is called Then result equals exactly `{ 'content-type': 'application/json', accept: 'application/json' }`.
- [x] AC-1.8: Given upstream `Headers` containing `set-cookie`, `content-type`, `content-length`, `x-powered-by` When `pickResponseHeaders` is called Then result equals exactly `{ 'content-type': <value> }`.
- [x] AC-1.9: Given `new DOMException('x', 'TimeoutError')` (and an `Error` whose `cause` is that DOMException) When `classifyUpstreamError` is called Then `{ statusCode: 504, message: 'upstream-timeout' }`.
- [x] AC-1.10: Given `new Error('fetch failed https://api?key=SECRET')` with secret `'SECRET'` Then `{ statusCode: 502, message: 'upstream-unreachable: fetch failed https://api?key=[redacted]' }`.
- [x] AC-1.11: `pnpm vue-tsc --noEmit` passes; no `any`, no `console.log`.

---

## Task 2 — Rewrite the proxy route
**File:** `server/api/arbiter/[...].ts`

Replace the `proxyRequest` call with the Option C pipeline from `spec.md`. Reference shape (Developer may adjust names, not ordering):

```typescript
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const method = event.method
  if (!isAllowedMethod(method)) {
    setResponseHeader(event, 'Allow', ALLOWED_METHODS.join(', '))
    throw createError({ statusCode: 405, message: 'Method Not Allowed' })
  }

  const validated = validateProxyPath(getRouterParam(event, '_') ?? '')
  if (!validated.ok) {
    throw createError({ statusCode: 404, message: 'Not Found' })
  }

  const config = useRuntimeConfig(event)
  const apiKey = config.apiKey as string
  const base = (config.apiBaseUrl as string).replace(/\/$/, '')
  const query = serializeQuery(getQuery(event))
  const url = `${base}${validated.path}${query ? '?' + query : ''}`

  const headers: Record<string, string> = {
    ...pickForwardHeaders(getRequestHeaders(event)),
    'X-API-Key': apiKey,
  }
  const body = PAYLOAD_METHODS.has(method)
    ? await readRawBody(event, false).catch(() => undefined)
    : undefined

  let upstream: Awaited<ReturnType<typeof $fetch.raw<ReadableStream | null>>>
  try {
    upstream = await $fetch.raw(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      responseType: 'stream',
      ignoreResponseError: true,
      retry: 0,
    })
  } catch (error) {
    const failure = classifyUpstreamError(error, apiKey)
    throw createError({ statusCode: failure.statusCode, message: failure.message })
  }

  setResponseStatus(event, sanitizeStatusCode(upstream.status, 502))
  setResponseHeaders(event, pickResponseHeaders(upstream.headers))
  if (!upstream.body) return null
  return sendStream(event, upstream.body)
})
```

Notes for Developer:
- `sanitizeStatusCode`, `sendStream`, `setResponseHeaders`, `readRawBody`, `getRequestHeaders` are h3 exports auto-imported by Nitro.
- Do **not** attach `cause` to the thrown `createError` (it may be serialized to the browser in dev).
- Do **not** log request headers or the URL with a logger; if you log, log only `method`, `validated.path`, `statusCode`.
- The `ofetch` `$fetch.raw` typing for `responseType: 'stream'` may need a small generic; use `// @ts-expect-error` **with a comment** only if truly required (CLAUDE.md §2).

### AC
- [x] AC-2.1: Given an unauthenticated browser When it calls `GET /api/arbiter/health` Then response is `401` (unchanged behaviour).
- [x] AC-2.2: Given an authenticated session When the browser calls `PUT /api/arbiter/cases/1` Then response is `405` with header `Allow: GET, POST, PATCH, DELETE`, and the upstream is never contacted.
- [x] AC-2.3: Given an authenticated session When the browser calls `GET /api/arbiter/admin/users` Then `404`; When it calls `GET /api/arbiter/cases/../config/provider` or `GET /api/arbiter/cases//1` Then `404`; the upstream is never contacted in all three cases.
- [x] AC-2.4: Given an authenticated session with a `nuxt-session` cookie and a custom `Authorization: Bearer test` header When the browser calls `GET /api/arbiter/health` Then the upstream request (captured via a local mock server, e.g. `NUXT_API_BASE_URL=http://127.0.0.1:<port>`) contains `x-api-key`, `accept` and no `cookie`, `authorization`, `referer`, `user-agent`.
- [x] AC-2.5: Given the upstream mock responds `200` with `Set-Cookie: evil=1` and `Content-Type: application/json` When the browser calls any allowed path Then the browser response has `content-type: application/json` and **no** `set-cookie` header.
- [x] AC-2.6: Given the upstream mock responds `422` with a JSON body When the browser calls `POST /api/arbiter/analyze` Then the browser receives `422` and the same JSON body (status/body passthrough preserved).
- [x] AC-2.7: Given the upstream mock sleeps longer than 30 s When the browser calls `GET /api/arbiter/health` Then the response is `504` with `message: 'upstream-timeout'` at ~30 s.
- [x] AC-2.8: Given `NUXT_API_BASE_URL` points to a closed port When the browser calls `GET /api/arbiter/health` Then the response is `502`, its message starts with `upstream-unreachable:`, and the response body does not contain the value of `NUXT_API_KEY`.
- [x] AC-2.9: Given the browser calls `GET /api/arbiter/decisions?limit=20&action=` via `useApi().getDecisions({ limit: 20, action: undefined })` When the upstream mock records the URL Then it is `/decisions?limit=20` (no `action=`). **Round 2 note:** still true, but no longer because the proxy strips it. The proxy now relays the query verbatim; the key never reaches it, because `getDecisions` filters `v != null` itself and ofetch/ufo `withQuery` drops `undefined` values client-side (measured). See the delta note under Task 6.
- [x] AC-2.10: Given `POST /api/arbiter/cases` with a JSON body When forwarded Then the upstream receives the identical body and `content-type: application/json`.
- [ ] AC-2.11 (NOT VERIFIED - see note below): All existing pages (`/analyze`, `/decisions`, `/settings`, `/cases`, `/evaluate`, optimizer history, sidebar health check) continue to work against the real backend — no regressions in manual smoke test.
- [x] AC-2.12: `pnpm lint`, `pnpm vue-tsc --noEmit`, `pnpm test` all pass.

---

## Task 3 — Vitest tests for the policy module
**File:** `tests/proxyPolicy.test.ts` (new)

Import via relative path (`../server/utils/proxyPolicy`) exactly like `tests/optimizerState.test.ts` does for `utils/`. Cover every AC in Task 1 (AC-1.1 → AC-1.10) with at least one `it` each; group with `describe('proxyPolicy — <function>')`.

Minimum test list:
- `isAllowedMethod`: allowed 4, rejected `PUT`/`HEAD`/`OPTIONS`/lower-case `get`.
- `validateProxyPath`: every allowed prefix returns ok (loop over `ALLOWED_PATH_PREFIXES`); `healthz`, `admin`, `''`, `..`, `//`, leading `/`.
- `serializeQuery`: undefined/null skipped, arrays flattened with null items skipped, numbers stringified, encoding of spaces/`&`.
- `pickForwardHeaders`: strips the four forbidden headers + `host`; keeps the two allowed; handles `string[]`; is case-insensitive on input keys.
- `pickResponseHeaders`: strips `set-cookie`, `content-length`, `content-encoding`; keeps `content-type`.
- `redactSecret`: single and multiple occurrences; empty secret no-op.
- `classifyUpstreamError`: `TimeoutError` DOMException, `AbortError`, nested in `cause`, plain `Error`, non-Error value (`'boom'`).

### AC
- [x] AC-3.1: Given `pnpm test` When run Then `tests/proxyPolicy.test.ts` passes with 0 failures.
- [x] AC-3.2: Given `pnpm test:coverage` When run Then `server/utils/proxyPolicy.ts` reports ≥ 90 % line coverage.
- [x] AC-3.3: The test file imports nothing from `h3` or `#imports`.

---

## Verification notes (Developer, 2026-09-05)

Gates on `feat/proxy-hardening`:

| Gate | Result |
|---|---|
| `pnpm lint:check` | 0 errors, 10 pre-existing `vue/no-static-inline-styles` warnings |
| `pnpm vue-tsc` | clean |
| `pnpm test:coverage` | 11 files, 165 tests passed; thresholds met |
| `pnpm build` | complete |

Runtime AC (AC-2.1 → AC-2.10) were verified against a local mock upstream that records every
request it receives, with the production build (`node .output/server/index.mjs`) and a real
logged-in session cookie. All ten passed. Evidence highlights:

- AC-2.4 upstream headers: `host, connection, accept, x-api-key, user-agent, accept-language,
  sec-fetch-mode, accept-encoding` — no `cookie`, `authorization` or `referer`, and
  `user-agent: arbiter-proxy` rather than the probe's `ACProbe/1.0`.
- AC-2.7 returned `504 upstream-timeout` after 30.0 s.
- AC-2.8 returned `502 upstream-unreachable: fetch failed`; the API key does not appear in
  the response body.

**AC-2.11 is deliberately left unticked.** It requires a manual smoke test of every page
against the real backend, and this worktree's `.env` holds only `NUXT_SESSION_PASSWORD` — no
`NUXT_API_KEY` or `NUXT_API_BASE_URL` — so the real backend cannot be reached from here (it
answers `401` without a key). QA must run it.

As the closest available substitute, all 26 endpoint paths reached from `composables/useApi.ts`
were probed through the rebuilt proxy against the mock. Every one passed the new path
allowlist (`200`, or `422` for `/analyze` where the mock answers `422` by design), so the
allowlist introduces no routing regression. What remains unverified for AC-2.11 is real
backend behaviour, not proxy routing.

---

## Task 4 — Pipeline tests for the request core (added in review round 1)

`server/api/arbiter/[...].ts` was split: the policy pipeline moved to
`server/utils/proxyHandler.ts` (`runProxy`, plain injected dependencies), leaving the route file
as an imperative h3 shell. `tests/proxyHandler.test.ts` covers the pipeline without booting
Nitro.

### Acceptance Criteria

- [x] AC-4.1: `runProxy` returns `401` before evaluating the method or path gate, and never calls
      `fetchUpstream`, when `getSessionUser` resolves to `undefined`.
- [x] AC-4.2: A disallowed method returns `405` with `Allow: GET, POST, PATCH, DELETE`.
- [x] AC-4.3: Every rejected path returns a bare `404`; the rejection reason is passed to
      `logError` and appears nowhere in the outcome.
- [x] AC-4.4: The upstream request carries `X-API-Key` and `User-Agent: arbiter-proxy`, and
      carries no `cookie`, `authorization`, `referer` or browser `user-agent`.
- [x] AC-4.5: A `readBody` rejection returns `400 Invalid Request Body` and does **not** forward
      an empty body; a non-`Error` rejection is logged via `String(error)` without crashing.
- [x] AC-4.6: A `TimeoutError` / `AbortError` maps to `504 upstream-timeout`, anything else to
      `502 upstream-unreachable`; the detail is logged and the API key is redacted from it.
- [x] AC-4.7: Any upstream 3xx returns `502` and is neither followed nor relayed.
- [x] AC-4.8: An upstream status outside 200–599 collapses to `502` rather than crashing.
- [x] AC-4.9: With no `createTimeoutSignal` injected, the real default produces a live
      `AbortSignal` (the production path is executed, not only the test double).
- [x] AC-4.10: `server/utils/proxyHandler.ts` reports 100 % lines / statements / branches /
      functions under `pnpm test:coverage`.

---

## Task 5 — End-to-end route test (added in review round 1, second pass)

The route file itself had no automated coverage, and that gap hid a real defect: the handler was
written against the assumption that Nitro hands the catch-all wildcard over percent-encoded. It
does not — it decodes with `decodeURI` semantics. Both unit layers stayed green while
`/api/arbiter/config/rules/my%20rule` 404'd.

`tests/e2e/proxy.e2e.test.ts` spawns the **built** server (`.output/server/index.mjs`) plus a
mock upstream and drives it over a raw `node:http` socket, because `fetch`/undici resolves `..`
client-side and would make every traversal case vacuous. It needs `pnpm build`, so it is
excluded from `pnpm test` / `pnpm test:coverage` and has its own config
(`vitest.e2e.config.ts`) and script (`pnpm test:e2e`).

### Acceptance Criteria

- [x] AC-5.1: Written verbatim onto the wire, none of `health/%2e%2e/admin`, `health/.%2e/admin`,
      `health/%2E%2E/admin`, `health/%2e%2e/%2e%2e/admin`, `cases/../config/provider`,
      `health/..%2fadmin`, `health/.` or `admin/users` returns anything but `404`, and the mock
      upstream records no request for any of them.
- [x] AC-5.2: A `404` body contains neither `not-allowed` nor `traversal`.
- [x] AC-5.3: `GET /api/arbiter/config/rules/my%20rule` returns `200` and the upstream receives
      `/config/rules/my%20rule`. **Amended in round 2:** the encoding is no longer decoded and
      re-encoded — the raw bytes are carried straight through. Extended to `a%3Fb`,
      `rate%25limit` and `a%23b`, each of which round 2 found broken (AC-6.1).
- [x] AC-5.4: `GET /api/arbiter/health` reaches the upstream as `/health`;
      `GET /api/arbiter/decisions?limit=5` as `/decisions?limit=5`.
- [x] AC-5.5: Every request the upstream received carries `x-api-key`, carries no `cookie`, and
      carries exactly `user-agent: arbiter-proxy`.
- [x] AC-5.6: `pnpm test:e2e` runs in CI as its own step directly after `pnpm build`
      (`.github/workflows/ci.yml`).
- [x] AC-5.7: The suite is non-vacuous: with the traversal and `not-normalized` guards deleted
      from the built bundle, 7 of the 8 AC-5.1 cases fail. Re-verified green after restoring.
      **Round 2 found this claim too narrow** — it covered the path guard only, and four other
      controls were uncovered. Superseded by AC-6.7, which automates the check.

---

## Task 6 — Review round 2 corrections

Round 2 rejected the round-1 implementation (`no-ship`) on four findings. Two were live defects
in the proxy, two were gaps in what the tests could prove.

**Finding 1 — the router parameter is not the request path.** h3 decodes the path half of the
raw URL with ufo's `decodePath` (`decodeURIComponent` semantics, only `%2F` and `%25` protected)
*before* the router splits it. Measured against `.output/`, three legitimate inputs broke:
`config/rules/a%3Fb` proxied to `/config/rules/a` with a **200** — the wrong resource, silently —
while `rate%25limit` and `a%23b` 404'd. No check placed after that split can recover the lost
bytes, so the handler now reads `event.node.req.originalUrl` and does its own `?` split
(`validateProxyTarget`). `validateProxyPath` validates the raw, undecoded wildcard.

**Finding 2 — a refused redirect leaked its body.** A manual-redirect response still carries a
live body, and the streaming path that would drain it never runs for a 3xx. The socket stayed
occupied until GC or the 30 s signal, so a redirect loop could drain the connection pool while
every request got a prompt 502. The body is now cancelled before returning.

**Finding 3 — the e2e suite was vacuous for four controls.** See AC-6.7.

**Finding 4 — the e2e port reservation raced.** See AC-6.8.

**Additional, not from the report.** `health/%2F%2E%2E/admin` survives the parser-identity check
byte-for-byte, because the WHATWG parser will not treat a reserved `%2F` as a separator — yet an
upstream that decodes the whole target lands on `/health/../admin`. An explicit `%2E` rejection
now covers it, with tests that assert the parser really does leave those inputs alone.

**Behaviour delta to be aware of.** Dropping `serializeQuery` removes a server-side
normalisation that was doing real work for two shapes ufo's `withQuery` handles differently:
a `null` value becomes a bare key (`{since: null}` → `?since`) and an `undefined` *inside an
array* becomes the literal string (`{action: ['a', undefined, 'b']}` → `?action=a&action=undefined&action=b`).
Both were measured against the installed ufo. Neither reaches the proxy from this codebase
today — `getDecisions` filters `v != null` itself, the remaining callers pass typed optional
params, and ofetch drops `undefined` values client-side — and re-adding a server-side rewrite
of the query is what caused finding 1, so the verbatim relay stands. Recorded here rather than
silently dropped.

### Acceptance Criteria

- [x] AC-6.1: Written verbatim onto the wire, each of `config/rules/a%3Fb`,
      `config/rules/rate%25limit`, `config/rules/a%23b`, `config/rules/my%20rule` and
      `decisions?q=a%20b` returns `200` and reaches the upstream byte-for-byte unchanged.
- [x] AC-6.2: `validateProxyTarget('/api/arbiter/config/rules/a%3Fb')` yields
      `{ ok: true, path: '/config/rules/a%3Fb', query: '' }` — the encoded `?` stays in the path.
      The split is on the **first** `?` only; later ones stay in the query.
- [x] AC-6.3: A target not under `/api/arbiter/` is refused as `malformed` rather than guessed at.
- [x] AC-6.4: A query is relayed byte for byte: `?tag=a%20b&tag=c&empty=&flag` arrives at the
      upstream exactly as written.
- [x] AC-6.5: `health/%2E%2E/admin`, `health/%2F%2E%2E%2Fadmin` and `health/%2F%2E%2E/admin` are
      rejected as `traversal`, and the tests assert the URL parser leaves the last two intact —
      so the rule is shown to be load-bearing rather than redundant.
- [x] AC-6.6: A refused upstream 3xx cancels the response body (`body.locked === false`,
      `cancel` called once), still returns `502` when `cancel` rejects, and does not throw when
      the 3xx has no body.
- [x] AC-6.7: `pnpm test:e2e:mutation` deletes each of `redirect: 'manual'`, the session gate,
      the response-body pipeline and the request-body reader from the built shell chunk in turn,
      and the e2e suite fails on every one. A fifth mutant (`req.url` for `originalUrl`) is
      asserted to survive, with the h3 source reason recorded in the script. Runs in CI as a
      step after the e2e one.
- [x] AC-6.8: The e2e harness no longer assumes its reserved port is still free when the app
      starts: a failed bind is retried on a fresh port up to 5 times, and any other start-up
      failure is reported with the server log. (`PORT=0` is not usable — Nitro reads it as falsy
      and binds 3000.)
- [x] AC-6.9: `pnpm lint:check`, `pnpm vue-tsc`, `pnpm test:coverage`, `pnpm build`,
      `pnpm test:e2e` and `pnpm test:e2e:mutation` all pass.
