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

function boot(config: Record<string, unknown>) {
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

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['too short', 'a'.repeat(31)],
    ['not a string', 42],
  ])('refuses to boot when NUXT_AUTH_PASSWORD is %s (AC-3.2)', (_label, authPassword) => {
    expect(boot({ authPassword })).toThrow(/NUXT_AUTH_PASSWORD must be set/)
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
