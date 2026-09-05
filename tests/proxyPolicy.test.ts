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
  PROXY_MOUNT_PREFIX,
  redactSecret,
  validateProxyPath,
  validateProxyTarget,
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
// `validateProxyPath` takes the wildcard **raw**, exactly as it appeared on the
// request line: `validateProxyTarget` cuts it out of `event.node.req.originalUrl`
// rather than reading h3's decoded router parameter. Review round 2 showed why
// the decoded form cannot be validated at all -- h3's `_decodePath` is
// `decodeURIComponent`-based, so an encoded '?' becomes a real query delimiter
// before the router runs and the wildcard arrives already truncated.
describe('proxyPolicy - validateProxyPath traversal', () => {
  it.each([
    ['health/../admin', 'literal dot segments'],
    ['health/../../admin', 'multi-level'],
    ['cases/..', 'trailing dot segment'],
    ['health/..%2Fadmin', 'literal dots before a reserved slash'],
  ])('rejects %s (%s) as traversal', (wildcard) => {
    expect(validateProxyPath(wildcard)).toEqual({ ok: false, reason: 'traversal' })
  })

  // A '.' needs no encoding inside a path segment, so '%2E' is only ever an
  // attempt to slip a dot segment past the literal check. Two of these survive
  // the parser byte-for-byte -- the WHATWG parser does not treat a reserved
  // '%2F' as a separator -- so the literal rule is what stops them, not identity.
  it.each([
    ['health/%2e%2e/admin', 'fully encoded dot segment'],
    ['health/.%2e/admin', 'half-encoded dot segment'],
    ['health/%2E%2E/admin', 'upper-case hex'],
    ['health/%2e%2e/%2e%2e/admin', 'multi-level'],
    ['health/%2f%2e%2e/admin', 'encoded separator and dots'],
    ['health/%2F%2E%2E%2Fadmin', 'wholly reserved-slash separated, which the parser keeps intact'],
    ['cases/%2e%2e', 'trailing encoded dot segment'],
    ['health/%2e', 'a single encoded dot the parser would rewrite away'],
    ['health/%2e/x', 'a single encoded dot mid-path'],
  ])('rejects %s (%s) as traversal', (wildcard) => {
    expect(validateProxyPath(wildcard)).toEqual({ ok: false, reason: 'traversal' })
  })

  // The reason the literal rule has to exist: for these two the parser leaves the
  // path alone, so identity would pass them straight through to an upstream that
  // decodes '%2F' and '%2E' itself.
  it.each(['health/%2F%2E%2E%2Fadmin', 'health/%2F%2E%2E/admin'])(
    'the URL parser leaves %s intact, so identity alone would not catch it',
    (wildcard) => {
      expect(new URL(wildcard, 'https://proxy.invalid/').pathname).toBe('/' + wildcard)
    },
  )
})

describe('proxyPolicy - validateProxyPath unsafe and malformed input', () => {
  const NUL = String.fromCharCode(0)
  const CRLF = String.fromCharCode(13, 10)
  const DEL = String.fromCharCode(127)
  const BACKSLASH = String.fromCharCode(92)

  it.each([
    ['health' + NUL, 'raw NUL'],
    ['health' + CRLF + 'X-Injected: 1', 'raw CRLF header injection'],
    ['health' + DEL, 'raw DEL'],
    ['health' + BACKSLASH + 'admin', 'backslash, which the URL parser rewrites to a slash'],
    ['health?x=1', 'query delimiter, which the parser would split off'],
    ['health#frag', 'fragment delimiter, which the parser would split off'],
    ['config/rules/my rule', 'a raw space, which cannot appear in a request line'],
    ['health/café', 'a non-ASCII byte the client failed to encode'],
  ])('rejects %s (%s) as an unsafe character', (wildcard) => {
    expect(validateProxyPath(wildcard)).toEqual({ ok: false, reason: 'unsafe-char' })
  })

  // The parser passes a broken escape through untouched, so identity cannot see
  // it and the path would reach the upstream malformed.
  it.each([
    ['health/%zz', 'invalid escape'],
    ['health/%', 'trailing bare percent'],
    ['config/rules/100%', 'a literal percent a client failed to encode'],
    ['config/rules/%5', 'a truncated escape'],
  ])('rejects %s (%s) as malformed', (wildcard) => {
    expect(new URL(wildcard, 'https://proxy.invalid/').pathname).toBe('/' + wildcard)
    expect(validateProxyPath(wildcard)).toEqual({ ok: false, reason: 'malformed' })
  })
})

// AC-1.12 -- encodings a correct client actually produces must survive.
// `composables/useApi.ts` builds rule names and review-queue ids with
// `encodeURIComponent`, so these are the real inputs, and each one was a 404
// under the decoded-wildcard design that review round 2 rejected.
describe('proxyPolicy - validateProxyPath legitimate encodings', () => {
  it.each([
    ['config/rules/my%20rule', '/config/rules/my%20rule', 'an encoded space'],
    ['config/rules/rate%25limit', '/config/rules/rate%25limit', 'an encoded percent'],
    ['config/rules/a%3Fb', '/config/rules/a%3Fb', 'an encoded question mark'],
    ['config/rules/a%23b', '/config/rules/a%23b', 'an encoded hash'],
    ['cases/abc%2Fdef', '/cases/abc%2Fdef', 'an encoded slash inside a segment'],
    ['health/caf%C3%A9', '/health/caf%C3%A9', 'an encoded non-ASCII character'],
  ])('accepts %s (%s) and forwards it unchanged', (wildcard, expected) => {
    expect(validateProxyPath(wildcard)).toEqual({ ok: true, path: expected })
  })

  // Lower-case hex names the same path, so it must not be refused for spelling.
  it('accepts lower-case hex escapes and canonicalises them', () => {
    expect(validateProxyPath('cases/abc%2fdef')).toEqual({ ok: true, path: '/cases/abc%2Fdef' })
  })

  // Whatever survives validation must be the exact path the request is built
  // from, so no later normalisation can move it.
  it('returns a path the URL parser leaves byte-for-byte unchanged', () => {
    for (const wildcard of ['decisions/stats', 'config/rules/my%20rule', 'cases/abc%2Fdef']) {
      const validated = validateProxyPath(wildcard)
      expect(validated.ok).toBe(true)
      if (!validated.ok) continue
      expect(new URL('https://upstream.test' + validated.path).pathname).toBe(validated.path)
    }
  })
})

// AC-1.15 -- the split between path and query happens on the raw request line,
// before anything is decoded. This is the fix for review round 2 finding 1.
describe('proxyPolicy - validateProxyTarget', () => {
  it('splits the raw target into an upstream path and a verbatim query', () => {
    expect(validateProxyTarget('/api/arbiter/decisions?limit=5&since=null')).toEqual({
      ok: true,
      path: '/decisions',
      query: 'limit=5&since=null',
    })
  })

  it('returns an empty query when the target has none', () => {
    expect(validateProxyTarget('/api/arbiter/health')).toEqual({
      ok: true,
      path: '/health',
      query: '',
    })
  })

  // The regression review round 2 found: h3 decodes '%3F' to '?' before routing,
  // so the router-parameter form saw 'config/rules/a' and proxied to a different
  // rule with a 200. Splitting the raw line keeps the encoded '?' in the path.
  it('keeps an encoded question mark inside the path instead of splitting on it', () => {
    expect(validateProxyTarget('/api/arbiter/config/rules/a%3Fb')).toEqual({
      ok: true,
      path: '/config/rules/a%3Fb',
      query: '',
    })
  })

  it('splits on the first question mark only, leaving later ones in the query', () => {
    expect(validateProxyTarget('/api/arbiter/cases?q=a?b')).toEqual({
      ok: true,
      path: '/cases',
      query: 'q=a?b',
    })
  })

  it('relays the query byte for byte rather than re-serialising it', () => {
    const target = '/api/arbiter/decisions?tag=a%20b&tag=c&empty=&flag'
    expect(validateProxyTarget(target)).toEqual({
      ok: true,
      path: '/decisions',
      query: 'tag=a%20b&tag=c&empty=&flag',
    })
  })

  it.each([
    ['/api/arbiter/health/../admin', 'traversal'],
    ['/api/arbiter/health/%2e%2e/admin', 'traversal'],
    ['/api/arbiter/admin/users', 'not-allowed'],
    ['/api/arbiter/', 'empty'],
    ['/api/arbiter/health/%zz', 'malformed'],
  ] as const)('rejects %s with reason %s', (target, reason) => {
    expect(validateProxyTarget(target)).toEqual({ ok: false, reason })
  })

  // A target that is not under this route's mount means something rewrote the
  // raw URL before the handler ran. Refuse rather than guess at the wildcard.
  it.each(['/api/arbiter', '/api/other/health', '/health', ''])(
    'refuses %s, which is not under the mount prefix',
    (target) => {
      expect(validateProxyTarget(target)).toEqual({ ok: false, reason: 'malformed' })
    },
  )

  it('pins the mount prefix the wildcard is cut from', () => {
    expect(PROXY_MOUNT_PREFIX).toBe('/api/arbiter/')
  })

  it.each([
    ['/api/arbiter/cases?q=' + String.fromCharCode(13, 10) + 'X: 1', 'raw CRLF in the query'],
    ['/api/arbiter/cases?q=a b', 'a raw space in the query'],
    ['/api/arbiter/cases?q=a#b', 'a fragment delimiter'],
  ])('rejects %s (%s) as an unsafe character', (target) => {
    expect(validateProxyTarget(target)).toEqual({ ok: false, reason: 'unsafe-char' })
  })
})

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
