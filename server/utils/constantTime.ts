import { timingSafeEqual } from 'node:crypto'

/**
 * Constant-time buffer comparison.
 *
 * A one-line wrapper around `node:crypto.timingSafeEqual`, and deliberately its
 * own module: Vitest cannot mock a Node builtin from inside another source file
 * (the builtin namespace is sealed), so without this seam no test can tell a
 * real constant-time comparison apart from a plain `===`. Keeping the file to a
 * single call means the part that stays unverified is the part you can check by
 * reading it.
 *
 * Throws if the buffers differ in length -- callers must hash to a fixed width
 * first.
 */
export function bufferEquals(a: Buffer, b: Buffer): boolean {
  return timingSafeEqual(a, b)
}
