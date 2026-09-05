import { afterAll, describe, expect, it, vi } from 'vitest'

// server/api/health.ts is Railway's healthcheck target. `defineEventHandler`
// only wraps the function in Nitro, so the stub returns it unchanged and these
// tests call the real handler directly.
//
// Scope note (review round 1): calling the handler directly can only observe
// the *body it returns*. It cannot see Nitro routing, method matching, status
// codes, response headers or `railway.toml` -- which is precisely the layer
// that broke in production. That layer is covered against the built server in
// `tests/e2e/health.e2e.test.ts`; the earlier version of this file had fifteen
// cases that all re-asserted the same object equality and gave false assurance,
// so what is left here is the body contract and nothing else.

vi.stubGlobal('defineEventHandler', <T>(fn: T) => fn)

const handler = (await import('../server/api/health')).default as unknown as (
  event?: unknown,
) => unknown

afterAll(() => {
  vi.unstubAllGlobals()
})

/** A request shape the endpoint must ignore: authenticated, with a session. */
const AUTHENTICATED_EVENT = {
  path: '/api/health',
  method: 'GET',
  node: { req: { headers: { cookie: 'nuxt-session=an-opaque-sealed-session-value' } } },
  context: { sessionUser: { name: 'operator' } },
}

describe('server/api/health', () => {
  it('answers with exactly { status: "ok" } and nothing else (AC-3.2, AC-3.4)', () => {
    // Equality, not a field blacklist: a blacklist only catches the fields
    // someone thought of, and this endpoint is unauthenticated, so every extra
    // field would be free reconnaissance.
    expect(handler()).toEqual({ status: 'ok' })
    expect(Object.keys(handler() as Record<string, unknown>)).toEqual(['status'])
  })

  it('ignores the request entirely, session included (AC-3.3)', () => {
    // A healthcheck that varied by auth state would report the platform's
    // cookie handling rather than whether this process is alive. Nothing here
    // stubs `useRuntimeConfig` either, so a handler that started reading config
    // would throw a ReferenceError rather than quietly serialising it.
    expect(handler(AUTHENTICATED_EVENT)).toEqual({ status: 'ok' })
  })
})
