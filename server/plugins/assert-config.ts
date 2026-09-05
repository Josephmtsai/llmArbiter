import { assertStrongSecret, MIN_AUTH_PASSWORD_LENGTH, MIN_SECRET_LENGTH } from '../utils/auth'

/**
 * Fails the process at startup when a required secret is missing, too short, or
 * still the `.env.example` placeholder.
 *
 * Nitro plugins run only at runtime, so `nuxt build` in CI is unaffected; this
 * fires on `pnpm dev` and on `node .output/server/index.mjs`.
 */
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  // Both floors are passed explicitly, the session one included even though it
  // equals the default: reading this file should be enough to see that the two
  // secrets are held to different rules, and a later change to the default must
  // not silently move the session key with it.
  //
  // The login password is a human-typed secret behind a rate-limited endpoint,
  // so it gets the lower floor. The session password is nuxt-auth-utils'
  // encryption key and must stay at 32 -- the module requires it, and lowering
  // it here would only push the failure into a runtime request instead.
  assertStrongSecret('NUXT_AUTH_PASSWORD', config.authPassword, MIN_AUTH_PASSWORD_LENGTH)

  // nuxt-auth-utils writes NUXT_SESSION_PASSWORD into runtimeConfig.session and
  // has its own (weaker) check. Only assert it when the module put it there, so
  // this plugin does not fail on a config shape it does not own.
  const session: unknown = (config as Record<string, unknown>).session
  if (session && typeof session === 'object' && 'password' in session) {
    assertStrongSecret(
      'NUXT_SESSION_PASSWORD',
      (session as { password: unknown }).password,
      MIN_SECRET_LENGTH,
    )
  }
})
