import { assertStrongSecret } from '../utils/auth'

/**
 * Fails the process at startup when a required secret is missing, too short, or
 * still the `.env.example` placeholder.
 *
 * Nitro plugins run only at runtime, so `nuxt build` in CI is unaffected; this
 * fires on `pnpm dev` and on `node .output/server/index.mjs`.
 */
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  assertStrongSecret('NUXT_AUTH_PASSWORD', config.authPassword)

  // nuxt-auth-utils writes NUXT_SESSION_PASSWORD into runtimeConfig.session and
  // has its own (weaker) check. Only assert it when the module put it there, so
  // this plugin does not fail on a config shape it does not own.
  const session: unknown = (config as Record<string, unknown>).session
  if (session && typeof session === 'object' && 'password' in session) {
    assertStrongSecret('NUXT_SESSION_PASSWORD', (session as { password: unknown }).password)
  }
})
