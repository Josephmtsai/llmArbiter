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
const check = vi.fn<() => Promise<boolean>>()
let route: { path: string; fullPath: string }
let captured: CreateOptions

beforeEach(() => {
  navigateTo.mockReset()
  reset.mockReset()
  // Default: the server agrees the session is gone, which is the expiry case.
  check.mockReset()
  check.mockResolvedValue(false)
  route = { path: '/decisions', fullPath: '/decisions?limit=10' }

  const fetchStub = Object.assign(vi.fn(), {
    create: (options: CreateOptions) => {
      captured = options
      return vi.fn()
    },
  })
  vi.stubGlobal('$fetch', fetchStub)
  vi.stubGlobal('navigateTo', navigateTo)
  // Getters, not a snapshot: Nuxt's route object stays live, and one test
  // depends on the path changing while the session probe is outstanding.
  vi.stubGlobal('useRoute', () => ({
    get path() {
      return route.path
    },
    get fullPath() {
      return route.fullPath
    },
  }))
  vi.stubGlobal('useAuthStore', () => ({ reset, check }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function buildApi() {
  const { useApi } = await import('../composables/useApi')
  useApi()
  return captured
}

/** Lets the interceptor's async session probe settle before asserting. */
async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

async function raise(options: CreateOptions, status: number) {
  options.onResponseError?.({ response: { status } })
  await flush()
}

describe('useApi 401 interceptor', () => {
  it('keeps the proxy base URL', async () => {
    const options = await buildApi()
    expect(options.baseURL).toBe('/api/arbiter')
  })

  it('signs the user out and returns them to the current page (AC-7.1)', async () => {
    const options = await buildApi()

    await raise(options, 401)

    expect(check).toHaveBeenCalledTimes(1)
    expect(reset).toHaveBeenCalledTimes(1)
    expect(navigateTo).toHaveBeenCalledWith({
      path: '/login',
      query: { redirect: '/decisions?limit=10' },
    })
  })

  it('does not bounce a 401 raised while already on /login (AC-7.2)', async () => {
    route = { path: '/login', fullPath: '/login' }
    const options = await buildApi()

    await raise(options, 401)

    expect(check).not.toHaveBeenCalled()
    expect(navigateTo).not.toHaveBeenCalled()
    expect(reset).not.toHaveBeenCalled()
  })

  it.each([400, 403, 404, 429, 500, 503])(
    'leaves a %i response to the caller (AC-7.4)',
    async (status) => {
      const options = await buildApi()

      await raise(options, status)

      expect(check).not.toHaveBeenCalled()
      expect(navigateTo).not.toHaveBeenCalled()
      expect(reset).not.toHaveBeenCalled()
    },
  )

  it('stays put when the upstream 401s but our session is fine (AC-7.5)', async () => {
    // A 401 on /api/arbiter/* can equally mean the upstream API rejected a call
    // we were entitled to make. Signing the user out on that is a false logout.
    check.mockResolvedValue(true)
    const options = await buildApi()

    await raise(options, 401)

    expect(check).toHaveBeenCalledTimes(1)
    expect(reset).not.toHaveBeenCalled()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('does not clear a session the user has since re-established (AC-7.6)', async () => {
    // A slow request 401s long after the fact; by the time it lands the user has
    // logged back in. The probe reflects the present, not the stale response.
    let resolveCheck: (ok: boolean) => void = () => undefined
    check.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveCheck = resolve
      }),
    )
    const options = await buildApi()

    options.onResponseError?.({ response: { status: 401 } })
    await flush()
    expect(reset).not.toHaveBeenCalled()

    resolveCheck(true)
    await flush()

    expect(reset).not.toHaveBeenCalled()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('probes and redirects once when several requests 401 together (AC-7.7)', async () => {
    let resolveCheck: (ok: boolean) => void = () => undefined
    check.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveCheck = resolve
      }),
    )
    const options = await buildApi()

    for (let i = 0; i < 4; i += 1) options.onResponseError?.({ response: { status: 401 } })
    resolveCheck(false)
    await flush()

    expect(check).toHaveBeenCalledTimes(1)
    expect(reset).toHaveBeenCalledTimes(1)
    expect(navigateTo).toHaveBeenCalledTimes(1)
  })

  it('abandons the redirect if the user reached /login while probing (AC-7.2)', async () => {
    let resolveCheck: (ok: boolean) => void = () => undefined
    check.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveCheck = resolve
      }),
    )
    const options = await buildApi()

    options.onResponseError?.({ response: { status: 401 } })
    route = { path: '/login', fullPath: '/login' }
    resolveCheck(false)
    await flush()

    expect(navigateTo).not.toHaveBeenCalled()
    expect(reset).not.toHaveBeenCalled()
  })
})
