/** Base used only to parse relative paths; never appears in the result. */
const PARSE_BASE = 'http://redirect.invalid'

/** A single backslash. Spelled this way so the escaping is unambiguous. */
const BACKSLASH = String.fromCharCode(0x5c)

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
 * The shape a redirect target must have: rooted at `/`, not protocol-relative,
 * no backslash (some browsers normalise it to `/`), no control characters (the
 * URL parser strips tab/LF/CR outright, which can uncover a `//` prefix).
 *
 * Applied twice -- see `resolveSafeRedirect`.
 */
function isRootedRelativePath(value: string): boolean {
  if (!value.startsWith('/')) return false
  if (value.startsWith('//')) return false
  if (value.includes(BACKSLASH)) return false
  if (hasControlChars(value)) return false
  return true
}

/** `/login` in any casing, with or without the trailing slash. */
function isLoginPath(pathname: string): boolean {
  const lower = pathname.toLowerCase()
  return lower === '/login' || lower === '/login/'
}

/**
 * Open-redirect guard for the `?redirect=` query on the login page.
 *
 * Accepts only same-origin relative paths, and checks that twice: once on the
 * raw input, then again on what the URL parser produced. The second pass is not
 * belt-and-braces, it is load-bearing. `%2e%2e` is a path segment to the
 * parser, so `/a/%2e%2e//evil.com` arrives looking like an ordinary rooted path
 * and comes out as `//evil.com` -- protocol-relative, and off-site the moment a
 * browser follows it. Checking the input alone lets that through.
 *
 * The origin check cannot catch it either: the input is path-relative, so the
 * resolved origin is always the parse base. It stays as defence for the day one
 * of the input guards is relaxed, not as the guard against this case.
 *
 * Normalising before the `/login` test is what stops `/settings/%2e%2e/login`
 * bouncing the user back to the form; the test is case-insensitive because
 * vue-router matches routes that way.
 */
export function resolveSafeRedirect(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback
  if (!isRootedRelativePath(raw)) return fallback

  let url: URL
  try {
    url = new URL(raw, PARSE_BASE)
  } catch {
    return fallback
  }
  if (url.origin !== PARSE_BASE) return fallback

  const normalized = `${url.pathname}${url.search}${url.hash}`
  if (!isRootedRelativePath(normalized)) return fallback
  if (isLoginPath(url.pathname)) return fallback

  return normalized
}

/**
 * Whether a failed API response should start the sign-out flow.
 *
 * Pulled out of the `useApi` interceptor and given `isClient` as an argument
 * rather than reading `import.meta.client` inline: the Vitest config rewrites
 * that flag to a literal `true`, so a branch guarded by it can never be
 * exercised both ways from a test. As a parameter, both sides are reachable.
 *
 * SSR is excluded because `middleware/auth.ts` already gates the server render,
 * and navigating mid-render would abort the request being answered.
 */
export function shouldHandleUnauthorized(opts: {
  status: number
  isClient: boolean
  path: string
}): boolean {
  if (opts.status !== 401) return false
  if (!opts.isClient) return false
  if (opts.path === '/login') return false
  return true
}
