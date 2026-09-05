import {
  createRateLimiter,
  LOGIN_ATTEMPTS_GLOBAL,
  LOGIN_ATTEMPTS_PER_ADDRESS,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  resolveRateLimitKey,
  verifyLoginPassword,
} from '../../utils/auth'

// Module-level singletons: one Nitro instance means one shared window.
const perAddress = createRateLimiter({
  limit: LOGIN_ATTEMPTS_PER_ADDRESS,
  windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
})

/**
 * Second, source-agnostic limiter. Everything shares this one bucket.
 *
 * It exists because the per-address key can only ever be as good as the
 * forwarding headers Railway sends, and their semantics are disputed -- see the
 * two linked staff answers on `resolveRateLimitKey`. Rather than make the
 * 8-character `NUXT_AUTH_PASSWORD` floor depend on winning that argument, the
 * total guess rate for this process is capped outright: if an attacker does
 * manage to mint a fresh per-address bucket per request, they still get
 * LOGIN_ATTEMPTS_GLOBAL attempts a minute and no more.
 */
const overall = createRateLimiter({
  limit: LOGIN_ATTEMPTS_GLOBAL,
  windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
})

/** Single key for the global bucket; the limiter is keyed, this one is not. */
const GLOBAL_BUCKET = 'all'

export default defineEventHandler(async (event) => {
  // Rate limit runs before body parsing so malformed requests count too.
  //
  // Not `getRequestIP(event, { xForwardedFor: true })`: h3 takes the *leftmost*
  // X-Forwarded-For entry, which a client can write. `resolveRateLimitKey`
  // prefers the headers Railway's edge controls and only then falls back to
  // XFF, the socket, and a shared bucket -- see the comment there for why no
  // single header is trusted on its own.
  const key = resolveRateLimitKey((name) => getRequestHeader(event, name), getRequestIP(event))

  // Both counters are hit on every attempt, deliberately without
  // short-circuiting: an attempt that is already blocked per-address still
  // consumed a request, and a global bucket that stopped counting once one
  // address was throttled would be trivial to keep quiet.
  const gates = [perAddress.hit(key), overall.hit(GLOBAL_BUCKET)]
  const blocked = gates.filter((gate) => !gate.allowed)
  if (blocked.length > 0) {
    setHeader(event, 'Retry-After', Math.max(...blocked.map((gate) => gate.retryAfterSec)))
    throw createError({ statusCode: 429, message: 'Too many attempts' })
  }

  const body = await readBody<unknown>(event).catch(() => null)
  const password =
    body && typeof body === 'object' && 'password' in body
      ? (body as { password?: unknown }).password
      : undefined
  if (typeof password !== 'string' || password.length === 0) {
    throw createError({ statusCode: 400, message: 'Password is required' })
  }

  // Nitro types runtimeConfig values as unknown; the typeof guard narrows it
  // and doubles as a refusal to authenticate against a misconfigured server.
  const { authPassword } = useRuntimeConfig(event)
  if (typeof authPassword !== 'string' || !verifyLoginPassword(password, authPassword)) {
    throw createError({ statusCode: 401, message: 'Invalid password' })
  }

  await setUserSession(event, { user: { role: 'admin' } })
  return { ok: true }
})
