import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', () => {
  const authenticated = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function login(password: string): Promise<boolean> {
    loading.value = true
    error.value = null
    try {
      const res = await $fetch<{ ok: boolean }>('/api/auth/login', {
        method: 'POST',
        body: { password },
      })
      if (res.ok) {
        authenticated.value = true
        return true
      }
      error.value = 'Invalid password'
      return false
    } catch {
      error.value = 'Authentication failed'
      return false
    } finally {
      loading.value = false
    }
  }

  async function logout(): Promise<void> {
    await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => null)
    authenticated.value = false
  }

  async function check(): Promise<boolean> {
    try {
      const res = await $fetch<{ ok: boolean }>('/api/auth/check')
      authenticated.value = res.ok
      return res.ok
    } catch {
      authenticated.value = false
      return false
    }
  }

  return { authenticated, loading, error, login, logout, check }
})
