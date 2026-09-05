import { clientIpFromForwardedFor, createRateLimiter, verifyLoginPassword } from '../../utils/auth'

// Module-level singleton: one Nitro instance means one shared window per IP.
const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 })

export default defineEventHandler(async (event) => {
  // Rate limit runs before body parsing so malformed requests count too.
  //
  // Not `getRequestIP(event, { xForwardedFor: true })`: h3 takes the *leftmost*
  // X-Forwarded-For entry, which the client writes, so an attacker could mint a
  // fresh bucket per attempt just by rotating a fake prefix. Railway's edge
  // appends the address it saw, so the rightmost entry is the last trustworthy
  // one. Falling back to the socket address covers direct/local connections,
  // and to a shared 'unknown' key when even that is missing (Human Gate: a
  // shared bucket is the safe direction to fail).
  const ip =
    clientIpFromForwardedFor(getRequestHeader(event, 'x-forwarded-for')) ??
    getRequestIP(event) ??
    'unknown'
  const gate = limiter.hit(ip)
  if (!gate.allowed) {
    setHeader(event, 'Retry-After', gate.retryAfterSec)
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
