import {
  ALLOWED_METHODS,
  PAYLOAD_METHODS,
  PROXY_USER_AGENT,
  UPSTREAM_TIMEOUT_MS,
  classifyUpstreamError,
  isAllowedMethod,
  pickForwardHeaders,
  pickResponseHeaders,
  serializeQuery,
  validateProxyPath,
} from '../../utils/proxyPolicy'

// Minimal hand-rolled proxy (spec proxy-hardening, Option C). h3's `proxyRequest`
// cannot be used: it always merges `getProxyRequestHeaders(event)` into the
// upstream request and `mergeHeaders` only sets keys, so browser `cookie` /
// `authorization` headers cannot be removed. Everything forwarded in either
// direction here is an explicit allowlist.
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const method = event.method
  if (!isAllowedMethod(method)) {
    setResponseHeader(event, 'Allow', ALLOWED_METHODS.join(', '))
    throw createError({ statusCode: 405, message: 'Method Not Allowed' })
  }

  const validated = validateProxyPath(getRouterParam(event, '_') ?? '')
  if (!validated.ok) {
    throw createError({ statusCode: 404, message: 'Not Found' })
  }

  const config = useRuntimeConfig(event)
  const apiKey = config.apiKey as string
  const base = (config.apiBaseUrl as string).replace(/\/$/, '')
  const query = serializeQuery(getQuery(event))
  const url = `${base}${validated.path}${query ? '?' + query : ''}`

  const headers: Record<string, string> = {
    ...pickForwardHeaders(getRequestHeaders(event)),
    'X-API-Key': apiKey,
    // Not forwarded from the browser: the runtime appends a default User-Agent
    // when none is set, so this pins the value instead of leaking or defaulting it.
    'User-Agent': PROXY_USER_AGENT,
  }

  const body = PAYLOAD_METHODS.has(method)
    ? await readRawBody(event, false).catch(() => undefined)
    : undefined

  let upstream: Response
  try {
    upstream = await $fetch.raw<ReadableStream>(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      responseType: 'stream',
      // ofetch retries retryable 5xx on idempotent methods by default, which
      // would multiply the effective deadline against an already-slow upstream.
      retry: 0,
      // Keep upstream 4xx/5xx as pass-through status codes instead of throws.
      ignoreResponseError: true,
    })
  } catch (error) {
    const failure = classifyUpstreamError(error, apiKey)
    // `cause` is deliberately not attached: Nitro serializes it to the browser in dev.
    throw createError({ statusCode: failure.statusCode, message: failure.message })
  }

  setResponseStatus(event, sanitizeStatusCode(upstream.status, 502))
  setResponseHeaders(event, pickResponseHeaders(upstream.headers))
  if (!upstream.body) return null
  return sendStream(event, upstream.body)
})
