import { defineStore } from 'pinia'

function statusOf(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as { statusCode?: unknown; status?: unknown }
  if (typeof e.statusCode === 'number') return e.statusCode
  if (typeof e.status === 'number') return e.status
  return undefined
}

export const useAuthStore = defineStore('auth', () => {
  const authenticated = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

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
      authenticated.value = true
      return true
    } catch (err: unknown) {
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

  async function check(): Promise<boolean> {
    try {
      const headers = useRequestHeaders(['cookie'])
      const res = await $fetch<{ ok: boolean }>('/api/auth/check', { headers })
      authenticated.value = res.ok
      return res.ok
    } catch {
      authenticated.value = false
      return false
    }
  }

  return { authenticated, loading, error, login, logout, check, reset }
})
