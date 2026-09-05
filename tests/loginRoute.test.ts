import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest'

// server/api/auth/login.post.ts is an h3 handler built from Nuxt auto-imports.
// Stubbing those globals and calling the exported handler with a plain object
// exercises the real ordering, real status codes and the real limiter -- the
// only alternative being a full Nitro runtime.

interface FakeEvent {
  headers: Record<string, string>
  ip?: string
  body?: unknown
  bodyThrows?: boolean
}

interface HttpError extends Error {
  statusCode: number
}

const CONFIGURED_PASSWORD = 'the-real-configured-password-64-chars-long-aaaaaaaaaaaaaaaaaaaaaaaa'

const setHeader = vi.fn()
const setUserSession = vi.fn(async () => undefined)
let runtimeConfig: Record<string, unknown>

vi.stubGlobal('defineEventHandler', <T>(fn: T) => fn)
vi.stubGlobal(
  'getRequestHeader',
  (event: FakeEvent, name: string) => event.headers[name.toLowerCase()],
)
vi.stubGlobal('getRequestIP', (event: FakeEvent) => event.ip)
vi.stubGlobal('setHeader', setHeader)
vi.stubGlobal('setUserSession', setUserSession)
vi.stubGlobal('useRuntimeConfig', () => runtimeConfig)
vi.stubGlobal('createError', (init: { statusCode: number; message: string }) =>
  Object.assign(new Error(init.message), init),
)
vi.stubGlobal('readBody', async (event: FakeEvent) => {
  if (event.bodyThrows) throw new Error('Invalid JSON')
  return event.body
})

type Handler = (event: FakeEvent) => Promise<{ ok: boolean }>

/**
 * The limiter is a module-level singleton, so every test needs its own module
 * instance or the windows bleed between cases.
 */
async function freshHandler(): Promise<Handler> {
  vi.resetModules()
  return (await import('../server/api/auth/login.post')).default as unknown as Handler
}

function request(overrides: Partial<FakeEvent> = {}): FakeEvent {
  return { headers: {}, ip: '203.0.113.7', ...overrides }
}

/** Runs the handler and returns the thrown h3 error, failing if none is thrown. */
async function expectError(handler: Handler, event: FakeEvent): Promise<HttpError> {
  try {
    await handler(event)
  } catch (err) {
    return err as HttpError
  }
  throw new Error('expected the handler to throw')
}

beforeEach(() => {
  setHeader.mockClear()
  setUserSession.mockClear()
  runtimeConfig = { authPassword: CONFIGURED_PASSWORD }
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/auth/login', () => {
  it('accepts the configured password and opens a session (AC-1.1)', async () => {
    const handler = await freshHandler()

    await expect(handler(request({ body: { password: CONFIGURED_PASSWORD } }))).resolves.toEqual({
      ok: true,
    })
    expect(setUserSession).toHaveBeenCalledTimes(1)
    expect(setUserSession).toHaveBeenCalledWith(expect.anything(), { user: { role: 'admin' } })
  })

  it('rejects a wrong password with 401 and no session (AC-1.2)', async () => {
    const handler = await freshHandler()

    const err = await expectError(handler, request({ body: { password: 'nope' } }))
    expect(err.statusCode).toBe(401)
    expect(err.message).toBe('Invalid password')
    expect(setUserSession).not.toHaveBeenCalled()
  })

  it('refuses to authenticate when the server has no password configured (AC-3.5)', async () => {
    runtimeConfig = {}
    const handler = await freshHandler()

    // An unset secret must not become "anything matches"; it must match nothing.
    const err = await expectError(handler, request({ body: { password: '' } }))
    expect(err.statusCode).toBe(400)

    const err2 = await expectError(handler, request({ body: { password: 'anything' } }))
    expect(err2.statusCode).toBe(401)
    expect(setUserSession).not.toHaveBeenCalled()
  })

  it.each([
    ['no body at all', undefined],
    ['an empty object', {}],
    ['a null body', null],
    ['an empty password', { password: '' }],
    ['a numeric password', { password: 12345 }],
    ['a null password', { password: null }],
    ['an array password', { password: ['a'] }],
  ])('rejects %s with 400 (AC-1.11)', async (_label, body) => {
    const handler = await freshHandler()

    const err = await expectError(handler, request({ body }))
    expect(err.statusCode).toBe(400)
    expect(err.message).toBe('Password is required')
    expect(setUserSession).not.toHaveBeenCalled()
  })

  it('treats an unparseable body as a missing password (AC-1.11)', async () => {
    const handler = await freshHandler()

    const err = await expectError(handler, request({ bodyThrows: true }))
    expect(err.statusCode).toBe(400)
  })

  it('blocks the sixth attempt from one address with 429 (AC-1.4)', async () => {
    const handler = await freshHandler()
    for (let i = 0; i < 5; i += 1) {
      await expectError(handler, request({ body: { password: 'wrong' } }))
    }

    const err = await expectError(handler, request({ body: { password: 'wrong' } }))
    expect(err.statusCode).toBe(429)
    expect(err.message).toBe('Too many attempts')
    expect(setHeader).toHaveBeenLastCalledWith(expect.anything(), 'Retry-After', expect.any(Number))
    expect(setHeader.mock.lastCall?.[2]).toBeGreaterThanOrEqual(1)
  })

  it('blocks the correct password too once the window is spent (AC-1.4)', async () => {
    const handler = await freshHandler()
    for (let i = 0; i < 5; i += 1) {
      await expectError(handler, request({ body: { password: 'wrong' } }))
    }

    // Otherwise an attacker learns they found the password by the response code.
    const err = await expectError(handler, request({ body: { password: CONFIGURED_PASSWORD } }))
    expect(err.statusCode).toBe(429)
    expect(setUserSession).not.toHaveBeenCalled()
  })

  it('counts malformed requests, so 429 outranks 400 (AC-1.12)', async () => {
    const handler = await freshHandler()
    for (let i = 0; i < 5; i += 1) {
      const err = await expectError(handler, request({ body: undefined }))
      expect(err.statusCode).toBe(400)
    }

    // The limiter runs before body parsing; a body-less flood must still count.
    const err = await expectError(handler, request({ body: undefined }))
    expect(err.statusCode).toBe(429)
  })

  it('keeps separate windows for separate addresses (AC-1.6)', async () => {
    const handler = await freshHandler()
    for (let i = 0; i < 6; i += 1) {
      await expectError(handler, request({ ip: '203.0.113.7', body: { password: 'wrong' } }))
    }

    const other = await expectError(
      handler,
      request({ ip: '198.51.100.4', body: { password: 'wrong' } }),
    )
    expect(other.statusCode).toBe(401)
  })

  it('is not evaded by rotating a forged X-Forwarded-For prefix (AC-2.3)', async () => {
    const handler = await freshHandler()

    // Every attempt claims a different origin in the leftmost position. Taking
    // the leftmost entry -- h3's `xForwardedFor: true` -- would hand each one a
    // fresh bucket and disable the limiter completely.
    for (let i = 0; i < 5; i += 1) {
      const err = await expectError(
        handler,
        request({
          headers: { 'x-forwarded-for': `10.0.0.${i}, 203.0.113.7` },
          body: { password: 'wrong' },
        }),
      )
      expect(err.statusCode).toBe(401)
    }

    const blocked = await expectError(
      handler,
      request({
        headers: { 'x-forwarded-for': '10.0.0.99, 203.0.113.7' },
        body: { password: 'wrong' },
      }),
    )
    expect(blocked.statusCode).toBe(429)
  })

  it('separates genuinely different clients behind the proxy (AC-2.3)', async () => {
    const handler = await freshHandler()
    for (let i = 0; i < 6; i += 1) {
      await expectError(
        handler,
        request({ headers: { 'x-forwarded-for': '203.0.113.7' }, body: { password: 'wrong' } }),
      )
    }

    const other = await expectError(
      handler,
      request({ headers: { 'x-forwarded-for': '198.51.100.4' }, body: { password: 'wrong' } }),
    )
    expect(other.statusCode).toBe(401)
  })

  it('falls back to the socket address when the header is junk (AC-2.4)', async () => {
    const handler = await freshHandler()
    for (let i = 0; i < 6; i += 1) {
      await expectError(
        handler,
        request({
          ip: '203.0.113.7',
          headers: { 'x-forwarded-for': `garbage-${i}` },
          body: { password: 'wrong' },
        }),
      )
    }

    // All six shared the socket address, so the sixth is already blocked.
    const err = await expectError(
      handler,
      request({ ip: '203.0.113.7', headers: { 'x-forwarded-for': 'more-garbage' } }),
    )
    expect(err.statusCode).toBe(429)
  })

  it('falls back to a shared bucket when no address is available at all (AC-2.5)', async () => {
    const handler = await freshHandler()
    for (let i = 0; i < 6; i += 1) {
      await expectError(handler, request({ ip: undefined, body: { password: 'wrong' } }))
    }

    const err = await expectError(handler, request({ ip: undefined, body: { password: 'wrong' } }))
    expect(err.statusCode).toBe(429)
  })
})
