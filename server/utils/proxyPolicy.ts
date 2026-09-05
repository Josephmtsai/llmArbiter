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
 * Mount point of this route. The wildcard is cut from the *raw* request target
 * rather than read back out of `getRouterParam`, so the prefix is spelled out
 * here. See `validateProxyTarget` for why the raw form is the only safe input.
 */
export const PROXY_MOUNT_PREFIX = '/api/arbiter/'

/**
 * Refused outright: anything outside printable ASCII (a raw request target is
 * always printable ASCII, so a literal space or a control byte means the client
 * did not encode it), plus '\' -- which the URL parser rewrites to '/' -- and
 * the '?' / '#' delimiters, which would silently shorten the path.
 */
const UNSAFE_CHARS = /[^!-~]|[\\?#]/

/**
 * A '%' that does not begin a valid escape, e.g. 'config/rules/100%'. The URL
 * parser passes these through untouched, so the identity check below cannot see
 * them and they would be forwarded upstream as a malformed path.
 */
const BAD_ESCAPE = /%(?![0-9A-Fa-f]{2})/

/** A raw query is printable ASCII too, and '#' can never legally reach the server. */
const UNSAFE_QUERY_CHARS = /[^!-~]|#/

/**
 * Uppercases hex escapes so the identity check compares like with like: the
 * WHATWG serializer emits '%2F', so a client's '%2f' names the same path and
 * must not be rejected for spelling it in lower case.
 */
function canonicalizeEscapes(value: string): string {
  return value.replace(/%([0-9a-f]{2})/g, (_match, hex: string) => '%' + hex.toUpperCase())
}

/**
 * Validates a **raw, still percent-encoded** path suffix (no query string, no
 * leading slash) and returns the upstream path.
 *
 * The input must be raw. An earlier version of this route took h3's decoded
 * router parameter, and review round 2 showed why that cannot be made correct:
 * h3 runs `_decodePath` before routing, which is `decodeURIComponent`-based with
 * only `%2F` and `%25` protected. So `%3F` becomes a real '?' *before* the
 * router splits the query, and `/api/arbiter/config/rules/a%3Fb` silently
 * proxied to `/config/rules/a?b=` -- a different resource, with a 200. No
 * validation downstream of that split can recover the lost characters, so
 * `validateProxyTarget` reads the request line instead.
 *
 * Two invariants hold on the raw value:
 *
 * - **Literal form.** No '..', no leading '/', no '//', no character that lets
 *   the parser split or rewrite the path, and no malformed escape.
 * - **Parser identity.** The path is run through the same parser that builds the
 *   request URL and must come back unchanged: `new URL(canonical, base)` must
 *   keep the origin and yield exactly `'/' + canonical`. This is what catches
 *   what the literal checks cannot: a single '.' segment, which carries no '..'
 *   and no '//' yet is silently rewritten (`health/.` becomes `/health/`, so
 *   `health/./x` would be sent as `/health/x` after the allowlist ran).
 */
export function validateProxyPath(wildcard: string): PathValidation {
  if (wildcard === '') return { ok: false, reason: 'empty' }
  if (UNSAFE_CHARS.test(wildcard)) return { ok: false, reason: 'unsafe-char' }
  if (BAD_ESCAPE.test(wildcard)) return { ok: false, reason: 'malformed' }

  const canonical = canonicalizeEscapes(wildcard)

  // Substring rather than segment matching: no real endpoint contains '..' inside
  // a segment, so the stricter form costs nothing and needs no dot-segment parser.
  if (canonical.includes('..')) return { ok: false, reason: 'traversal' }
  // An encoded dot as well. A '.' needs no encoding inside a path segment, so
  // '%2E' only ever appears to smuggle a dot segment past a literal check -- and
  // the identity check alone does not catch it: the WHATWG parser does not treat
  // a reserved '%2F' as a separator, so 'health/%2F%2E%2E/admin' survives it
  // byte-for-byte, while an ASGI upstream decodes the whole thing and lands on
  // '/health/../admin'.
  if (canonical.includes('%2E')) return { ok: false, reason: 'traversal' }
  if (canonical.startsWith('/') || canonical.includes('//')) {
    return { ok: false, reason: 'double-slash' }
  }

  let parsed: URL
  try {
    parsed = new URL(canonical, NORMALIZATION_BASE)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (parsed.origin !== NORMALIZATION_ORIGIN) return { ok: false, reason: 'not-normalized' }
  if (parsed.pathname !== '/' + canonical) return { ok: false, reason: 'not-normalized' }

  const firstSegment = canonical.split('/')[0]
  if (!ALLOWED_PREFIX_SET.has(firstSegment)) return { ok: false, reason: 'not-allowed' }

  return { ok: true, path: parsed.pathname }
}

export type TargetValidation =
  | { ok: true; path: string; query: string }
  | { ok: false; reason: PathRejection }

/**
 * Validates a raw request target (`event.node.req.originalUrl`) and splits it
 * into the upstream path and the query string.
 *
 * Both halves come from the request line verbatim, which is the whole point:
 * h3's decoded router parameter and `getQuery` have already lost the difference
 * between an encoded delimiter and a real one. The query is forwarded exactly as
 * the client wrote it rather than parsed and re-serialised, so it cannot drift
 * either.
 */
export function validateProxyTarget(rawUrl: string): TargetValidation {
  const queryIndex = rawUrl.indexOf('?')
  const rawPath = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex)
  const query = queryIndex === -1 ? '' : rawUrl.slice(queryIndex + 1)

  // The route only ever runs under its own mount, so a mismatch means the raw
  // target was rewritten by something upstream of the handler. Refuse rather
  // than guess at the wildcard.
  if (!rawPath.startsWith(PROXY_MOUNT_PREFIX)) return { ok: false, reason: 'malformed' }
  if (UNSAFE_QUERY_CHARS.test(query)) return { ok: false, reason: 'unsafe-char' }

  const validated = validateProxyPath(rawPath.slice(PROXY_MOUNT_PREFIX.length))
  if (!validated.ok) return validated

  return { ok: true, path: validated.path, query }
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
