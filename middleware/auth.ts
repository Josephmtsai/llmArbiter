export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return

  const authStore = useAuthStore()
  if (authStore.authenticated) return

  // Anything short of a confirmed session sends the visitor to the form. An
  // `unknown` outcome means the probe never got an answer, and a route guard
  // that opens up when the check fails is not a guard. Note the difference from
  // the 401 interceptor: this decides whether to *admit*, so it fails closed;
  // that decides whether to *sign out*, so it needs a confirmed negative.
  const outcome = await authStore.check()
  if (outcome !== 'authenticated') {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
