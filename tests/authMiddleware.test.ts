import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

// defineNuxtRouteMiddleware just tags the handler in Nuxt, so the stub returns
// it unchanged and the test calls the real guard directly.
const navigateTo = vi.fn((to: unknown) => to)
const check = vi.fn()
let authenticated = false

vi.stubGlobal('defineNuxtRouteMiddleware', <T>(fn: T) => fn)
vi.stubGlobal('navigateTo', navigateTo)
vi.stubGlobal('useAuthStore', () => ({
  get authenticated() {
    return authenticated
  },
  check,
}))

const middleware = (await import('../middleware/auth')).default as (to: {
  path: string
  fullPath: string
}) => Promise<unknown>

beforeEach(() => {
  navigateTo.mockClear()
  check.mockReset()
  authenticated = false
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('middleware/auth', () => {
  it('lets the login page through without a session check', async () => {
    await middleware({ path: '/login', fullPath: '/login?redirect=%2Fcases' })

    expect(check).not.toHaveBeenCalled()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('skips the round trip when the store already knows the user is in', async () => {
    authenticated = true

    await middleware({ path: '/decisions', fullPath: '/decisions' })

    expect(check).not.toHaveBeenCalled()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('allows the request once a server check confirms the session', async () => {
    check.mockResolvedValue(true)

    await middleware({ path: '/decisions', fullPath: '/decisions' })

    expect(check).toHaveBeenCalledTimes(1)
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('sends an unauthenticated visitor to /login carrying the original path (AC-5.1)', async () => {
    check.mockResolvedValue(false)

    await middleware({ path: '/decisions', fullPath: '/decisions?limit=10' })

    expect(navigateTo).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/decisions?limit=10' },
    })
  })
})
