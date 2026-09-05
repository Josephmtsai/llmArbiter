# Round 3 adversarial review

The branch is shippable. All security-significant round-2 defects are fixed. The remaining issues are low-impact test-infrastructure residuals, not production blockers.

Review was read-only. I inspected the existing built chunk but did not rerun build/tests because those commands write `.output` and caches.

## Part A — Round-2 findings

### 1. codex-2-1 — FIXED

Evidence:

- The shell reads `event.node.req.originalUrl` at [route shell:26](</D:/claude/llmArbiter-proxy/server/api/arbiter/[...].ts:26>).
- Installed h3 1.15.11 assigns `originalUrl` before `onRequest` and before iterating any layer, while rewriting `req.url` per layer.
- [validateProxyTarget](</D:/claude/llmArbiter-proxy/server/utils/proxyPolicy.ts:184>) splits the first literal `?`, validates the raw path, and preserves the remaining query.
- `%3F`, `%23`, `%25`, and `%2F` remain encoded path data; raw `#`, backslash, controls, malformed escapes, traversal, and parser-normalized paths are refused.
- Existing end-to-end cases confirm `%3F`, `%23`, `%25`, and ordinary queries reach the upstream correctly.

Environment assessment:

- Dev and built Nitro use the same locked h3 1.15.11 behavior.
- The project has no configured Nuxt base path or rewrite rules.
- A future base path or pre-handler rewrite could make the hardcoded mount mismatch, but that fails closed with 404.
- Absolute-form, asterisk-form, authority-form, empty, and fragment-bearing targets cannot pass the mount/path validation; some will be rejected by routing even earlier.
- HTTP/2 or Railway termination changes how the target arrives at Node, but h3 still captures the adapter-provided `req.url` before its layers. No downstream code can recover bytes removed by an external reverse proxy, but no such path rewrite exists here.

One harmless non-verbatim corner remains: `/health?` becomes `/health` because an empty query string does not cause the trailing `?` to be appended. FastAPI treats these equivalently.

### 2. codex-2-2 — FIXED

At [proxyHandler.ts:166](</D:/claude/llmArbiter-proxy/server/utils/proxyHandler.ts:166>), every 300–399 response enters the refusal branch and its body is cancelled at line 174. A rejected cancellation is contained by `.catch(() => undefined)`, so the 502 still returns.

Other paths do not leak an acquired body:

- 401, 405, 404, and body-read 400 occur before the upstream request.
- Fetch failures and timeouts do not return an upstream response.
- Non-2xx responses are intentionally streamed rather than short-circuited.
- Bodyless responses have nothing to release.
- Accepted bodies are handed to `pipeline`, which handles backpressure and downstream disconnect cancellation.

### 3. codex-2-3 — FIXED

The four mutations in [proxy-mutation-check.mjs:27](</D:/claude/llmArbiter-proxy/scripts/proxy-mutation-check.mjs:27>) are syntactically valid behavioral mutations, not build-breaking substitutions:

- M1 changes manual redirects to followed redirects.
- M2 replaces session lookup with a truthy user.
- M3 ends the response without piping its body.
- M4 makes the request-body reader return `undefined`.

Each anchor occurs exactly once in the inspected built chunk. An unmatched anchor is added to `failures`, so the script fails closed rather than counting it as killed. CI also runs the unmutated E2E suite immediately before mutation testing.

The mutation set is deliberately not exhaustive. It does not mutate the method gate, raw-target extraction into a decoded router parameter, header allowlists, `retry: 0`, timeout wiring, or redirect-body cancellation. Those have direct unit/E2E assertions, but not mutation proof. This does not invalidate the claimed fix for the four round-2 gaps.

### 4. codex-2-4 — PARTIAL, acceptable

[proxy.e2e.test.ts:191](</D:/claude/llmArbiter-proxy/tests/e2e/proxy.e2e.test.ts:191>) retries an `EADDRINUSE` startup on a fresh port up to five times.

The release-before-bind race still technically exists, so this is mitigation rather than elimination. Five independent collisions are implausible in the single CI job, and any non-collision startup failure is surfaced immediately with captured logs. This is an acceptable test-infrastructure residual.

### 5. self-2-5 — FIXED

[proxyPolicy.ts:139](</D:/claude/llmArbiter-proxy/server/utils/proxyPolicy.ts:139>) canonicalizes `%2e` to `%2E`, and line 150 rejects it. This specifically closes the parser-identity gap for reserved-slash forms such as `health/%2F%2E%2E/admin`.

Coverage of alternatives:

- Lowercase `%2e` is canonicalized and rejected.
- `%252E` decodes once to the literal text `%2E`, not a dot; exploiting it requires a second application-level decode, for which there is no evidence in this FastAPI path.
- Unicode dot-like characters are not URL dot segments.
- `%C0%AE` and other overlong UTF-8 encodings are invalid UTF-8, not alternate standards-compliant encodings of `.`.
- Literal `..` remains rejected.

The rule rejects encoded dots anywhere, including benign ones, but `encodeURIComponent` does not encode `.`, and ordinary dots inside a segment remain accepted. No current caller requires the rejected form.

## Part B — New-code assessment

### Raw target and path validation

No exploitable split or normalization bypass was found.

- Literal `%`, `%zz`, and truncated escapes are rejected.
- `%3F` and `%23` remain path data and cannot become delimiters in the shell.
- Literal `#`, `?`, backslash, controls, spaces, and non-ASCII input are rejected in the path.
- Encoded NUL, encoded backslash, semicolons, and invalid UTF-8 byte sequences can be forwarded as encoded data. They do not alter the outbound HTTP request boundary or escape the allowed first segment in this FastAPI/Linux deployment.
- Encoded `/` can change downstream segment structure after FastAPI decoding, but it cannot escape the allowed prefix without a dot-segment mechanism, and encoded/literal dots are blocked.
- Double encoding is not decoded by the proxy and is safe under the normal single-decoding ASGI pipeline.

### Verbatim query relay

The recorded behavior delta is acceptable.

`getDecisions` explicitly removes nullish values at [useApi.ts:61](</D:/claude/llmArbiter-proxy/composables/useApi.ts:61>); other query APIs use typed scalar option objects, and installed ufo drops top-level `undefined` values. No current production caller constructs an array containing `undefined`.

An authenticated caller can deliberately send bare keys, repeated keys, `action=undefined`, encoded controls, or malformed percent sequences. Relaying those as query data does not create request-line, header, origin, or path injection: raw controls, spaces, and `#` are rejected, while encoded forms stay inside the query. FastAPI remains responsible for query validation.

### Mutation script

One non-blocking issue remains:

#### R3-1 — Minor — interrupted mutation run can leave `.output` mutated

File: [scripts/proxy-mutation-check.mjs:85](</D:/claude/llmArbiter-proxy/scripts/proxy-mutation-check.mjs:85>)

The restoration at line 92 is not protected by `try/finally` or a signal handler. Normal test failures are caught and restored, and assertion failures occur only after restoration. An abrupt SIGINT, process termination, or machine shutdown between lines 85 and 92 can nevertheless leave the ignored built chunk containing the current mutant.

Concrete scenario: interrupt the script while M2 is running, then run `pnpm preview` without rebuilding; the local `.output` may contain the always-authenticated mutation. This cannot corrupt tracked source and cannot reach deployment because CI uses an ephemeral workspace and Railway performs a fresh build. It is an acceptable local-tooling residual.

### CI and E2E gating

The new checks genuinely gate:

- PRs and main pushes run build, baseline E2E, then mutation testing sequentially.
- A failing baseline prevents the mutation step.
- Deployment depends on the complete `verify` job.
- The E2E config selects only the proxy E2E suite, disables file parallelism, and supplies 30-second test and 180-second hook limits.
- Startup polling is bounded; all current mock responses are finite. No concrete CI hang was found.

## Deviations

- D1: Agree with the implementation. The standards wording is broader than necessary, but the relevant runtime fact is that Undici supplies a default User-Agent when omitted. Pinning `arbiter-proxy` prevents browser-UA disclosure and removes runtime variance.
- D2: Agree. A raw `node:http` request is necessary because Fetch normalizes literal dot segments before transmission.
- D4: Agree. A separate Node E2E configuration and CI step are justified because the suite targets built Nitro rather than jsdom source coverage.
- D5: Agree. The mutation script directly answers the previous vacuous-test finding, and its approximately five-suite cost is proportionate for this security boundary.

No changed application code violates the hard rules: no `any`, no `console.*`, no hardcoded secret, no secret under `runtimeConfig.public`, and the application proxy uses `$fetch.raw` rather than global `fetch` or axios.

VERDICT: ship
