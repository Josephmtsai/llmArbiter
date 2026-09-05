import { defineStore } from 'pinia'

function statusOf(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as { statusCode?: unknown; status?: unknown }
  if (typeof e.statusCode === 'number') return e.statusCode
  if (typeof e.status === 'number') return e.status
  return undefined
}

/**
 * What a session probe actually learned.
 *
 * `unknown` is the point of the type. Folding a network error, a 5xx or a
 * timeout into `unauthenticated` means a blip on `/api/auth/check` signs out a
 * user whose session is perfectly valid. Only an answer from the server -- a
 * body saying `ok: false`, or a 401 -- may be read as "not signed in".
 */
export type CheckOutcome = 'authenticated' | 'unauthenticated' | 'unknown'

export const useAuthStore = defineStore('auth', () => {
  const authenticated = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // These live in the store's setup closure rather than at module scope. On the
  // client that closure runs once, so every useApi() instance shares this
  // state, which is what the coalescing needs. Module scope would share it
  // across SSR requests too -- one visitor's probe answering another's.
  //
  // `generation` advances whenever the session identity changes. A probe that
  // started before the change is stale on arrival and must not write its result.
  let generation = 0
  let pendingProbe: Promise<CheckOutcome> | null = null
  let signOutClaimedAt = -1

  /**
   * Clears local state only, for when the server has already told us the
   * session is gone. Distinct from `logout()`, which must reach the server
   * before it is allowed to claim the user is signed out.
   */
  function reset() {
    authenticated.value = false
    error.value = null
  }

  async function login(password: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      await $fetch<{ ok: boolean }>('/api/auth/login', {
        method: 'POST',
        body: { password },
      })
      generation += 1
      authenticated.value = true
      return true
    } catch (err: unknown) {
      // A rejected attempt must not leave a stale `true` standing: middleware/
      // auth.ts short-circuits on `authenticated` and would then skip the
      // server check, turning a wrong password into a client-side pass.
      generation += 1
      authenticated.value = false
      const status = statusOf(err)
      if (status === 401) error.value = 'Invalid password'
      else if (status === 429) error.value = 'Too many attempts, try again later'
      else error.value = 'Server error, please try again'
      return false
    } finally {
      loading.value = false
    }
  }

  async function logout(): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
      generation += 1
      authenticated.value = false
      return true
    } catch {
      // The session cookie may well still be valid, so reporting a successful
      // sign-out here would be a lie the user acts on.
      error.value = 'Logout failed, please try again'
      return false
    } finally {
      loading.value = false
    }
  }

  async function runProbe(): Promise<CheckOutcome> {
    const startedAt = generation
    let outcome: CheckOutcome
    try {
      const headers = useRequestHeaders(['cookie'])
      const res = await $fetch<{ ok: boolean }>('/api/auth/check', { headers })
      outcome = res?.ok === true ? 'authenticated' : 'unauthenticated'
    } catch (err: unknown) {
      // 401 is the server answering. Anything else -- offline, 502, timeout --
      // is us failing to ask, which says nothing about the session.
      outcome = statusOf(err) === 401 ? 'unauthenticated' : 'unknown'
    }

    // A login or logout landed while this was in flight, so the answer is about
    // a session that no longer exists. Report `unknown` rather than overwrite.
    if (startedAt !== generation) return 'unknown'

    if (outcome === 'authenticated') authenticated.value = true
    else if (outcome === 'unauthenticated') authenticated.value = false
    return outcome
  }

  /**
   * Asks the server whether the session is still good.
   *
   * Concurrent callers share one request: a page that fires several API calls
   * at once will see several 401s, and each `useApi()` instance builds its own
   * interceptor, so without this the burst turns into a burst of probes.
   */
  function check(): Promise<CheckOutcome> {
    pendingProbe ??= runProbe().finally(() => {
      pendingProbe = null
    })
    return pendingProbe
  }

  /**
   * Grants the right to run the sign-out redirect, once per session.
   *
   * The shared probe hands every caller in a 401 burst the same
   * `unauthenticated` answer at the same moment; this is what keeps them from
   * each calling `navigateTo`. The claim is released by the next `login()` or
   * `logout()`, so a later expiry redirects again.
   */
  function claimSignOut(): boolean {
    if (signOutClaimedAt === generation) return false
    signOutClaimedAt = generation
    return true
  }

  return {
    authenticated,
    loading,
    error,
    login,
    logout,
    check,
    reset,
    claimSignOut,
  }
})
