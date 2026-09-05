# Round 3 adversarial review

Scope: `7821674..a7cf232`, with Round-2 fixes in `3eb84b1`.

Execution note: the project Graphify index was absent, so dependencies were traced directly. Node/pnpm were unavailable in the review environment; tests were inspected statically but not rerun.

## Part A — Round-2 fixes

1. **FIXED — redirect normalization**  
   `utils/auth.ts:59-75` validates both raw and normalized values. The normalized result is rejected if it begins with `//`, contains backslashes or controls, resolves off-origin, or normalizes to `/login` case-insensitively. Encoded traversal variants that normalize to `//evil.com` are covered at `tests/authRedirect.test.ts:65-88`. Double-encoded separators, encoded controls, and Unicode slash lookalikes remain encoded/non-separating and do not produce an off-origin target.

2. **FIXED — tri-state session check**  
   `stores/useAuthStore.ts:92-111` returns `unauthenticated` only for 401 or an explicit non-true response; network errors, 5xx, timeouts, and statusless errors return `unknown` without changing state. The interceptor ignores `unknown` at `composables/useApi.ts:63-65`.

3. **FIXED — coalescing and generation protection**  
   Shared state is in the Pinia instance at `stores/useAuthStore.ts:26-35`. Login attempts and successful logout advance the generation at lines 55, 62, and 79. A superseded probe returns `unknown` before writing at lines 105-111. Concurrent callers share `pendingProbe` at lines 121-125, and `claimSignOut` limits redirects per generation at lines 136-139.

4. **FIXED — capacity-path sweep**  
   The scheduled sweep remains bounded to once per window at `server/utils/auth.ts:171-176`; the full-capacity branch at lines 185-196 immediately fails closed without scanning the table. The stale-bucket capacity case is pinned at `tests/serverAuthUtils.test.ts:334-356`.

5. **FIXED — constant-time regression coverage**  
   `tests/constantTime.test.ts:28-65` distinguishes the implementation from `===`, `Buffer.equals`, `Buffer.compare`, and ordinary string comparison through distinct equal buffers, unequal equal-length buffers, and the required `RangeError` for unequal lengths. The production wrapper remains a direct one-line call to `timingSafeEqual` at `server/utils/constantTime.ts:16-17`.

6. **FIXED — pure unauthorized predicate**  
   `utils/auth.ts:89-97` preserves all three original guards: status 401, client-only execution, and exclusion of `/login`. Both client/SSR branches are tested at `tests/useApiAuthInterceptor.test.ts:87-109`. The interceptor supplies the real `import.meta.client === true` value at `composables/useApi.ts:76-87`.

7. **FIXED — placeholder normalization**  
   `server/utils/auth.ts:20-31` trims and lowercases before substring matching. `assertStrongSecret` performs the minimum-length check first at lines 73-79. Legitimate OpenSSL hex secrets cannot contain the hyphenated fragments; a coincidental match in another random format is astronomically unlikely and would produce an explicit startup error rather than a security failure.

## Part B — new-code attacks

- Probe/login/logout interleavings are safe for the application’s actual flows. If login or successful logout completes first, the generation mismatch discards the probe. If the probe completes first, the later session transition overwrites its state. A failed logout deliberately leaves the session represented as authenticated and remains retryable.
- `claimSignOut` does not permanently prevent recovery: successful or failed login and successful logout advance the generation. Middleware independently fails closed, so it does not depend on the claim to protect routes.
- Both production callers handle `unknown` correctly. The interceptor does nothing; `middleware/auth.ts:12-14` redirects unless the result is explicitly `authenticated`.
- Predicate extraction passes the actual client flag and retained every inline guard.
- The pre-Round-2 task list contained 53 criteria; the current list contains all 53 unchanged plus 12 collision-free additions, for 65 total. Existing AC-1.9/1.10 were preserved; the new limiter and primitive criteria became AC-1.14/1.15. The only prior checkbox changed was AC-7.3, supported by the new pure-function coverage. No Round-1 or Round-2 requirement was dropped or weakened.
- No added `any`, `console.*`, hardcoded secret, or secret under `runtimeConfig.public` was found.

## Deviations

- **D6 — agree.** Pinia setup-closure state is shared across client-side `useApi()` instances but scoped to each SSR Pinia instance. Module scope would risk cross-request probe and claim leakage.
- **D7 — agree.** Directly spying on the externalized, frozen Node builtin is impractical in this setup. The behavioral test catches the realistic non-constant-time substitutions identified by Round 2, while the security-sensitive wrapper remains one auditable statement. A deliberately crafted imitation could reproduce the behavior, but tests cannot empirically prove timing guarantees; this is an acceptable residual.

## Findings

No substantiated Critical, Major, or Minor findings remain.

VERDICT: ship
