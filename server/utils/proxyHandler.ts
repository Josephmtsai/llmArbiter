// Functional core of the Arbiter proxy (spec: proxy-hardening).
//
// `server/api/arbiter/[...].ts` is the imperative shell: it pulls values off the
// h3 event, calls `runProxy`, and writes the outcome back. Everything worth
// testing -- auth ordering, the method and path gates, header wiring, redirect
// handling, error classification -- lives here behind plain injected functions,
// so `tests/proxyHandler.test.ts` covers it without booting Nitro.

import {
  ALLOWED_METHODS,
  PAYLOAD_METHODS,
  PROXY_USER_AGENT,
  UPSTREAM_TIMEOUT_MS,
  classifyUpstreamError,
  isAllowedMethod,
  isRedirectStatus,
  pickForwardHeaders,
  pickResponseHeaders,
  serializeQuery,
  validateProxyPath,
  type AllowedMethod,
} from './proxyPolicy'

/** The subset of `Response` the proxy consumes. Keeps tests free of undici. */
export interface UpstreamResponse {
  status: number
  headers: Headers
  body: ReadableStream<Uint8Array> | null
}

/**
 * What the proxy is willing to forward as a request body: exactly what
 * `readRawBody(event, false)` produces (a `Buffer`, which is a `Uint8Array`).
 * Spelled out rather than reusing `BodyInit`, whose DOM definition pins
 * `BufferSource` to `ArrayBuffer`-backed views and so excludes `Buffer`.
 */
export type ProxyBody = string | Uint8Array | undefined

export interface UpstreamInit {
  method: AllowedMethod
  headers: Record<string, string>
  body: ProxyBody
  signal: AbortSignal
}

export interface ProxyRequest {
  method: string
  /** Catch-all router parameter. Nitro hands it over already percent-decoded. */
  wildcard: string
  query: Record<string, unknown>
  headers: Record<string, string | string[] | undefined>
}

export interface ProxyDeps {
  /** Resolves to the session user, or undefined when unauthenticated. */
  getSessionUser: () => Promise<unknown>
  /** Reads the raw request body. Rejecting means a malformed request, not a 502. */
  readBody: () => Promise<ProxyBody>
  fetchUpstream: (url: string, init: UpstreamInit) => Promise<UpstreamResponse>
  config: { apiKey: string; apiBaseUrl: string }
  /** Server-side only. Never reaches the browser. */
  logError: (line: string) => void
  /** Injectable so tests do not depend on a real timer. */
  createTimeoutSignal?: (ms: number) => AbortSignal
}

export interface ProxyErrorOutcome {
  kind: 'error'
  statusCode: number
  message: string
  headers?: Record<string, string>
}

export interface ProxyStreamOutcome {
  kind: 'stream'
  status: number
  headers: Record<string, string>
  body: ReadableStream<Uint8Array> | null
}

export type ProxyOutcome = ProxyErrorOutcome | ProxyStreamOutcome

/**
 * Upstream statuses outside this range cannot be written to a Node response, so
 * they collapse to 502 rather than crashing the handler. Mirrors what h3's
 * `sanitizeStatusCode` does, without importing it into the testable core.
 */
function sanitizeStatus(status: number): number {
  if (!Number.isInteger(status) || status < 200 || status > 599) return 502
  return status
}

export async function runProxy(request: ProxyRequest, deps: ProxyDeps): Promise<ProxyOutcome> {
  // Auth first: an unauthenticated caller must not learn which methods or paths
  // the proxy accepts, so the 401 precedes the 405 and 404 gates.
  const user = await deps.getSessionUser()
  if (!user) {
    return { kind: 'error', statusCode: 401, message: 'Unauthorized' }
  }

  const method = request.method
  if (!isAllowedMethod(method)) {
    return {
      kind: 'error',
      statusCode: 405,
      message: 'Method Not Allowed',
      headers: { Allow: ALLOWED_METHODS.join(', ') },
    }
  }

  const validated = validateProxyPath(request.wildcard)
  if (!validated.ok) {
    // The rejection reason is logged but never returned: telling a caller apart
    // 'not-allowed' from 'traversal' hands them a map of the allowlist.
    deps.logError(`[proxy] path rejected (${validated.reason})`)
    return { kind: 'error', statusCode: 404, message: 'Not Found' }
  }

  const { apiKey } = deps.config
  const base = deps.config.apiBaseUrl.replace(/\/$/, '')
  const query = serializeQuery(request.query)
  const url = `${base}${validated.path}${query ? '?' + query : ''}`

  const headers: Record<string, string> = {
    ...pickForwardHeaders(request.headers),
    'X-API-Key': apiKey,
    // Not forwarded from the browser: the runtime appends a default User-Agent
    // when none is set, so this pins the value instead of leaking or defaulting it.
    'User-Agent': PROXY_USER_AGENT,
  }

  let body: ProxyBody
  if (PAYLOAD_METHODS.has(method)) {
    try {
      body = await deps.readBody()
    } catch (error) {
      // A body that cannot be read is the client's fault. Swallowing it and
      // forwarding an empty body would turn a broken upload into a silent
      // upstream write with no payload.
      const detail = error instanceof Error ? error.message : String(error)
      deps.logError(`[proxy] request body unreadable: ${detail}`)
      return { kind: 'error', statusCode: 400, message: 'Invalid Request Body' }
    }
  }

  const createSignal = deps.createTimeoutSignal ?? ((ms: number) => AbortSignal.timeout(ms))

  let upstream: UpstreamResponse
  try {
    upstream = await deps.fetchUpstream(url, {
      method,
      headers,
      body,
      signal: createSignal(UPSTREAM_TIMEOUT_MS),
    })
  } catch (error) {
    const failure = classifyUpstreamError(error, apiKey)
    deps.logError(`[proxy] ${failure.message}: ${failure.detail}`)
    return { kind: 'error', statusCode: failure.statusCode, message: failure.message }
  }

  if (isRedirectStatus(upstream.status)) {
    // Not relayed and not followed. See `isRedirectStatus`: following it would
    // carry `X-API-Key` to the redirect target, and relaying it would let the
    // upstream steer the browser to an arbitrary origin.
    deps.logError(`[proxy] upstream redirect refused (status ${upstream.status})`)
    return { kind: 'error', statusCode: 502, message: 'upstream-unreachable' }
  }

  return {
    kind: 'stream',
    status: sanitizeStatus(upstream.status),
    headers: pickResponseHeaders(upstream.headers),
    body: upstream.body,
  }
}
