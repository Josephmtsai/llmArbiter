# codex adversarial review — deploy-recovery, round 1

Branch: `feat/deploy-recovery` @ 4941896, base `main`.
Model: gpt-5.6-sol, reasoning effort high, sandbox read-only.
Date: 2026-09-05

## Findings

1. **Major — [server/api/auth/login.post.ts](/D:/claude/llmArbiter/server/api/auth/login.post.ts:9), [server/utils/auth.ts](/D:/claude/llmArbiter/server/utils/auth.ts:132), [tests/loginRoute.test.ts](/D:/claude/llmArbiter/tests/loginRoute.test.ts:184)** — The load-bearing rate limiter trusts the wrong end of Railway’s `X-Forwarded-For` chain. The implementation uses the rightmost entry, while current Railway guidance says its proxy places the reliable client address first/leftmost, even when a client supplies a forged header. The test hard-codes the opposite chain order and therefore gives false assurance. [Railway employee guidance](https://station.railway.com/questions/which-header-should-i-rely-on-for-real-c-d78a6f96)

   Concrete failing scenario: an attacker sends each request with a different valid-looking XFF value. Railway preserves the real address at the left while the code’s `pop()` selects the attacker-controlled rightmost value. Every request gets a fresh limiter bucket, permitting unrestricted password guesses. Ten thousand forged keys can additionally fill `DEFAULT_MAX_KEYS`, after which legitimate new clients receive 429s. The cap correctly fails closed and does not evict buckets, but it cannot repair the attacker-controlled key selection.

2. **Major — [server/api/health.get.ts](/D:/claude/llmArbiter/server/api/health.get.ts:11), [server/plugins/assert-config.ts](/D:/claude/llmArbiter/server/plugins/assert-config.ts:10), [nuxt.config.ts](/D:/claude/llmArbiter/nuxt.config.ts:8)** — The liveness-only endpoint can mark an unusable deployment healthy. `assert-config` validates only the two passwords; `apiKey` defaults to an empty string and `apiBaseUrl` is not validated. The endpoint’s claim that upstream checking could restart a live service is also incorrect for Railway: its healthcheck runs during deployment, not continuously. [Railway healthcheck documentation](https://docs.railway.com/deployments/healthchecks)

   Concrete failing scenario: `NUXT_API_KEY` is missing. Both password assertions pass, Nitro starts, `/api/health` returns 200, and Railway activates the deployment. Every authenticated dashboard request is then proxied with an empty `X-API-Key` and fails upstream. This can be fixed without making transient upstream reachability part of the probe—for example, by fail-fast validation of required proxy configuration.

3. **Major — [tests/healthEndpoint.test.ts](/D:/claude/llmArbiter/tests/healthEndpoint.test.ts:3)** — The 15 reported cases do not test the deployment control that failed in production. They replace `defineEventHandler` with identity and directly invoke the function, so they cannot observe Nitro routing, route middleware, method matching, status codes, response headers, catch-all precedence, or `railway.toml`. The authenticated/anonymous fake events merely prove the current function ignores its argument; the nine leak checks duplicate the exact-body equality assertion and inspect no headers; the fresh-object assertion protects no relevant behavior.

   Concrete failing scenario: change `healthcheckPath` back to `/`, add global middleware that redirects `/api/health`, or cause the real response to acquire `Set-Cookie`; every test in this file remains green while Railway deployment or the public response is wrong. No committed CI test requests `/api/health` from the built server or reads `railway.toml`.

## Other verified points

- All production `assertStrongSecret` callers explicitly pass the correct floor; the 32-character default has no incorrect production caller. The combined plugin test genuinely distinguishes both floors.
- Placeholder lengths are 42, 37, 9, 10, and 16, so the claim that none can be both placeholder and shorter than 8 is correct.
- The trim/raw mismatch is real but implements the approved decision: `"abcdefgh "` and `"\uFEFFabcdefgh"` pass startup yet require the invisible/trailing character at login. U+200B is not trimmed, so `"\u200B\u200B\u200Babcde"` also passes despite only five visible characters.
- The built Nitro manifest mounts the endpoint exactly at `/api/health`, outside `/api/arbiter/**`, with no server auth middleware or route-rule collision. It adds no session cookie or sensitive response header.
- HEAD does not match the generated GET-only route and falls through to a 404 renderer. This does not break Railway’s GET healthcheck, but HEAD-based third-party probes will report failure.
- No scoped hard-rule violation was found: no `any`, `console.*`, production hardcoded secret, public runtime secret, or direct app-code `fetch`/axios.
- Vitest could not be executed because Node/pnpm were unavailable in the review environment; `git diff --check` passed and the existing built route manifest was inspected.

VERDICT: no-ship
