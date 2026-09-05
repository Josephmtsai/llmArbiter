import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { shouldHandleUnauthorized } from '../utils/auth'
import type { CheckOutcome } from '../stores/useAuthStore'

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
const check = vi.fn<() => Promise<CheckOutcome>>()
// Mirrors the store's contract: the first caller after each session change gets
// the claim, everyone else is told to stand down. The real implementation is
// exercised in useAuthStore.test.ts.
let claimed = false
const claimSignOut = vi.fn(() => {
  if (claimed) return false
  claimed = true
  return true
})
let route: { path: string; fullPath: string }
let captured: CreateOptions

beforeEach(() => {
  navigateTo.mockReset()
  reset.mockReset()
  claimSignOut.mockClear()
  claimed = false
  // Default: the server agrees the session is gone, which is the expiry case.
  check.mockReset()
  check.mockResolvedValue('unauthenticated')
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
  vi.stubGlobal('useAuthStore', () => ({ reset, check, claimSignOut }))
  // The real function, not a stub: Nuxt auto-imports it from utils/ at build
  // time, and there is no auto-import in Vitest. Wiring the genuine article in
  // keeps the interceptor tests honest about which responses it acts on.
  vi.stubGlobal('shouldHandleUnauthorized', shouldHandleUnauthorized)
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

describe('shouldHandleUnauthorized', () => {
  // AC-7.3. `import.meta.client` is rewritten to a literal `true` by the Vitest
  // config's transform, so a branch reading it inline has no reachable false
  // side. Taking it as an argument is what makes the SSR path testable at all.
  it('starts the sign-out flow for a client-side 401 away from /login', () => {
    expect(shouldHandleUnauthorized({ status: 401, isClient: true, path: '/decisions' })).toBe(true)
  })

  it('stays out of the way during SSR (AC-7.3)', () => {
    // middleware/auth.ts already gates the server render, and navigating
    // mid-render aborts the request being answered.
    expect(shouldHandleUnauthorized({ status: 401, isClient: false, path: '/decisions' })).toBe(
      false,
    )
  })

  it('ignores a 401 raised on the login page itself', () => {
    expect(shouldHandleUnauthorized({ status: 401, isClient: true, path: '/login' })).toBe(false)
  })

  it.each([400, 403, 404, 429, 500, 503])('ignores a %i', (status) => {
    expect(shouldHandleUnauthorized({ status, isClient: true, path: '/decisions' })).toBe(false)
  })
})

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
    check.mockResolvedValue('authenticated')
    const options = await buildApi()

    await raise(options, 401)

    expect(check).toHaveBeenCalledTimes(1)
    expect(reset).not.toHaveBeenCalled()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('stays put when the probe itself could not complete (AC-7.8)', async () => {
    // `unknown` is the probe failing, not the session failing. Treating it as a
    // logout hands a transient /api/auth/check outage the power to sign out
    // every user holding a valid cookie.
    check.mockResolvedValue('unknown')
    const options = await buildApi()

    await raise(options, 401)

    expect(check).toHaveBeenCalledTimes(1)
    expect(reset).not.toHaveBeenCalled()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('does not clear a session the user has since re-established (AC-7.6)', async () => {
    // A slow request 401s long after the fact; by the time it lands the user has
    // logged back in. The store stamps the probe with a generation and reports
    // `unknown` when a login landed while it was outstanding.
    let resolveCheck: (outcome: CheckOutcome) => void = () => undefined
    check.mockReturnValue(
      new Promise<CheckOutcome>((resolve) => {
        resolveCheck = resolve
      }),
    )
    const options = await buildApi()

    options.onResponseError?.({ response: { status: 401 } })
    await flush()
    expect(reset).not.toHaveBeenCalled()

    resolveCheck('unknown')
    await flush()

    expect(reset).not.toHaveBeenCalled()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('redirects once when several requests 401 together (AC-7.7)', async () => {
    // Coalescing the probe itself is the store's job and is asserted against
    // the real store in useAuthStore.test.ts; what this pins down is that the
    // redirect fires once even when every caller is handed the same answer.
    let resolveCheck: (outcome: CheckOutcome) => void = () => undefined
    check.mockReturnValue(
      new Promise<CheckOutcome>((resolve) => {
        resolveCheck = resolve
      }),
    )
    const options = await buildApi()

    for (let i = 0; i < 4; i += 1) options.onResponseError?.({ response: { status: 401 } })
    resolveCheck('unauthenticated')
    await flush()

    expect(reset).toHaveBeenCalledTimes(1)
    expect(navigateTo).toHaveBeenCalledTimes(1)
  })

  it('redirects once across separate useApi() instances (AC-7.7)', async () => {
    // The old coalescing flag was a local inside useApi(), so the sidebar and
    // the page each had their own and both redirected. The claim lives in the
    // store now, which every instance shares.
    const first = await buildApi()
    const second = await buildApi()

    first.onResponseError?.({ response: { status: 401 } })
    second.onResponseError?.({ response: { status: 401 } })
    await flush()

    expect(reset).toHaveBeenCalledTimes(1)
    expect(navigateTo).toHaveBeenCalledTimes(1)
  })

  it('abandons the redirect if the user reached /login while probing (AC-7.2)', async () => {
    let resolveCheck: (outcome: CheckOutcome) => void = () => undefined
    check.mockReturnValue(
      new Promise<CheckOutcome>((resolve) => {
        resolveCheck = resolve
      }),
    )
    const options = await buildApi()

    options.onResponseError?.({ response: { status: 401 } })
    route = { path: '/login', fullPath: '/login' }
    resolveCheck('unauthenticated')
    await flush()

    expect(navigateTo).not.toHaveBeenCalled()
    expect(reset).not.toHaveBeenCalled()
    // The claim must not be spent by a redirect that never happened.
    expect(claimSignOut).not.toHaveBeenCalled()
  })
})
