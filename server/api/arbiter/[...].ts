export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const config = useRuntimeConfig(event)
  const base = (config.apiBaseUrl as string).replace(/\/$/, '')
  const path = event.path.replace(/^\/api\/arbiter/, '')

  return proxyRequest(event, `${base}${path}`, {
    headers: { 'X-API-Key': config.apiKey as string },
  })
})
