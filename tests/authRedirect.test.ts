import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveSafeRedirect } from '../utils/auth'

/** Built rather than written literally, so no raw control byte lands in the file. */
const ctrl = (code: number) => String.fromCharCode(code)

describe('resolveSafeRedirect', () => {
  it.each([
    ['/decisions?limit=10'],
    ['/'],
    ['/evaluate/history/12'],
    ['/settings#rules'],
    ['/loginless'],
  ])('returns %s unchanged (AC-4.1)', (path) => {
    expect(resolveSafeRedirect(path)).toBe(path)
  })

  it.each([
    ['an absolute https URL', 'https://evil.com'],
    ['an absolute http URL', 'http://evil.com/path'],
    ['a protocol-relative URL', '//evil.com'],
    ['a protocol-relative URL with a path', '//evil.com/decisions'],
    ['a leading backslash', '/\\evil.com'],
    ['a backslash inside the path', '/decisions\\..\\admin'],
    ['a bare relative path', 'decisions'],
    ['a javascript: scheme', 'javascript:alert(1)'],
    ['an empty string', ''],
  ])('falls back to / for %s (AC-4.2)', (_label, raw) => {
    expect(resolveSafeRedirect(raw)).toBe('/')
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an array of paths', ['/a', '/b']],
    ['a number', 42],
    ['an object', { path: '/a' }],
  ])('falls back to / for %s (AC-4.2)', (_label, raw) => {
    expect(resolveSafeRedirect(raw)).toBe('/')
  })

  it.each([
    '/login',
    '/login/',
    '/login?redirect=/x',
    '/login?foo=bar',
    '/login#anchor',
    '/login/#anchor',
  ])('refuses to bounce back to %s (AC-4.3)', (raw) => {
    expect(resolveSafeRedirect(raw)).toBe('/')
  })

  it.each([
    ['a percent-encoded traversal', '/settings/%2e%2e/login'],
    ['an uppercase percent-encoded traversal', '/settings/%2E%2E/login'],
    ['a literal dot-dot segment', '/settings/../login'],
    ['a mixed encoding', '/a/b/.%2e/%2e./login'],
  ])('normalises before the /login check, so %s is caught (AC-4.4)', (_label, raw) => {
    // `..` and `%2e%2e` are path segments to a browser: a literal prefix test
    // would wave these through and land the user back on the form.
    expect(resolveSafeRedirect(raw)).toBe('/')
  })

  it.each([
    ['a newline', `/${ctrl(0x0a)}/evil.com`],
    ['a carriage return', `/${ctrl(0x0d)}/evil.com`],
    ['a tab', `/${ctrl(0x09)}/evil.com`],
    ['a NUL byte', `/decisions${ctrl(0x00)}`],
    ['a DEL byte', `/decisions${ctrl(0x7f)}`],
    ['a vertical tab', `/decisions${ctrl(0x0b)}`],
  ])('rejects %s (AC-4.5)', (_label, raw) => {
    // The URL parser strips tab/LF/CR outright, which would collapse the first
    // three into a protocol-relative `//evil.com`.
    expect(resolveSafeRedirect(raw)).toBe('/')
  })

  it('normalises a traversal that stays on the site (AC-4.4)', () => {
    expect(resolveSafeRedirect('/settings/%2e%2e/decisions')).toBe('/decisions')
  })

  it('preserves query and hash through normalisation (AC-4.1)', () => {
    expect(resolveSafeRedirect('/decisions?limit=10&action=notify_human#top')).toBe(
      '/decisions?limit=10&action=notify_human#top',
    )
  })

  it('honours a caller-supplied fallback', () => {
    expect(resolveSafeRedirect('https://evil.com', '/decisions')).toBe('/decisions')
  })

  it('falls back rather than throwing if the URL parser rejects the path (AC-4.6)', () => {
    // No rooted path we could find makes the WHATWG parser throw, so the guard
    // is reached only by forcing it. It stays because the alternative is an
    // exception escaping into the login page's setup.
    vi.stubGlobal(
      'URL',
      class {
        constructor() {
          throw new TypeError('Invalid URL')
        }
      },
    )

    expect(resolveSafeRedirect('/decisions')).toBe('/')
  })

  it('falls back if parsing ever resolves off-origin (AC-4.6)', () => {
    // The guards above already make this unreachable today. It is defence for
    // the day one of them is relaxed, so it is forced here rather than left
    // untested.
    vi.stubGlobal(
      'URL',
      class {
        origin = 'https://evil.com'
        pathname = '/decisions'
        search = ''
        hash = ''
      },
    )

    expect(resolveSafeRedirect('/decisions')).toBe('/')
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
