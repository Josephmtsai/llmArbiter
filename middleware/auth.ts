export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return

  const authStore = useAuthStore()
  if (authStore.authenticated) return

  const ok = await authStore.check()
  if (!ok) {
    return navigateTo('/login')
  }
})
