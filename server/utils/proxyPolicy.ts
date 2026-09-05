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

export type PathRejection = 'empty' | 'traversal' | 'double-slash' | 'not-allowed'

export type PathValidation = { ok: true; path: string } | { ok: false; reason: PathRejection }

/**
 * Validates the catch-all wildcard (no query string, no leading slash) and
 * returns the upstream path. Check order: empty -> traversal -> double-slash ->
 * allowlist. A leading slash in the wildcard would produce `//` once prefixed,
 * so it is rejected as `double-slash`.
 */
export function validateProxyPath(wildcard: string): PathValidation {
  if (wildcard === '') return { ok: false, reason: 'empty' }
  if (wildcard.includes('..')) return { ok: false, reason: 'traversal' }

  const path = '/' + wildcard
  if (path.slice(1).includes('//') || wildcard.startsWith('/')) {
    return { ok: false, reason: 'double-slash' }
  }

  const firstSegment = wildcard.split('/')[0]
  if (!ALLOWED_PREFIX_SET.has(firstSegment)) return { ok: false, reason: 'not-allowed' }

  return { ok: true, path }
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

/** Replaces every occurrence of `secret` with '[redacted]'. Empty secret is a no-op. */
export function redactSecret(message: string, secret: string): string {
  if (!secret) return message
  return message.split(secret).join('[redacted]')
}

export interface UpstreamFailure {
  statusCode: 502 | 504
  message: string
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

  if (names.includes('TimeoutError') || names.includes('AbortError')) {
    return { statusCode: 504, message: 'upstream-timeout' }
  }

  const message = errorMessage(cause) ?? errorMessage(error) ?? 'unknown'
  return { statusCode: 502, message: `upstream-unreachable: ${redactSecret(message, secret)}` }
}
