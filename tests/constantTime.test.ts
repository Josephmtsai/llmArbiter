import { createHash, timingSafeEqual } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { bufferEquals } from '../server/utils/constantTime'

/**
 * A note on how this is tested, because the obvious approach does not work
 * here.
 *
 * The intent was to spy on `node:crypto.timingSafeEqual` and assert that
 * `bufferEquals` calls it. Vitest cannot do that in this project: Vite
 * externalises Node builtins, so `vi.mock('node:crypto', ...)` never
 * intercepts the import (verified: the factory's stub is ignored and the real
 * function still runs); `vi.spyOn` on the namespace throws "Cannot redefine
 * property" because a module namespace object is frozen; and mutating the CJS
 * `require('crypto')` object is invisible to the ESM named export. Making it
 * work would mean aliasing `node:crypto` across the whole test config, which is
 * a much larger blast radius than this one assertion is worth.
 *
 * So the delegation is pinned behaviourally instead, on the two things the real
 * builtin does that no hand-rolled comparison does: it throws on a length
 * mismatch instead of returning false, and it rejects arguments that are not
 * buffers. Together with the equal-contents case those rule out `a === b`,
 * `a.equals(b)`, `Buffer.compare(a, b) === 0` and a string comparison -- every
 * shortcut this wrapper exists to prevent. What they cannot prove is the timing
 * property itself; nothing can, which is why the module is one line long.
 */
describe('bufferEquals (AC-1.15)', () => {
  it('is true for equal contents in two different buffers', () => {
    // Rules out `a === b`: these are distinct objects.
    const a = createHash('sha256').update('secret').digest()
    const b = createHash('sha256').update('secret').digest()

    expect(a).not.toBe(b)
    expect(bufferEquals(a, b)).toBe(true)
  })

  it('is false for different contents of the same length', () => {
    const a = createHash('sha256').update('secret').digest()
    const b = createHash('sha256').update('other').digest()

    expect(a.length).toBe(b.length)
    expect(bufferEquals(a, b)).toBe(false)
  })

  it('throws on a length mismatch rather than answering false (AC-1.15)', () => {
    // This is the discriminating case. `===`, `.equals()` and `Buffer.compare`
    // all return a quiet `false` for different lengths; only the constant-time
    // builtin refuses. Callers must hash to a fixed width first, and a silent
    // false would let a caller that forgot look like it was working.
    expect(() => bufferEquals(Buffer.from('short'), Buffer.from('much longer'))).toThrow(RangeError)
  })

  it('agrees with node:crypto.timingSafeEqual on every case it is given', () => {
    const cases: ReadonlyArray<readonly [Buffer, Buffer]> = [
      [Buffer.from('a'.repeat(32)), Buffer.from('a'.repeat(32))],
      [Buffer.from('a'.repeat(32)), Buffer.from('b'.repeat(32))],
      [Buffer.alloc(0), Buffer.alloc(0)],
      [createHash('sha256').update('x').digest(), createHash('sha256').update('x').digest()],
      [createHash('sha256').update('x').digest(), createHash('sha256').update('y').digest()],
    ]

    for (const [a, b] of cases) {
      expect(bufferEquals(a, b)).toBe(timingSafeEqual(a, b))
    }
  })
})
