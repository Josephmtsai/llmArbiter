// Pure policy helpers for the Arbiter proxy route (spec: proxy-hardening).
//
// This module is deliberately free of h3 / Nitro auto-imports, `useRuntimeConfig`
// and any I/O, so `tests/proxyPolicy.test.ts` can import it directly without a
// Nitro runtime. Every input is a plain value; every function is side-effect free.

export const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'] as const
export type AllowedMethod = (typeof ALLOWED_METHODS)[number]

/** Methods whose request body is read and forwarded. Mirrors h3's payload-method set. */
export const PAYLOAD_METHODS: ReadonlySet<AllowedMethod> = new Set<AllowedMethod>([
  'POST',
  'PATCH',
  'DELETE',
])

/**
 * First path segment allowlist. Source of truth: every endpoint reached from
 * `composables/useApi.ts`. Matching is segment-based, so `healthz` is not `health`.
 */
export const ALLOWED_PATH_PREFIXES = [
  'analyze',
  'decisions',
  'config',
  'cases',
  'evaluate',
  'eval-pool',
  'review-queue',
  'optimizer',
  'health',
] as const

export const FORWARD_REQUEST_HEADERS = ['content-type', 'accept'] as const
export const FORWARD_RESPONSE_HEADERS = ['content-type'] as const

/** Hard upstream deadline. Fixed constant rather than runtime config (YAGNI). */
export const UPSTREAM_TIMEOUT_MS = 30_000

/**
 * The fetch spec requires a User-Agent on every outgoing request, so the runtime
 * appends its own default ('node') if we send none -- the header cannot simply be
 * omitted. Pinning it to a constant keeps the browser's real User-Agent out of the
 * upstream request while making the value deliberate rather than runtime-dependent.
 */
export const PROXY_USER_AGENT = 'arbiter-proxy'

const ALLOWED_METHOD_SET: ReadonlySet<string> = new Set(ALLOWED_METHODS)
const ALLOWED_PREFIX_SET: ReadonlySet<string> = new Set(ALLOWED_PATH_PREFIXES)

/**
 * Case-sensitive on purpose: h3's `event.method` is always upper-case, so a
 * lower-case value means something unexpected produced it and should be refused.
 */
export function isAllowedMethod(method: string): method is AllowedMethod {
  return ALLOWED_METHOD_SET.has(method)
}

export type PathRejection =
  | 'empty'
  | 'traversal'
  | 'double-slash'
  | 'not-allowed'
  | 'malformed'
  | 'unsafe-char'
  | 'not-normalized'

export type PathValidation = { ok: true; path: string } | { ok: false; reason: PathRejection }

/**
 * Origin used only to run the wildcard through the WHATWG URL parser. `.invalid`
 * is reserved by RFC 2606, so a bug that let this value escape could never resolve.
 */
const NORMALIZATION_ORIGIN = 'https://proxy.invalid'
const NORMALIZATION_BASE = NORMALIZATION_ORIGIN + '/'

/**
 * Refused outright: C0 controls, DEL, backslash (the URL parser rewrites it to
 * '/' for special schemes) and the '?' / '#' delimiters, which the parser would
 * split into query/fragment and so silently shorten the path.
 *
 * A space is deliberately NOT refused. Nitro percent-decodes the path before the
 * handler sees it, so `config/rules/my%20rule` arrives here with a literal space
 * and is a legitimate value -- `composables/useApi.ts` builds rule names and
 * review-queue ids with `encodeURIComponent`.
 */
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\\?#]/

/**
 * Validates the catch-all wildcard (no query string, no leading slash) and
 * returns the upstream path, correctly percent-encoded.
 *
 * Nitro hands the wildcard over already decoded with `decodeURI` semantics --
 * verified at runtime against the built server: `%2e%2e` arrives as `..`, `%20`
 * as a space, while reserved `%2f` stays encoded. The function therefore does
 * **not** decode again; a second decode is its own bypass class.
 *
 * Because the function is pure and callers can change, it does not rely on that
 * decoding for safety. Two independent invariants hold:
 *
 * - **Literal form.** No `..`, no leading `/`, no `//`, no character that lets
 *   the parser split or rewrite the path.
 * - **Parser identity.** The path is run through the same parser that builds the
 *   request URL and must come back unchanged: `new URL(wildcard, base)` must
 *   keep the origin and yield a `pathname` whose `decodeURI` form is exactly
 *   `'/' + wildcard`. This is what catches anything the literal check cannot --
 *   a single `.` segment (`health/.` is sent as `/health/`), and any still-encoded
 *   dot segment (`health/%2e%2e/admin` parses to `/admin`) if one ever reaches
 *   this function undecoded. Comparing the *decoded* round trip rather than the
 *   raw pathname is what lets a legitimate literal space through while still
 *   pinning the path the request is built from.
 */
export function validateProxyPath(wildcard: string): PathValidation {
  if (wildcard === '') return { ok: false, reason: 'empty' }
  if (UNSAFE_CHARS.test(wildcard)) return { ok: false, reason: 'unsafe-char' }

  // Substring rather than segment matching: no real endpoint contains '..' inside
  // a segment, so the stricter form costs nothing and needs no dot-segment parser.
  if (wildcard.includes('..')) return { ok: false, reason: 'traversal' }
  if (wildcard.startsWith('/') || wildcard.includes('//')) {
    return { ok: false, reason: 'double-slash' }
  }

  let parsed: URL
  try {
    parsed = new URL(wildcard, NORMALIZATION_BASE)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (parsed.origin !== NORMALIZATION_ORIGIN) return { ok: false, reason: 'not-normalized' }

  let roundTrip: string
  try {
    roundTrip = decodeURI(parsed.pathname)
  } catch {
    // A stray '%' that is not a valid escape, e.g. 'config/rules/100%'.
    return { ok: false, reason: 'malformed' }
  }
  if (roundTrip !== '/' + wildcard) return { ok: false, reason: 'not-normalized' }

  const firstSegment = wildcard.split('/')[0]
  if (!ALLOWED_PREFIX_SET.has(firstSegment)) return { ok: false, reason: 'not-allowed' }

  // The parser's own encoding, not the raw wildcard: a decoded space must go out
  // as '%20', since a raw space cannot appear in an HTTP request line.
  return { ok: true, path: parsed.pathname }
}

export type QueryInput = Record<string, unknown>

/**
 * Serializes a query object, skipping null/undefined values instead of emitting
 * `key=`. Arrays become repeated keys with null/undefined items skipped.
 * Returns '' when nothing remains; the caller prepends '?'.
 */
export function serializeQuery(query: QueryInput): string {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === null || item === undefined) continue
        params.append(key, String(item))
      }
      continue
    }
    if (value === null || value === undefined) continue
    params.append(key, String(value))
  }

  return params.toString()
}

/**
 * Whitelist of request headers forwarded upstream. Anything not listed --
 * notably `cookie`, `authorization`, `referer`, `user-agent`, `host` -- is
 * dropped. Repeated headers arrive as string[] and are rejoined.
 */
export function pickForwardHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const picked: Record<string, string> = {}

  for (const [rawKey, value] of Object.entries(headers)) {
    if (value === undefined) continue
    const key = rawKey.toLowerCase()
    if (!(FORWARD_REQUEST_HEADERS as readonly string[]).includes(key)) continue
    picked[key] = Array.isArray(value) ? value.join(', ') : value
  }

  return picked
}

/**
 * Whitelist of upstream response headers relayed to the browser. `set-cookie`
 * is never relayed; `content-length` / `content-encoding` are dropped because
 * the body is re-streamed.
 */
export function pickResponseHeaders(headers: Headers): Record<string, string> {
  const picked: Record<string, string> = {}

  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = headers.get(name)
    if (value !== null) picked[name] = value
  }

  return picked
}

/**
 * A 3xx from the upstream is treated as a fault rather than relayed. `redirect:
 * 'manual'` stops undici following it -- undici drops `authorization` / `cookie`
 * on a cross-origin hop but keeps custom headers, so a followed redirect would
 * carry `X-API-Key` to whatever origin the upstream named.
 */
export function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400
}

/** Replaces every occurrence of `secret` with '[redacted]'. Empty secret is a no-op. */
export function redactSecret(message: string, secret: string): string {
  if (!secret) return message
  return message.split(secret).join('[redacted]')
}

/** Fixed strings; never interpolated. See `UpstreamFailure.message`. */
export type UpstreamFailureMessage = 'upstream-timeout' | 'upstream-unreachable'

export interface UpstreamFailure {
  statusCode: 502 | 504
  /**
   * Sent to the browser, so it is a fixed token carrying no cause text: the raw
   * cause names internal hostnames, IPs and ports (`connect ECONNREFUSED
   * 10.0.7.12:8000`), which the API-key redaction does not cover.
   */
  message: UpstreamFailureMessage
  /** Server-side log line only. The API key is still redacted as a hard guarantee. */
  detail: string
}

function errorName(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const name = (value as { name?: unknown }).name
  return typeof name === 'string' ? name : undefined
}

function errorMessage(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const message = (value as { message?: unknown }).message
  return typeof message === 'string' ? message : undefined
}

function errorCause(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return undefined
  return (value as { cause?: unknown }).cause
}

/**
 * Maps a thrown fetch error to the status the browser sees. `AbortSignal.timeout`
 * rejects with a `TimeoutError` DOMException, but ofetch may wrap it, so the
 * `cause` chain is inspected one level down as well.
 */
export function classifyUpstreamError(error: unknown, secret: string): UpstreamFailure {
  const cause = errorCause(error)
  const names = [errorName(error), errorName(cause)]
  const raw = errorMessage(cause) ?? errorMessage(error) ?? 'unknown'
  const detail = redactSecret(raw, secret)

  if (names.includes('TimeoutError') || names.includes('AbortError')) {
    return { statusCode: 504, message: 'upstream-timeout', detail }
  }

  return { statusCode: 502, message: 'upstream-unreachable', detail }
}
