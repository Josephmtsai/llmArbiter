import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

// The 401 interceptor lives inside the $fetch instance useApi() builds, so the
// test captures the options passed to $fetch.create and drives onResponseError
// directly. That is the only seam short of a full Nuxt runtime.
type ErrorContext = { response: { status: number } }
type CreateOptions = {
  baseURL: string
  onResponseError?: (ctx: ErrorContext) => void
}

const navigateTo = vi.fn()
const reset = vi.fn()
let route: { path: string; fullPath: string }
let captured: CreateOptions

beforeEach(() => {
  navigateTo.mockReset()
  reset.mockReset()
  route = { path: '/decisions', fullPath: '/decisions?limit=10' }

  const fetchStub = Object.assign(vi.fn(), {
    create: (options: CreateOptions) => {
      captured = options
      return vi.fn()
    },
  })
  vi.stubGlobal('$fetch', fetchStub)
  vi.stubGlobal('navigateTo', navigateTo)
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useAuthStore', () => ({ reset }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function buildApi() {
  const { useApi } = await import('../composables/useApi')
  useApi()
  return captured
}

describe('useApi 401 interceptor', () => {
  it('keeps the proxy base URL', async () => {
    const options = await buildApi()
    expect(options.baseURL).toBe('/api/arbiter')
  })

  it('signs the user out and returns them to the current page (AC-7.1)', async () => {
    const options = await buildApi()

    options.onResponseError?.({ response: { status: 401 } })

    expect(reset).toHaveBeenCalledTimes(1)
    expect(navigateTo).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/decisions?limit=10' },
    })
  })

  it('does not bounce a 401 raised while already on /login (AC-7.2)', async () => {
    route = { path: '/login', fullPath: '/login' }
    const options = await buildApi()

    options.onResponseError?.({ response: { status: 401 } })

    expect(navigateTo).not.toHaveBeenCalled()
    expect(reset).not.toHaveBeenCalled()
  })

  it.each([400, 403, 404, 429, 500, 503])(
    'leaves a %i response to the caller (AC-7.4)',
    async (status) => {
      const options = await buildApi()

      options.onResponseError?.({ response: { status } })

      expect(navigateTo).not.toHaveBeenCalled()
      expect(reset).not.toHaveBeenCalled()
    },
  )
})
