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

    await expect(store.check()).resolves.toBe(true)
    expect(store.authenticated).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/check', { headers: {} })
  })

  it('mirrors an expired session', async () => {
    fetchMock.mockResolvedValue({ ok: false })
    const store = useAuthStore()
    store.authenticated = true

    await expect(store.check()).resolves.toBe(false)
    expect(store.authenticated).toBe(false)
  })

  it('treats a failed check as signed out', async () => {
    fetchMock.mockRejectedValue(httpError(401))
    const store = useAuthStore()
    store.authenticated = true

    await expect(store.check()).resolves.toBe(false)
    expect(store.authenticated).toBe(false)
  })
})
