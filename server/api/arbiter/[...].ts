export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const config = useRuntimeConfig(event)
  const base = (config.apiBaseUrl as string).replace(/\/$/, '')
  const wildcard = getRouterParam(event, '_') ?? ''
  const query = new URLSearchParams(
    Object.entries(getQuery(event)).flatMap(([k, v]) =>
      Array.isArray(v) ? v.map(String).map((s) => [k, s]) : [[k, String(v ?? '')]],
    ),
  ).toString()
  const targetPath = '/' + wildcard + (query ? '?' + query : '')

  return proxyRequest(event, `${base}${targetPath}`, {
    headers: { 'X-API-Key': config.apiKey as string },
  })
})
