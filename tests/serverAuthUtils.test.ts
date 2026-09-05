import { describe, expect, it } from 'vitest'

import { createRateLimiter, verifyLoginPassword } from '../server/utils/auth'

const WINDOW_MS = 60_000
const T0 = 1_700_000_000_000

function newLimiter() {
  return createRateLimiter({ limit: 5, windowMs: WINDOW_MS })
}

describe('verifyLoginPassword', () => {
  it('accepts an identical password (AC-1.1)', () => {
    expect(
      verifyLoginPassword('correct-horse-battery-staple', 'correct-horse-battery-staple'),
    ).toBe(true)
  })

  it('accepts a 32+ character secret unchanged (AC-1.1)', () => {
    const secret = 'a'.repeat(48)
    expect(verifyLoginPassword(secret, secret)).toBe(true)
  })

  it.each([
    ['same length, different content', 'aaaaaaaa', 'aaaaaaab'],
    ['input shorter than expected', 'short', 'a-much-longer-expected-password'],
    ['input longer than expected', 'a-much-longer-supplied-password', 'short'],
    ['empty input', '', 'expected-password'],
    ['empty expected', 'supplied-password', ''],
    ['differing only in case', 'A', 'a'],
  ])('rejects %s without throwing (AC-1.2)', (_label, input, expected) => {
    expect(() => verifyLoginPassword(input, expected)).not.toThrow()
    expect(verifyLoginPassword(input, expected)).toBe(false)
  })

  it('treats two empty strings as equal, so callers must reject empty separately', () => {
    // Documents why login.post.ts rejects an empty password before comparing:
    // an unset NUXT_AUTH_PASSWORD would otherwise match an empty submission.
    expect(verifyLoginPassword('', '')).toBe(true)
  })
})

describe('createRateLimiter', () => {
  it('allows the first five hits in one window (AC-1.3)', () => {
    const limiter = newLimiter()
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.hit('1.2.3.4', T0 + i * 100)).toEqual({ allowed: true, retryAfterSec: 0 })
    }
  })

  it('rejects the sixth hit with a sane Retry-After (AC-1.4)', () => {
    const limiter = newLimiter()
    for (let i = 0; i < 5; i += 1) limiter.hit('1.2.3.4', T0 + i * 100)

    const sixth = limiter.hit('1.2.3.4', T0 + 500)
    expect(sixth.allowed).toBe(false)
    expect(sixth.retryAfterSec).toBeGreaterThanOrEqual(1)
    expect(sixth.retryAfterSec).toBeLessThanOrEqual(60)
  })

  it('never reports a Retry-After below one second at the window edge (AC-1.4)', () => {
    const limiter = newLimiter()
    for (let i = 0; i < 5; i += 1) limiter.hit('1.2.3.4', T0)

    // 1ms before the window expires: the raw remainder rounds to 0, and a
    // Retry-After of 0 would invite an immediate retry.
    const edge = limiter.hit('1.2.3.4', T0 + WINDOW_MS - 1)
    expect(edge).toEqual({ allowed: false, retryAfterSec: 1 })
  })

  it('lets a blocked key through again once the window has passed (AC-1.5)', () => {
    const limiter = newLimiter()
    for (let i = 0; i < 6; i += 1) limiter.hit('1.2.3.4', T0)
    expect(limiter.hit('1.2.3.4', T0 + 10).allowed).toBe(false)

    expect(limiter.hit('1.2.3.4', T0 + WINDOW_MS)).toEqual({ allowed: true, retryAfterSec: 0 })
    // The window restarts rather than resuming, so four more hits are allowed.
    for (let i = 0; i < 4; i += 1) {
      expect(limiter.hit('1.2.3.4', T0 + WINDOW_MS).allowed).toBe(true)
    }
    expect(limiter.hit('1.2.3.4', T0 + WINDOW_MS).allowed).toBe(false)
  })

  it('keeps buckets independent per key (AC-1.6)', () => {
    const limiter = newLimiter()
    for (let i = 0; i < 6; i += 1) limiter.hit('1.2.3.4', T0)
    expect(limiter.hit('1.2.3.4', T0).allowed).toBe(false)

    expect(limiter.hit('5.6.7.8', T0)).toEqual({ allowed: true, retryAfterSec: 0 })
  })

  it('drops expired buckets so the map cannot grow unbounded', () => {
    const limiter = newLimiter()
    for (let i = 0; i < 50; i += 1) limiter.hit('10.0.0.' + i, T0)

    // A later hit sweeps every stale key; the swept IP starts a fresh window.
    expect(limiter.hit('10.0.0.0', T0 + WINDOW_MS)).toEqual({ allowed: true, retryAfterSec: 0 })
  })

  it('clears every bucket on reset()', () => {
    const limiter = newLimiter()
    for (let i = 0; i < 6; i += 1) limiter.hit('1.2.3.4', T0)
    expect(limiter.hit('1.2.3.4', T0).allowed).toBe(false)

    limiter.reset()
    expect(limiter.hit('1.2.3.4', T0)).toEqual({ allowed: true, retryAfterSec: 0 })
  })

  it('defaults `now` to the current clock when omitted', () => {
    const limiter = newLimiter()
    for (let i = 0; i < 5; i += 1) expect(limiter.hit('9.9.9.9').allowed).toBe(true)
    expect(limiter.hit('9.9.9.9').allowed).toBe(false)
  })
})
