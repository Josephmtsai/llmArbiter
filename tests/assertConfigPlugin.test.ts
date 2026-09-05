import { afterAll, describe, expect, it, vi } from 'vitest'

// server/plugins/assert-config.ts is the fail-closed startup gate. defineNitroPlugin
// only tags the function in Nitro, so the stub returns it unchanged and the test
// calls the real assertion directly.

let runtimeConfig: Record<string, unknown>

vi.stubGlobal('defineNitroPlugin', <T>(fn: T) => fn)
vi.stubGlobal('useRuntimeConfig', () => runtimeConfig)

const plugin = (await import('../server/plugins/assert-config')).default as unknown as () => void

const STRONG = 'f3a9c1d7e5b20846f3a9c1d7e5b20846f3a9c1d7e5b20846f3a9c1d7e5b20846'
const PLACEHOLDER = 'replace-me-with-openssl-rand-hex-32-output'
/** Eight random characters: the shortest NUXT_AUTH_PASSWORD the gate accepts. */
const SHORT_AUTH = 'k7Qm2xTd'

/**
 * A configuration whose *other* fields are all valid, so each case fails for
 * exactly the reason it names. The proxy settings are part of this: since
 * review round 1 the plugin also refuses to boot without them.
 */
const VALID_PROXY = { apiKey: 'an-api-key', apiBaseUrl: 'https://arbiter.example.com' }

function boot(config: Record<string, unknown>) {
  runtimeConfig = { ...VALID_PROXY, ...config }
  return () => plugin()
}

/** Boots with no defaults filled in, for the cases about the proxy settings. */
function bootRaw(config: Record<string, unknown>) {
  runtimeConfig = config
  return () => plugin()
}

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('server/plugins/assert-config', () => {
  it('boots when the auth password is a real secret (AC-3.1)', () => {
    expect(boot({ authPassword: STRONG })).not.toThrow()
  })

  it('boots on an 8 character auth password, which used to crashloop (AC-2.1)', () => {
    // The whole point of this feature. Before the per-secret floors this threw,
    // and Railway restarted the container until the deploy was marked failed.
    expect(SHORT_AUTH).toHaveLength(8)
    expect(boot({ authPassword: SHORT_AUTH })).not.toThrow()
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['seven characters', 'a'.repeat(7)],
    ['whitespace padded to eight', '  abcd  '],
    ['not a string', 42],
  ])('refuses to boot when NUXT_AUTH_PASSWORD is %s (AC-2.2)', (_label, authPassword) => {
    // 31 characters is deliberately absent from this list: it is now valid for
    // the auth password. The session case below is where 31 still has to fail.
    expect(boot({ authPassword })).toThrow(
      /NUXT_AUTH_PASSWORD must be set and at least 8 characters long/,
    )
  })

  it('quotes 8, not 32, in the auth password message (AC-2.2)', () => {
    expect(boot({ authPassword: 'a'.repeat(7) })).not.toThrow(/32/)
  })

  it('applies the two floors independently in one boot (AC-2.3)', () => {
    // The core assertion of this task: a 31 character value passes as the auth
    // password and fails as the session key, in the same call.
    expect(boot({ authPassword: 'a'.repeat(31), session: { password: 'a'.repeat(31) } })).toThrow(
      /NUXT_SESSION_PASSWORD must be set and at least 32 characters long/,
    )
  })

  it('boots on 8 for auth plus 32 for session (AC-2.4)', () => {
    expect(boot({ authPassword: SHORT_AUTH, session: { password: 'b'.repeat(32) } })).not.toThrow()
  })

  it('still refuses the 9 character `change-me` placeholder (AC-2.5)', () => {
    // Clears the 8 floor now, so only the placeholder gate stops it.
    expect(boot({ authPassword: 'change-me' })).toThrow(/NUXT_AUTH_PASSWORD.*placeholder/)
    expect(boot({ authPassword: 'CHANGE-ME' })).toThrow(/placeholder/)
    expect(boot({ authPassword: STRONG, session: { password: 'change-me' } })).toThrow(
      // 9 < 32, so for the session key the length gate is still the one that
      // fires -- which is the correct order, not a placeholder miss.
      /NUXT_SESSION_PASSWORD must be set and at least 32 characters long/,
    )
  })

  it('refuses to boot on the .env.example placeholder (AC-3.3)', () => {
    // The placeholder is 42 characters, so the length check alone lets it past.
    expect(PLACEHOLDER.length).toBeGreaterThanOrEqual(32)
    expect(boot({ authPassword: PLACEHOLDER })).toThrow(/NUXT_AUTH_PASSWORD.*placeholder/)
  })

  it('refuses to boot on the superseded placeholder (AC-3.3)', () => {
    expect(boot({ authPassword: 'change-me-at-least-32-characters-long' })).toThrow(/placeholder/)
  })

  it('checks the session password when nuxt-auth-utils supplied one (AC-3.6)', () => {
    expect(boot({ authPassword: STRONG, session: { password: STRONG } })).not.toThrow()
    expect(boot({ authPassword: STRONG, session: { password: PLACEHOLDER } })).toThrow(
      /NUXT_SESSION_PASSWORD.*placeholder/,
    )
    expect(boot({ authPassword: STRONG, session: { password: 'short' } })).toThrow(
      /NUXT_SESSION_PASSWORD must be set/,
    )
  })

  it.each([
    ['session is absent', { authPassword: STRONG }],
    ['session is not an object', { authPassword: STRONG, session: 'nope' }],
    ['session has no password key', { authPassword: STRONG, session: { maxAge: 60 } }],
    ['session is null', { authPassword: STRONG, session: null }],
  ])('leaves the session check alone when %s (AC-3.6)', (_label, config) => {
    // This plugin does not own runtimeConfig.session; it must not fail on a
    // shape the auth module chose not to populate.
    expect(boot(config)).not.toThrow()
  })
})

// Review round 1 (F2): a deployment with valid passwords but no NUXT_API_KEY
// used to start, answer /api/health with 200 and be marked live by Railway,
// while every dashboard request went upstream with an empty X-API-Key and
// failed. nuxt.config.ts defaults apiKey to '' and apiBaseUrl to a literal, so
// "not configured" arrives here as a present-but-useless value.
describe('server/plugins/assert-config - upstream proxy settings', () => {
  it.each([
    ['missing', undefined],
    ['an empty string', ''],
    ['only whitespace', '   '],
    ['not a string', 42],
  ])('refuses to boot when NUXT_API_KEY is %s', (_label, apiKey) => {
    expect(bootRaw({ authPassword: STRONG, apiKey, apiBaseUrl: VALID_PROXY.apiBaseUrl })).toThrow(
      /NUXT_API_KEY must be set to a non-empty value/,
    )
  })

  it.each([
    ['missing', undefined],
    ['an empty string', ''],
    ['a bare host', 'arbiter.example.com'],
    ['a relative path', '/api'],
    ['a non-http scheme', 'ftp://arbiter.example.com'],
    ['a file URL', 'file:///etc/passwd'],
    ['not a string', 42],
  ])('refuses to boot when NUXT_API_BASE_URL is %s', (_label, apiBaseUrl) => {
    expect(bootRaw({ authPassword: STRONG, apiKey: VALID_PROXY.apiKey, apiBaseUrl })).toThrow(
      /NUXT_API_BASE_URL must be/,
    )
  })

  it.each(['https://arbiter.example.com', 'http://127.0.0.1:8000', 'https://host/base/path'])(
    'accepts %s as an upstream base URL',
    (apiBaseUrl) => {
      const config = { authPassword: STRONG, apiKey: VALID_PROXY.apiKey, apiBaseUrl }
      expect(bootRaw(config)).not.toThrow()
    },
  )

  it('checks the passwords before the proxy settings', () => {
    // Ordering matters for the operator reading the crash log: the secret that
    // is missing should be named first, not shadowed by a second complaint.
    expect(bootRaw({ authPassword: 'short', apiKey: '', apiBaseUrl: '' })).toThrow(
      /NUXT_AUTH_PASSWORD/,
    )
  })

  it('does not probe the upstream, only the configuration', () => {
    // Deliberate: reachability is not a property of this deployment's config.
    // A base URL that nothing is listening on must still boot, or an upstream
    // blip becomes a failed deploy.
    expect(
      bootRaw({ authPassword: STRONG, apiKey: 'k', apiBaseUrl: 'http://127.0.0.1:1' }),
    ).not.toThrow()
  })
})
