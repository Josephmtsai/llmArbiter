# codex adversarial review round 2 — auth-hardening

Date: 2026-09-05  |  Reviewer: codex-cli 0.153.3 (gpt-5.6-sol, reasoning effort high)
Scope: 107e0ef..04f37ba  |  Verdict: no-ship

# Round 2 adversarial review

Scope: `107e0ef..04f37ba`, especially fixes in `90097f1`.

Execution note: `pnpm test` could not start in the read-only reviewer sandbox because Vite attempted to create a temporary config file and received `EPERM`. No files were modified. Test inclusion and mutation sensitivity were verified statically; the existing LCOV artifact records 27/27 lines for `login.post.ts` and 9/9 for `assert-config.ts`.

## Part A — round-1 findings

1. **Major — PARTIAL** — `server/utils/auth.ts:58-69`, `.env.example:8-11`

   The exact current and superseded placeholders are rejected, so copying `.env.example` unchanged now stops startup. However, this is an exact-string denylist. A trailing space, case change, or appended character passes.

   Concrete scenario: deploy with `NUXT_AUTH_PASSWORD=replace-me-with-openssl-rand-hex-32-output!`. Startup succeeds, and an attacker only has to try obvious one-character mutations of the public placeholder.

2. **Major — FIXED** — `server/utils/auth.ts:103-107`, `server/api/auth/login.post.ts:16-20`

   The implementation uses `split(',').pop()`, not h3’s leftmost-entry behavior. If the platform appends `203.0.113.7`, both a forged leading value and a client-supplied “trailing” value remain to its left:

   `forged-leading, forged-trailing, 203.0.113.7`

   The key remains `203.0.113.7`. Rotating either attacker-controlled value cannot evade the sixth-request limit. Multiple header values are joined by h3 with commas, preserving the appended rightmost entry.

3. **Major — PARTIAL** — `server/utils/auth.ts:126-176`

   Memory is bounded at 10,000 buckets, and normal known-key hits no longer scan the table. The CPU problem moves to the capacity path: every unseen key at capacity calls `sweep(now)`, scanning all 10,000 live buckets before returning 429.

   Concrete scenario: 10,000 source IPv6 addresses fill the table within 60 seconds. Every subsequent request from another address performs a 10,000-entry scan and is refused. This restores attacker-controlled O(table-size) work and blocks every new legitimate IP.

4. **Major — FIXED** — `server/utils/auth.ts:29-35`

   The configured password digest is memoized, so its plaintext is no longer hashed for every request. The accepted residual secret-length issue is not re-raised.

5. **Major — PARTIAL** — `composables/useApi.ts:59-65`, `stores/useAuthStore.ts:68-76`

   A healthy `/api/auth/check` returning `true` now distinguishes an upstream API-key 401 from an expired browser session. But `check()` converts every failure—including network errors and server 500s—to `false`.

   Concrete scenario: the upstream API returns 401 while `/api/auth/check` transiently returns 503. A valid user is marked unauthenticated and redirected to login.

6. **Major — PARTIAL** — `composables/useApi.ts:59-75`, `stores/useAuthStore.ts:68-76`

   A 401 arriving after a completed login is rechecked successfully. However, there is still no session-generation check around an already-running probe, and coalescing is local to each `useApi()` instance.

   Concrete scenario: the page and `AppSidebar` each receive 401 and start separate checks with the expired cookie. The first check redirects to login; the user signs in; the second stale check then returns `false`, sets `authenticated=false`, and can redirect the fresh session back to login.

7. **Major — FIXED** — `stores/useAuthStore.ts:36-45`

   Every rejected login now clears `authenticated`, including 401, 429, 500, and network failures. Tests explicitly begin from a previously authenticated store.

8. **Minor — REGRESSED** — `utils/auth.ts:30-47`

   The original `/login#...`, traversal-to-login, and literal control-character cases are handled. The new normalization can itself synthesize a protocol-relative result.

   Concrete scenario: `resolveSafeRedirect('/a/%2e%2e//evil.com')` returns `//evil.com`. In the current login call site, Nuxt rejects this as an unauthorized external navigation, so login succeeds but post-login navigation throws. `/LOGIN` also passes while Vue Router matches routes case-insensitively, returning the user to the login page.

9. **Major — PARTIAL** — `tests/loginRoute.test.ts:75-257`, `tests/assertConfigPlugin.test.ts:26-70`, `vitest.config.ts:24-26`

   The route and startup plugin now have real behavioral coverage:

   - Unconditional `setUserSession` fails the wrong-password/no-session assertions.
   - Moving rate limiting after validation fails the “sixth malformed request is 429” test.
   - Deleting startup assertions fails the plugin rejection tests.
   - LCOV records full line execution for both files.

   The SSR interceptor guard remains untested because the Vitest transform always substitutes `import.meta.client` with `true`. Deleting the SSR guard would still pass the suite.

10. **Major — PARTIAL** — `server/utils/constantTime.ts:16-17`, `tests/serverAuthUtils.test.ts:65-83`

    Replacing `verifyLoginPassword` directly with `input === expected` now fails because `bufferEquals` is expected to be called. However, the security primitive was moved into an unverified wrapper.

    Concrete broken mutation that still passes: replace `bufferEquals` with `return a.toString('hex') === b.toString('hex')`. All functional and spy assertions still pass, despite losing `timingSafeEqual`.

11. **Minor — FIXED** — `tests/serverAuthUtils.test.ts:257-264`

    The test now observes `size` falling from 50 to 1. Removing the scheduled sweep leaves the size at 50, so the test fails.

## Part B — fresh findings in the fixes

1. **Major — Placeholder rejection is trivially bypassable** — `server/utils/auth.ts:14-17,58-69`

   Only exact strings are rejected; there is no trimming, case normalization, or detection of placeholder prefixes.

   Concrete scenario: an operator appends `!` to satisfy a deployment checklist. The server boots with a nearly public password that is cheaply enumerable.

2. **Major — Bucket capacity is a global denial-of-service and CPU amplifier** — `server/utils/auth.ts:170-176`

   Once the table is full, all new clients are denied, and each new key forces a full-table sweep. Active buckets are not evicted, so a legitimate user cannot enter the table until expiry.

   Concrete scenario: an attacker rotates 10,000 routed IPv6 addresses, then continues rotating. New users receive 429 while each attacker request scans 10,000 entries. Hits do not extend a bucket’s fixed window, but the attacker can refill the table immediately after each sweep.

3. **Major — Session reconciliation remains stale and is only coalesced per API instance** — `composables/useApi.ts:59-75`, `stores/useAuthStore.ts:68-76`

   Each `useApi()` invocation owns a different `pendingSignOut`. The repository creates instances in the sidebar, pages, and another composable. A stale `check()` response also mutates the store before the interceptor can reconsider current state.

   Concrete scenario: two instances probe simultaneously; one causes reauthentication, then the second old-cookie response clears the newly authenticated store and redirects again.

4. **Minor — Probe infrastructure failures are treated as proof of logout** — `stores/useAuthStore.ts:68-76`, `composables/useApi.ts:59-65`

   The probe does not recurse through the intercepting instance, and a probe 401 is caught. But network errors and 5xx responses are indistinguishable from `{ ok: false }`.

   Concrete scenario: an upstream 401 coincides with a brief `/api/auth/check` outage, forcing a valid user out.

5. **Major — Timing-safe regression test does not cover the actual primitive** — `server/utils/constantTime.ts:16-17`, `tests/serverAuthUtils.test.ts:65-83`

   The test verifies only that the wrapper is called. Replacing the wrapper’s implementation with an ordinary digest comparison leaves every test green.

6. **Minor — Redirect normalization can emit an external-shaped target and misses case variants** — `utils/auth.ts:42-47`

   After normalization, the result is not revalidated for `//`, controls, or login-route equivalence.

   Concrete scenarios:

   - `/a/%2e%2e//evil.com` becomes `//evil.com`, which makes Nuxt throw during post-login navigation.
   - `/LOGIN` passes but matches the `/login` route under Vue Router’s default case-insensitive matcher.

7. **Minor — SSR behavior remains mutation-insensitive** — `vitest.config.ts:24-26`, `tests/useApiAuthInterceptor.test.ts:69-182`

   Every interceptor test runs with `import.meta.client` forced to true.

   Concrete broken mutation: remove `composables/useApi.ts:84`. The suite remains green, but an SSR upstream 401 can run the session probe and navigation logic during rendering.

Malformed, empty, whitespace-only, trailing-comma, and absent XFF values fall back to the socket/`unknown` key. Bracketed or port-qualified addresses are rejected rather than accepted as attacker-chosen keys. Under the stated platform behavior—appending the real client address as the rightmost entry—leading values, client-supplied trailing values, duplicate headers, and the deliberately loose IPv6 validator do not let the client select the final bucket key.

No new `any`, `console.*`, hardcoded production secret, or secret under `runtimeConfig.public` was found.

VERDICT: no-ship
