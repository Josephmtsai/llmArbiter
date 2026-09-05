import { describe, expect, it } from 'vitest'

import { resolveSafeRedirect } from '../utils/auth'

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

  it.each(['/login', '/login?redirect=/x', '/login?foo=bar'])(
    'refuses to bounce back to %s (AC-4.3)',
    (raw) => {
      expect(resolveSafeRedirect(raw)).toBe('/')
    },
  )

  it('honours a caller-supplied fallback', () => {
    expect(resolveSafeRedirect('https://evil.com', '/decisions')).toBe('/decisions')
  })
})
