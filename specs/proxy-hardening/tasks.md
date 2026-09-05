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
- [x] AC-1.5: Given `{ limit: 20, action: undefined, since: null }` When `serializeQuery` is called Then result is `'limit=20'` (no `action=` / `since=`).
- [x] AC-1.6: Given `{ action: ['a', undefined, 'b'] }` Then `'action=a&action=b'`; Given `{}` Then `''`.
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
- [x] AC-2.9: Given the browser calls `GET /api/arbiter/decisions?limit=20&action=` via `useApi().getDecisions({ limit: 20, action: undefined })` When the upstream mock records the URL Then it is `/decisions?limit=20` (no `action=`).
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
