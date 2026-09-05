import { createRateLimiter, verifyLoginPassword } from '../../utils/auth'

// Module-level singleton: one Nitro instance means one shared window per IP.
const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 })

export default defineEventHandler(async (event) => {
  // Rate limit runs before body parsing so malformed requests count too.
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
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
