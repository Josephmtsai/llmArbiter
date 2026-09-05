# codex adversarial review — auth-hardening

Date: 2026-09-05  |  Reviewer: codex-cli 0.153.3 (default model, reasoning effort high)
Branch: feat/auth-hardening  |  Base: main 7821674
Verdict: no-ship (8 Major, 3 Minor)

## Findings

1. **Major — `.env.example:7`, `server/plugins/assert-config.ts:9`** — The publicly known example password is 37 characters, so it passes the new startup assertion. Concrete scenario: an operator copies the example into Railway unchanged; the server boots successfully, and anyone reading the repository can submit `change-me-at-least-32-characters-long` and obtain an admin session.

2. **Major — `server/api/auth/login.post.ts:8`** — The limiter trusts the first client-controlled `X-Forwarded-For` value without a trusted-proxy boundary. Concrete scenario: an attacker sends every wrong-password request with a different leading XFF address; each receives 401 and none reaches the per-key sixth request that would return 429.

3. **Major — `server/utils/auth.ts:38`** — Expiry sweeping does not bound entries created inside the active 60-second window, and every hit scans the entire Map. Concrete scenario: 50,000 unique spoofed XFF keys in one minute retain 50,000 buckets and cause roughly 1.25 billion cumulative bucket checks, exhausting CPU and memory.

4. **Major — `server/utils/auth.ts:11`** — Although `timingSafeEqual` receives two equal-length 32-byte buffers, the secret plaintext is hashed during every request. SHA-256 work depends on the secret’s UTF-8 byte length, so the surrounding operation is not constant-time with respect to secret length. Concrete scenario: after bypassing the limiter, an attacker averages repeated fixed-input 401 timings to distinguish a 32-byte configured password from a much longer one. Node explicitly warns that `timingSafeEqual` does not make surrounding code timing-safe. [Node.js crypto documentation](https://nodejs.org/api/crypto.html)

5. **Major — `composables/useApi.ts:52`** — Every `/api/arbiter` 401 is treated as an expired user session, but the proxy also forwards upstream 401 responses. Concrete scenario: an expired `NUXT_API_KEY` makes Arbiter return 401; a valid user is reset and redirected to login, then immediately redirected again after each successful login because their browser session was never the problem.

6. **Major — `composables/useApi.ts:57`** — A delayed response can clobber a newly established session because the interceptor has no request or session generation check. Concrete scenario: two requests leave with an expired cookie; the first 401 sends the user to login, the user signs in, and the second delayed 401 then resets the fresh state and redirects them back to login.

7. **Major — `stores/useAuthStore.ts:36`** — Failed login attempts do not clear a pre-existing `authenticated=true` state. Concrete scenario: a stale client store remains authenticated after the server session expires; a subsequent wrong-password login returns false but leaves the store true, so `middleware/auth.ts:5` skips its server check and renders a protected page. `tests/useAuthStore.test.ts:50` misses this because it starts from a fresh false store.

8. **Minor — `utils/auth.ts:10`** — Validation occurs before URL normalization and the `/login` exclusion is incomplete. Concrete scenario: `/login?redirect=%2Flogin%23x` produces `/login#x`, which passes the helper and returns the authenticated user to the login form. Likewise, `redirect=%2F%0A%2Fevil.com` passes the helper, after which Nuxt rejects it as unauthorized external navigation, leaving login successfully completed but navigation broken.

9. **Major — `vitest.config.ts:75`, `tests/serverAuthUtils.test.ts:3`** — The security-critical Nitro route and startup plugin have no behavioral coverage. The developer’s LCOV artifact records `login.post.ts` at 0/24 lines and `assert-config.ts` at 0/8 lines; the claimed 14 runtime checks have no committed test harness. Concrete broken implementations that still pass include unconditional `setUserSession`, moving rate limiting after validation, or deleting the startup assertion. The client-only transform also leaves the SSR guard untested.

10. **Major — `tests/serverAuthUtils.test.ts:12`** — Password tests assert only equality results, not use of a timing-safe primitive. Concrete scenario: replacing `verifyLoginPassword` with `return input === expected` satisfies every test while violating the hard timing-safety rule.

11. **Minor — `tests/serverAuthUtils.test.ts:92`** — The Map-cleanup test never observes cleanup. Concrete scenario: remove the sweep at `server/utils/auth.ts:38-40`; the later hit merely increments the reused bucket from one to two and still returns allowed, so the test passes while stale keys remain indefinitely.

VERDICT: no-ship
