export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  return { ok: !!session?.user }
})
