import { assertStrongSecret, MIN_AUTH_PASSWORD_LENGTH, MIN_SECRET_LENGTH } from '../utils/auth'

/**
 * Throws unless `value` is a non-empty string, returning it trimmed.
 *
 * `nuxt.config.ts` defaults both proxy settings to a value rather than leaving
 * them undefined, so "missing" arrives here as `''`, not as absent.
 */
function assertPresent(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be set to a non-empty value. See .env.example.`)
  }
  return value.trim()
}

/** Throws unless `value` is an absolute http(s) URL. */
function assertHttpUrl(name: string, value: unknown): void {
  const raw = assertPresent(name, value)
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(
      `${name} must be an absolute http(s) URL, e.g. https://api.example.com. See .env.example.`,
    )
  }
  // A relative path parses as a URL only against a base, so `new URL` already
  // rejects it. This catches the absolute-but-wrong-scheme case (file:, ftp:).
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `${name} must be an absolute http(s) URL, e.g. https://api.example.com. See .env.example.`,
    )
  }
}

/**
 * Fails the process at startup when a required secret is missing, too short, or
 * still the `.env.example` placeholder, or when the upstream proxy settings are
 * unusable.
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

  // Everything the dashboard shows goes through server/api/arbiter/[...].ts,
  // which sends `X-API-Key: <apiKey>` to `apiBaseUrl`. Both default to a value
  // in nuxt.config.ts, so without this the process starts happily, /api/health
  // answers 200, Railway marks the deploy live -- and every single dashboard
  // request then fails upstream with an empty key. Fail at boot instead, while
  // the previous deployment is still serving.
  //
  // Deliberately *not* a reachability probe, here or in /api/health: whether
  // the upstream answers right now is not a property of this deployment's
  // configuration, and wiring it into startup would turn an upstream blip into
  // a failed deploy.
  assertPresent('NUXT_API_KEY', config.apiKey)
  assertHttpUrl('NUXT_API_BASE_URL', config.apiBaseUrl)
})
