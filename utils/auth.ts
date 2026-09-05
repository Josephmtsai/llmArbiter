/** Base used only to parse relative paths; never appears in the result. */
const PARSE_BASE = 'http://redirect.invalid'

/**
 * True for any C0 control or DEL. Written as a scan rather than a regex because
 * a control-character character class trips ESLint's `no-control-regex`, and a
 * suppression comment would be more noise than the loop.
 */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * Open-redirect guard for the `?redirect=` query on the login page.
 *
 * Accepts only same-origin relative paths. `//host` is protocol-relative and a
 * backslash is normalised to `/` by some browsers, so both are rejected; so are
 * control characters, which the URL parser strips outright and could otherwise
 * hide a protocol-relative prefix.
 *
 * The path is then normalised through the URL parser *before* the `/login`
 * check, because `%2e%2e` and friends are path segments to a browser: without
 * normalising, `/settings/%2e%2e/login` would pass a literal prefix test and
 * still bounce the user back to the form.
 */
export function resolveSafeRedirect(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback
  if (!raw.startsWith('/')) return fallback
  if (raw.startsWith('//')) return fallback
  if (raw.includes('\\')) return fallback
  if (hasControlChars(raw)) return fallback

  let url: URL
  try {
    url = new URL(raw, PARSE_BASE)
  } catch {
    return fallback
  }
  // Re-check the origin after parsing: anything that resolved off-site got
  // there through an encoding we did not anticipate.
  if (url.origin !== PARSE_BASE) return fallback
  if (url.pathname === '/login' || url.pathname === '/login/') return fallback

  return `${url.pathname}${url.search}${url.hash}`
}
