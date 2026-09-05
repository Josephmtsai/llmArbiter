import { describe, expect, it } from 'vitest'

import {
  ALLOWED_METHODS,
  ALLOWED_PATH_PREFIXES,
  PAYLOAD_METHODS,
  PROXY_USER_AGENT,
  UPSTREAM_TIMEOUT_MS,
  classifyUpstreamError,
  isAllowedMethod,
  isRedirectStatus,
  pickForwardHeaders,
  pickResponseHeaders,
  redactSecret,
  serializeQuery,
  validateProxyPath,
} from '../server/utils/proxyPolicy'

describe('proxyPolicy - constants', () => {
  it('allows exactly the four methods useApi.ts issues', () => {
    expect([...ALLOWED_METHODS]).toEqual(['GET', 'POST', 'PATCH', 'DELETE'])
  })

  it('treats POST, PATCH and DELETE as payload methods and GET as not', () => {
    expect(PAYLOAD_METHODS.has('POST')).toBe(true)
    expect(PAYLOAD_METHODS.has('PATCH')).toBe(true)
    expect(PAYLOAD_METHODS.has('DELETE')).toBe(true)
    expect(PAYLOAD_METHODS.has('GET')).toBe(false)
  })

  it('pins the upstream deadline at 30 seconds', () => {
    expect(UPSTREAM_TIMEOUT_MS).toBe(30_000)
  })

  it('pins a constant User-Agent so the browser value is never the one sent', () => {
    expect(PROXY_USER_AGENT).toBe('arbiter-proxy')
  })
})

// AC-1.1
describe('proxyPolicy - isAllowedMethod', () => {
  it.each(['GET', 'POST', 'PATCH', 'DELETE'])('accepts %s', (method) => {
    expect(isAllowedMethod(method)).toBe(true)
  })

  it.each(['PUT', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'])('rejects %s', (method) => {
    expect(isAllowedMethod(method)).toBe(false)
  })

  it('is case-sensitive, so lower-case get is rejected', () => {
    expect(isAllowedMethod('get')).toBe(false)
  })
})

describe('proxyPolicy - validateProxyPath', () => {
  // AC-1.2
  it('accepts a nested allowed path and returns the slash-prefixed path', () => {
    expect(validateProxyPath('decisions/stats')).toEqual({ ok: true, path: '/decisions/stats' })
  })

  // AC-1.3
  it.each([...ALLOWED_PATH_PREFIXES])('accepts the bare allowed prefix %s', (prefix) => {
    expect(validateProxyPath(prefix)).toEqual({ ok: true, path: '/' + prefix })
  })

  it('matches whole segments, so healthz is not health', () => {
    expect(validateProxyPath('healthz')).toEqual({ ok: false, reason: 'not-allowed' })
  })

  it('rejects an unlisted prefix', () => {
    expect(validateProxyPath('admin/users')).toEqual({ ok: false, reason: 'not-allowed' })
  })

  // AC-1.4
  it('rejects an empty wildcard', () => {
    expect(validateProxyPath('')).toEqual({ ok: false, reason: 'empty' })
  })

  it('rejects traversal before the allowlist runs', () => {
    expect(validateProxyPath('cases/../config')).toEqual({ ok: false, reason: 'traversal' })
    expect(validateProxyPath('..')).toEqual({ ok: false, reason: 'traversal' })
  })

  it('rejects a double slash', () => {
    expect(validateProxyPath('cases//1')).toEqual({ ok: false, reason: 'double-slash' })
  })

  it('rejects a leading slash, which would produce a double slash once prefixed', () => {
    expect(validateProxyPath('/cases')).toEqual({ ok: false, reason: 'double-slash' })
  })

  it('checks traversal before double slash', () => {
    expect(validateProxyPath('cases//../config')).toEqual({ ok: false, reason: 'traversal' })
  })
})

describe('proxyPolicy - serializeQuery', () => {
  // AC-1.5
  it('skips null and undefined values instead of emitting bare keys', () => {
    expect(serializeQuery({ limit: 20, action: undefined, since: null })).toBe('limit=20')
  })

  // AC-1.6
  it('flattens arrays to repeated keys and skips null items', () => {
    expect(serializeQuery({ action: ['a', undefined, 'b', null] })).toBe('action=a&action=b')
  })

  it('returns an empty string for an empty query', () => {
    expect(serializeQuery({})).toBe('')
  })

  it('returns an empty string when every value is skipped', () => {
    expect(serializeQuery({ a: undefined, b: null, c: [] })).toBe('')
  })

  it('stringifies numbers and booleans', () => {
    expect(serializeQuery({ offset: 0, active: false })).toBe('offset=0&active=false')
  })

  it('percent-encodes spaces and ampersands', () => {
    expect(serializeQuery({ q: 'a b&c' })).toBe('q=a+b%26c')
  })
})

describe('proxyPolicy - pickForwardHeaders', () => {
  // AC-1.7
  it('keeps only content-type and accept', () => {
    expect(
      pickForwardHeaders({
        cookie: 'nuxt-session=x',
        authorization: 'Bearer y',
        referer: 'https://z',
        'user-agent': 'UA',
        'content-type': 'application/json',
        accept: 'application/json',
        host: 'localhost',
      }),
    ).toEqual({ 'content-type': 'application/json', accept: 'application/json' })
  })

  it('lower-cases input keys before matching', () => {
    expect(pickForwardHeaders({ 'Content-Type': 'text/plain', Cookie: 'a=1' })).toEqual({
      'content-type': 'text/plain',
    })
  })

  it('joins repeated header values with a comma', () => {
    expect(pickForwardHeaders({ accept: ['application/json', 'text/plain'] })).toEqual({
      accept: 'application/json, text/plain',
    })
  })

  it('drops undefined values', () => {
    expect(pickForwardHeaders({ accept: undefined })).toEqual({})
  })

  it('returns an empty object for an empty input', () => {
    expect(pickForwardHeaders({})).toEqual({})
  })
})

describe('proxyPolicy - pickResponseHeaders', () => {
  // AC-1.8
  it('relays content-type only and never set-cookie', () => {
    const headers = new Headers({
      'set-cookie': 'evil=1',
      'content-type': 'application/json',
      'content-length': '42',
      'content-encoding': 'gzip',
      'x-powered-by': 'Express',
    })
    expect(pickResponseHeaders(headers)).toEqual({ 'content-type': 'application/json' })
  })

  it('omits content-type entirely when the upstream sent none', () => {
    expect(pickResponseHeaders(new Headers())).toEqual({})
  })
})

describe('proxyPolicy - redactSecret', () => {
  it('replaces every occurrence of the secret', () => {
    expect(redactSecret('SECRET and SECRET', 'SECRET')).toBe('[redacted] and [redacted]')
  })

  it('leaves the message unchanged when the secret is empty', () => {
    expect(redactSecret('nothing to hide', '')).toBe('nothing to hide')
  })

  it('leaves the message unchanged when the secret does not appear', () => {
    expect(redactSecret('fetch failed', 'SECRET')).toBe('fetch failed')
  })
})

// AC-1.11 -- traversal and unsafe characters, on the input a real request produces.
//
// Nitro hands the catch-all wildcard to the handler *already percent-decoded*,
// with `decodeURI` semantics. Verified at runtime against the built server:
// `%2e%2e` arrives as `..`, `%20` as a literal space, while a reserved `%2f`
// stays encoded. These cases therefore feed the decoded forms. `validateProxyPath`
// never decodes again -- a second decode is its own bypass class.
describe('proxyPolicy - validateProxyPath decoded wildcards', () => {
  const NUL = String.fromCharCode(0)
  const CRLF = String.fromCharCode(13, 10)
  const DEL = String.fromCharCode(127)
  const BACKSLASH = String.fromCharCode(92)

  it.each([
    ['health/../admin', 'what health/%2e%2e/admin decodes to'],
    ['health/../../admin', 'what a multi-level encoded traversal decodes to'],
    ['cases/..', 'trailing dot segment'],
    ['health/..%2Fadmin', 'literal dots before a reserved slash the parser keeps encoded'],
  ])('rejects %s (%s) as traversal', (wildcard) => {
    expect(validateProxyPath(wildcard)).toEqual({ ok: false, reason: 'traversal' })
  })

  it.each([
    ['health' + NUL, 'decoded NUL'],
    ['health' + CRLF + 'X-Injected: 1', 'decoded CRLF header injection'],
    ['health' + DEL, 'decoded DEL'],
    ['health' + BACKSLASH + 'admin', 'backslash, which the URL parser rewrites to a slash'],
    ['health?x=1', 'query delimiter, which the parser would split off'],
    ['health#frag', 'fragment delimiter, which the parser would split off'],
  ])('rejects %s (%s) as an unsafe character', (wildcard) => {
    expect(validateProxyPath(wildcard)).toEqual({ ok: false, reason: 'unsafe-char' })
  })

  it.each([
    ['health/%zz', 'invalid escape'],
    ['health/%', 'trailing bare percent'],
    ['config/rules/100%', 'a literal percent a client failed to encode'],
  ])('rejects %s (%s) as malformed', (wildcard) => {
    expect(validateProxyPath(wildcard)).toEqual({ ok: false, reason: 'malformed' })
  })

  // A decoded space is a legitimate value, not an attack: `composables/useApi.ts`
  // builds rule names and review-queue ids with `encodeURIComponent`, so
  // `/api/arbiter/config/rules/my%20rule` reaches the handler as `my rule`. It is
  // re-encoded on the way out, because a raw space cannot appear in a request line.
  it('accepts a decoded space and re-encodes it for the upstream request', () => {
    expect(validateProxyPath('config/rules/my rule')).toEqual({
      ok: true,
      path: '/config/rules/my%20rule',
    })
  })

  // `%2f` is reserved, so `decodeURI` leaves it alone in both directions and an
  // encoded slash inside one segment survives byte-for-byte -- it must not be
  // mistaken for a path separator.
  it('accepts an encoded slash inside a segment', () => {
    expect(validateProxyPath('cases/abc%2Fdef')).toEqual({
      ok: true,
      path: '/cases/abc%2Fdef',
    })
  })

  // AC-1.12 -- parser identity. Whatever survives validation must be the exact
  // path the request is built from, so no later normalisation can move it.
  it('returns a path the URL parser leaves byte-for-byte unchanged', () => {
    for (const wildcard of ['decisions/stats', 'config/rules/my rule', 'cases/abc%2Fdef']) {
      const validated = validateProxyPath(wildcard)
      expect(validated.ok).toBe(true)
      if (!validated.ok) continue
      expect(new URL('https://upstream.test' + validated.path).pathname).toBe(validated.path)
    }
  })
})

// Defence in depth. `validateProxyPath` is a pure function whose callers can
// change, and Nitro's decoding is not a documented contract, so the function must
// stay safe when handed an *undecoded* wildcard. Nothing below is reachable
// through the current route; all of it is rejected anyway.
describe('proxyPolicy - validateProxyPath undecoded wildcards', () => {
  it.each([
    ['health/%2e%2e/admin', 'fully encoded dot segment'],
    ['health/.%2e/admin', 'half-encoded dot segment'],
    ['health/%2E%2E/admin', 'upper-case hex'],
    ['health/%2e%2e/%2e%2e/admin', 'multi-level'],
    ['health/%2f%2e%2e/admin', 'encoded separator and dots'],
    ['cases/%2e%2e', 'trailing encoded dot segment'],
  ])('rejects %s (%s), which does not survive the parser intact', (wildcard) => {
    // Not hypothetical -- assert the drift against the parser itself. Either the
    // pathname is rewritten outright (a dot segment is resolved away) or its
    // decoded form no longer matches the wildcard the allowlist was checked against.
    const parsed = new URL(wildcard, 'https://proxy.invalid/')
    expect(decodeURI(parsed.pathname)).not.toBe('/' + wildcard)
    expect(validateProxyPath(wildcard)).toEqual({ ok: false, reason: 'not-normalized' })
  })

  it.each([
    ['%2fcases', 'encoded leading slash'],
    ['cases%2f%2f1', 'encoded double slash'],
    ['health%00', 'encoded NUL'],
    ['health%0d%0aX-Injected:%201', 'encoded CRLF header injection'],
    ['health%7f', 'encoded DEL'],
    ['config/rules/my%20rule', 'an encoded space, i.e. a double-encoded client'],
  ])('rejects %s (%s)', (wildcard) => {
    expect(validateProxyPath(wildcard).ok).toBe(false)
  })
})

// AC-1.13
describe('proxyPolicy - isRedirectStatus', () => {
  it.each([300, 301, 302, 303, 307, 308, 399])('treats %i as a redirect', (status) => {
    expect(isRedirectStatus(status)).toBe(true)
  })

  it.each([200, 204, 299, 400, 404, 500, 502])('treats %i as not a redirect', (status) => {
    expect(isRedirectStatus(status)).toBe(false)
  })
})

describe('proxyPolicy - classifyUpstreamError', () => {
  // AC-1.9
  it('maps a TimeoutError DOMException to 504', () => {
    expect(classifyUpstreamError(new DOMException('slow', 'TimeoutError'), 'SECRET')).toEqual({
      statusCode: 504,
      message: 'upstream-timeout',
      detail: 'slow',
    })
  })

  it('maps a TimeoutError nested in cause to 504', () => {
    const wrapped = new Error('fetch failed', { cause: new DOMException('slow', 'TimeoutError') })
    expect(classifyUpstreamError(wrapped, 'SECRET')).toEqual({
      statusCode: 504,
      message: 'upstream-timeout',
      detail: 'slow',
    })
  })

  it('maps an AbortError to 504', () => {
    expect(classifyUpstreamError(new DOMException('gone', 'AbortError'), 'SECRET')).toEqual({
      statusCode: 504,
      message: 'upstream-timeout',
      detail: 'gone',
    })
  })

  // AC-1.10 -- the browser-facing `message` is a fixed token. The raw cause names
  // internal hosts, IPs and ports, which redaction of the API key does not cover,
  // so the cause text is confined to `detail` and only ever reaches the logs.
  it('maps a plain error to 502 without leaking the cause to the client', () => {
    expect(
      classifyUpstreamError(new Error('connect ECONNREFUSED 10.0.7.12:8000'), 'SECRET'),
    ).toEqual({
      statusCode: 502,
      message: 'upstream-unreachable',
      detail: 'connect ECONNREFUSED 10.0.7.12:8000',
    })
  })

  it('redacts the API key from the detail as well', () => {
    expect(
      classifyUpstreamError(new Error('fetch failed https://api?key=SECRET'), 'SECRET'),
    ).toEqual({
      statusCode: 502,
      message: 'upstream-unreachable',
      detail: 'fetch failed https://api?key=[redacted]',
    })
  })

  it('prefers the cause message over the wrapper message', () => {
    const wrapped = new Error('fetch failed', { cause: new Error('ECONNREFUSED 127.0.0.1:1') })
    expect(classifyUpstreamError(wrapped, 'api-key-value')).toEqual({
      statusCode: 502,
      message: 'upstream-unreachable',
      detail: 'ECONNREFUSED 127.0.0.1:1',
    })
  })

  it.each([
    ['a non-error value', 'boom'],
    ['null', null],
    ['a shape whose fields are not strings', { name: 1, message: 2, cause: 3 }],
  ])('falls back to unknown for %s', (_label, value) => {
    expect(classifyUpstreamError(value, 'SECRET')).toEqual({
      statusCode: 502,
      message: 'upstream-unreachable',
      detail: 'unknown',
    })
  })
})

// AC-1.14 -- single dot segments. These carry no `..` and no `//`, so only the
// parser-identity check catches them. Left unchecked they would be silently
// rewritten after the allowlist ran: `health/./x` is sent as `/health/x`.
describe('proxyPolicy - validateProxyPath normalization', () => {
  it.each([
    ['health/.', '/health/'],
    ['health/./x', '/health/x'],
    ['health/%2e', '/health/'],
    ['health/%2e/x', '/health/x'],
    ['cases/.', '/cases/'],
  ])('rejects %s, which the parser would rewrite to %s', (wildcard, rewritten) => {
    // The rewrite is real, not hypothetical -- assert it against the parser itself.
    expect(new URL(wildcard, 'https://proxy.invalid/').pathname).toBe(rewritten)
    expect(validateProxyPath(wildcard)).toEqual({ ok: false, reason: 'not-normalized' })
  })

  it('accepts a dot inside a segment, which is not a dot segment', () => {
    expect(validateProxyPath('config/rules/build.timeout')).toEqual({
      ok: true,
      path: '/config/rules/build.timeout',
    })
  })
})
