# codex adversarial review — proxy-hardening

Date: 2026-09-05  |  Reviewer: codex-cli 0.153.3 (default model, reasoning effort high)
Branch: feat/proxy-hardening  |  Base: main 7821674

## Findings

### 1. Critical — [server/api/arbiter/\[...].ts:66](</D:/claude/llmArbiter-proxy/server/api/arbiter/[...].ts:66>)

Why: `ignoreResponseError: true` makes upstream 4xx/5xx responses bypass the catch/redaction path, after which line 77 streams their bodies unchanged. Redaction protects transport exceptions only, not error responses. This directly violates the rule that upstream error bodies must never expose the API key. [ofetch returns error responses normally when this option is enabled](https://github.com/unjs/ofetch/blob/v1.5.1/src/fetch.ts#L224-L238).

Scenario: an upstream responds `500` with `{"debug":"X-API-Key: SECRET"}`. The authenticated browser receives `SECRET` verbatim.

### 2. Major — [server/api/arbiter/\[...].ts:56](</D:/claude/llmArbiter-proxy/server/api/arbiter/[...].ts:56>)

Why: redirects are followed automatically, with no `redirect: 'manual'/'error'` or final-origin check. On a cross-origin redirect, Undici removes `authorization`, `proxy-authorization`, `cookie`, and `host`, but does not remove the custom `X-API-Key` header. [Undici’s redirect implementation confirms this](https://github.com/nodejs/undici/blob/v6.19.8/lib/web/fetch/index.js#L1196-L1207).

Scenario: an upstream endpoint returns `302 Location: https://attacker.example/capture`; the follow-up request sends the server API key to the attacker-controlled origin.

### 3. Major — [server/utils/proxyPolicy.ts:70](</D:/claude/llmArbiter-proxy/server/utils/proxyPolicy.ts:70>)

Why: traversal detection checks only literal `..`, while h3 supplies undecoded router parameters by default. Percent-encoded dot segments therefore pass validation, then the URL parser canonicalizes them before transmission. The [URL Standard treats `%2e%2e` as a double-dot segment](https://url.spec.whatwg.org/#url-path-segment).

Scenario: authenticated `GET /api/arbiter/health/%2e%2e/admin` validates under the allowed `health` prefix, but `$fetch` constructs a request to upstream `/admin`. Mixed forms such as `.%2e` work as well.

### 4. Major — [server/api/arbiter/\[...].ts:74](</D:/claude/llmArbiter-proxy/server/api/arbiter/[...].ts:74>)

Why: the error-classification catch ends once response headers arrive. Status `200` is then committed before `sendStream`. If the response body later times out or the upstream socket fails, the stream rejection bypasses `classifyUpstreamError`, and a 504 can no longer be returned.

Scenario: upstream immediately sends `200` headers and one body chunk, then stalls for 31 seconds. The browser receives a partial/broken `200`, not the promised `504 upstream-timeout`.

### 5. Major — [server/api/arbiter/\[...].ts:77](</D:/claude/llmArbiter-proxy/server/api/arbiter/[...].ts:77>)

Why: h3 1.15’s Web-stream `sendStream` path neither cancels the upstream stream when the browser disconnects nor honors `ServerResponse.write()` backpressure. Its writable callback returns immediately regardless of the write result. [Relevant h3 implementation](https://github.com/h3js/h3/blob/v1.15.11/src/utils/response.ts#L370-L403).

Scenario: authenticated clients request a large response and disconnect or read very slowly. The proxy continues downloading and buffering upstream data—potentially hundreds of megabytes per request—until completion or the 30-second signal fires.

### 6. Major — [server/api/arbiter/\[...].ts:51](</D:/claude/llmArbiter-proxy/server/api/arbiter/[...].ts:51>)

Why: every request-body read failure is converted to `undefined`, after which the upstream request still executes. A failed or aborted client upload must not silently become a bodyless mutation.

Scenario: a client begins `POST /api/arbiter/cases/seed` or a bodyless mutation such as prompt activation, then resets the upload so `readRawBody` rejects. The proxy swallows the failure and performs the upstream mutation after the client has disconnected.

### 7. Major — [vitest.config.ts:76](</D:/claude/llmArbiter-proxy/vitest.config.ts:76>)

Why: the generated coverage report records the entire security-critical route at 0% for lines, statements, functions, and branches. Global 42–80% thresholds still pass because unrelated frontend coverage masks it. The 100% claim applies only to isolated helpers and does not prove auth ordering, header wiring, redirects, error-body handling, retry settings, timeout behavior, or streaming.

Concrete failing scenario: delete the session gate, pass `getRequestHeaders(event)` directly to `$fetch`, and remove `retry: 0`; every committed policy test still passes. Likewise, the undefined-query test at [tests/proxyPolicy.test.ts:98](</D:/claude/llmArbiter-proxy/tests/proxyPolicy.test.ts:98>) is synthetic: `getQuery` cannot produce `undefined`, and [useApi.ts:63](</D:/claude/llmArbiter-proxy/composables/useApi.ts:63>) removes it before making the request. A route that forwards an actual `action=` unchanged would still pass that test.

### 8. Minor — [server/utils/proxyPolicy.ts:185](</D:/claude/llmArbiter-proxy/server/utils/proxyPolicy.ts:185>)

Why: non-timeout failures expose the raw cause message to the browser. API-key replacement does not prevent disclosure of internal hostnames, IP addresses, ports, or TLS/configuration details; the test at line 227 explicitly enshrines this behavior.

Scenario: a cause message of `connect ECONNREFUSED 10.0.7.12:8000` is returned as `upstream-unreachable: connect ECONNREFUSED 10.0.7.12:8000`.

VERDICT: no-ship
