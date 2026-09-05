import { afterAll, describe, expect, it, vi } from 'vitest'

// server/api/health.get.ts is Railway's healthcheck target. `defineEventHandler`
// only wraps the function in Nitro, so the stub returns it unchanged and these
// tests call the real handler directly.
//
// AC-3.1 / AC-3.5 / AC-3.6 / AC-3.7 need a real route table (no redirect, not
// swallowed by the proxy catch-all, GET-only, and `/api/arbiter/health` still
// 401) and are covered by the runtime checks in the DoD instead.

vi.stubGlobal('defineEventHandler', <T>(fn: T) => fn)

const handler = (await import('../server/api/health.get')).default as unknown as (
  event?: unknown,
) => unknown

afterAll(() => {
  vi.unstubAllGlobals()
})

/** Stand-ins for the request shapes the endpoint must ignore. */
const ANONYMOUS_EVENT = { path: '/api/health', method: 'GET', node: { req: { headers: {} } } }
const AUTHENTICATED_EVENT = {
  path: '/api/health',
  method: 'GET',
  node: { req: { headers: { cookie: 'nuxt-session=an-opaque-sealed-session-value' } } },
  context: { sessionUser: { name: 'operator' } },
}

describe('server/api/health.get', () => {
  it('answers with exactly { status: "ok" } (AC-3.2)', () => {
    expect(handler(ANONYMOUS_EVENT)).toEqual({ status: 'ok' })
  })

  it('answers identically with and without a session (AC-3.3)', () => {
    // A healthcheck that varied by auth state would report the platform's
    // cookie handling rather than whether this process is alive.
    expect(handler(AUTHENTICATED_EVENT)).toEqual(handler(ANONYMOUS_EVENT))
  })

  it('answers identically when called with no event at all (AC-3.3)', () => {
    expect(handler()).toEqual({ status: 'ok' })
  })

  it('returns a fresh object each call, so a caller cannot poison it (AC-3.2)', () => {
    expect(handler(ANONYMOUS_EVENT)).not.toBe(handler(ANONYMOUS_EVENT))
  })

  it('has exactly one key and no others (AC-3.4)', () => {
    // Equality first: a blacklist only catches the fields someone thought of.
    const body = handler(ANONYMOUS_EVENT)
    expect(body).toEqual({ status: 'ok' })
    expect(Object.keys(body as Record<string, unknown>)).toEqual(['status'])
  })

  it.each([
    'NUXT_',
    'apiKey',
    'apiBaseUrl',
    'authPassword',
    'session',
    'password',
    'version',
    'uptime',
    'env',
  ])('never leaks %s in the serialised body (AC-3.4)', (needle) => {
    // Belt to the equality assertion's braces: this endpoint is unauthenticated,
    // so every extra field is free reconnaissance for a scanner.
    expect(JSON.stringify(handler(ANONYMOUS_EVENT))).not.toContain(needle)
  })

  it('does not read runtime config (AC-3.4)', () => {
    // Nothing stubs `useRuntimeConfig` in this file. If the handler ever starts
    // calling it, this throws a ReferenceError rather than quietly shipping
    // config in the body.
    expect(() => handler(ANONYMOUS_EVENT)).not.toThrow()
  })
})
