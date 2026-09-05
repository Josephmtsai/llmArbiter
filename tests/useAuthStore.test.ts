import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'

import { useAuthStore } from '../stores/useAuthStore'

// The store leans on three Nuxt auto-imports. Vitest has no Nuxt runtime, so
// they are supplied as globals here rather than pulled in with @nuxt/test-utils.
let fetchMock: ReturnType<typeof vi.fn>

/** Shape of an ofetch failure: status lives on the error object, not a body. */
function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { statusCode: status, status })
}

beforeEach(() => {
  setActivePinia(createPinia())
  fetchMock = vi.fn()
  vi.stubGlobal('$fetch', fetchMock)
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('useRequestHeaders', () => ({}))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAuthStore.login', () => {
  it('authenticates and clears the error on success', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    const store = useAuthStore()

    await expect(store.login('secret')).resolves.toBe(true)
    expect(store.authenticated).toBe(true)
    expect(store.error).toBeNull()
    expect(store.loading).toBe(false)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      body: { password: 'secret' },
    })
  })

  it('reports a wrong password on 401 (AC-6.1)', async () => {
    fetchMock.mockRejectedValue(httpError(401))
    const store = useAuthStore()

    await expect(store.login('wrong')).resolves.toBe(false)
    expect(store.error).toBe('Invalid password')
    expect(store.authenticated).toBe(false)
  })

  it.each([401, 429, 500])(
    'clears a previously authenticated session on %i (AC-6.8)',
    async (status) => {
      // Starting from `true` is the whole point: middleware/auth.ts returns
      // early on `authenticated`, so a stale `true` left behind by a rejected
      // login would walk the user into a guarded page with no server check.
      fetchMock.mockResolvedValueOnce({ ok: true })
      const store = useAuthStore()
      await store.login('secret')
      expect(store.authenticated).toBe(true)

      fetchMock.mockRejectedValueOnce(httpError(status))
      await expect(store.login('wrong')).resolves.toBe(false)
      expect(store.authenticated).toBe(false)
    },
  )

  it('reports rate limiting on 429 (AC-6.2)', async () => {
    fetchMock.mockRejectedValue(httpError(429))
    const store = useAuthStore()

    await expect(store.login('wrong')).resolves.toBe(false)
    expect(store.error).toBe('Too many attempts, try again later')
  })

  it('reports a server error on 500 (AC-6.3)', async () => {
    fetchMock.mockRejectedValue(httpError(500))
    const store = useAuthStore()

    await expect(store.login('secret')).resolves.toBe(false)
    expect(store.error).toBe('Server error, please try again')
  })

  it('reports a server error when the request never reached a status (AC-6.3)', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const store = useAuthStore()

    await expect(store.login('secret')).resolves.toBe(false)
    expect(store.error).toBe('Server error, please try again')
  })

  it('reads a bare `status` field when `statusCode` is absent', async () => {
    fetchMock.mockRejectedValue({ status: 401 })
    const store = useAuthStore()

    await expect(store.login('wrong')).resolves.toBe(false)
    expect(store.error).toBe('Invalid password')
  })

  it('clears loading even when the request rejects', async () => {
    fetchMock.mockRejectedValue(httpError(500))
    const store = useAuthStore()

    await store.login('secret')
    expect(store.loading).toBe(false)
  })
})

describe('useAuthStore.logout', () => {
  it('signs out only after the server confirms (AC-6.5)', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    const store = useAuthStore()
    store.authenticated = true

    await expect(store.logout()).resolves.toBe(true)
    expect(store.authenticated).toBe(false)
    expect(store.error).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
  })

  it('stays signed in and surfaces the failure when the call fails (AC-6.4)', async () => {
    fetchMock.mockRejectedValue(httpError(500))
    const store = useAuthStore()
    store.authenticated = true

    await expect(store.logout()).resolves.toBe(false)
    expect(store.authenticated).toBe(true)
    expect(store.error).toBe('Logout failed, please try again')
    expect(store.loading).toBe(false)
  })
})

describe('useAuthStore.reset', () => {
  it('clears local state without any HTTP call (AC-6.6)', () => {
    const store = useAuthStore()
    store.authenticated = true
    store.error = 'Invalid password'

    store.reset()

    expect(store.authenticated).toBe(false)
    expect(store.error).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('useAuthStore.check', () => {
  it('mirrors an authenticated session', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    const store = useAuthStore()

    await expect(store.check()).resolves.toBe('authenticated')
    expect(store.authenticated).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/check', { headers: {} })
  })

  it('mirrors an expired session', async () => {
    fetchMock.mockResolvedValue({ ok: false })
    const store = useAuthStore()
    store.authenticated = true

    await expect(store.check()).resolves.toBe('unauthenticated')
    expect(store.authenticated).toBe(false)
  })

  it('reads a 401 as the server saying no (AC-6.9)', async () => {
    fetchMock.mockRejectedValue(httpError(401))
    const store = useAuthStore()
    store.authenticated = true

    await expect(store.check()).resolves.toBe('unauthenticated')
    expect(store.authenticated).toBe(false)
  })

  it.each([
    ['a network failure', new Error('network down')],
    ['a 500', httpError(500)],
    ['a 502 from a proxy', httpError(502)],
    ['a gateway timeout', httpError(504)],
    ['an error with no status at all', { message: 'aborted' }],
  ])('reports %s as unknown and leaves the session alone (AC-6.10)', async (_label, failure) => {
    // The bug this pins: collapsing every failure to "signed out" hands a
    // momentary /api/auth/check outage the power to log out every user who
    // holds a perfectly valid cookie.
    fetchMock.mockRejectedValue(failure)
    const store = useAuthStore()
    store.authenticated = true

    await expect(store.check()).resolves.toBe('unknown')
    expect(store.authenticated).toBe(true)
  })

  it('does not invent a session when an unknown outcome finds none (AC-6.10)', async () => {
    fetchMock.mockRejectedValue(httpError(503))
    const store = useAuthStore()

    await expect(store.check()).resolves.toBe('unknown')
    expect(store.authenticated).toBe(false)
  })

  it('treats a malformed body as a negative answer', async () => {
    // The server answered; it just did not say `ok: true`. That is the server
    // declining, not the probe failing.
    fetchMock.mockResolvedValue({})
    const store = useAuthStore()
    store.authenticated = true

    await expect(store.check()).resolves.toBe('unauthenticated')
    expect(store.authenticated).toBe(false)
  })

  it('coalesces concurrent probes into one request (AC-6.11)', async () => {
    // Every useApi() instance builds its own interceptor, so one page firing
    // several API calls turns a single expiry into a burst of 401s. Before the
    // probe moved into the store each of those raised its own round trip.
    let resolveProbe: (body: { ok: boolean }) => void = () => undefined
    fetchMock.mockReturnValue(
      new Promise<{ ok: boolean }>((resolve) => {
        resolveProbe = resolve
      }),
    )
    const store = useAuthStore()

    const probes = [store.check(), store.check(), store.check()]
    resolveProbe({ ok: false })

    await expect(Promise.all(probes)).resolves.toEqual([
      'unauthenticated',
      'unauthenticated',
      'unauthenticated',
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('starts a fresh probe once the previous one has settled (AC-6.11)', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    const store = useAuthStore()

    await store.check()
    await store.check()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('discards a probe that a login overtook (AC-6.12)', async () => {
    // The probe asked about the session that existed when it was sent. By the
    // time it answers the user has signed in again, so writing its result would
    // undo a login that already succeeded.
    let resolveProbe: (body: { ok: boolean }) => void = () => undefined
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/auth/check') {
        return new Promise<{ ok: boolean }>((resolve) => {
          resolveProbe = resolve
        })
      }
      return Promise.resolve({ ok: true })
    })
    const store = useAuthStore()

    const probe = store.check()
    await expect(store.login('secret')).resolves.toBe(true)
    expect(store.authenticated).toBe(true)

    resolveProbe({ ok: false })

    await expect(probe).resolves.toBe('unknown')
    expect(store.authenticated).toBe(true)
  })

  it('discards a probe that a logout overtook (AC-6.12)', async () => {
    let resolveProbe: (body: { ok: boolean }) => void = () => undefined
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/auth/check') {
        return new Promise<{ ok: boolean }>((resolve) => {
          resolveProbe = resolve
        })
      }
      return Promise.resolve({ ok: true })
    })
    const store = useAuthStore()
    store.authenticated = true

    const probe = store.check()
    await expect(store.logout()).resolves.toBe(true)
    expect(store.authenticated).toBe(false)

    resolveProbe({ ok: true })

    await expect(probe).resolves.toBe('unknown')
    expect(store.authenticated).toBe(false)
  })
})

describe('useAuthStore.claimSignOut', () => {
  it('grants the sign-out redirect to one caller (AC-6.13)', () => {
    const store = useAuthStore()

    expect(store.claimSignOut()).toBe(true)
    expect(store.claimSignOut()).toBe(false)
    expect(store.claimSignOut()).toBe(false)
  })

  it('is available again after the user signs back in (AC-6.13)', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    const store = useAuthStore()
    expect(store.claimSignOut()).toBe(true)
    expect(store.claimSignOut()).toBe(false)

    await store.login('secret')

    expect(store.claimSignOut()).toBe(true)
  })
})
