export default defineEventHandler(async (event) => {
  const body = await readBody<{ password: string }>(event)
  const config = useRuntimeConfig()

  if (body.password !== config.authPassword) {
    throw createError({ statusCode: 401, message: 'Invalid password' })
  }

  await setUserSession(event, { user: { role: 'admin' } })
  return { ok: true }
})
