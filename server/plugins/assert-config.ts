/**
 * Fails the process at startup when the login password is missing or too weak.
 *
 * Nitro plugins run only at runtime, so `nuxt build` in CI is unaffected; this
 * fires on `pnpm dev` and on `node .output/server/index.mjs`.
 */
export default defineNitroPlugin(() => {
  const password = useRuntimeConfig().authPassword
  if (typeof password !== 'string' || password.length < 32) {
    throw new Error(
      'NUXT_AUTH_PASSWORD must be set and at least 32 characters long. See .env.example.',
    )
  }
})
