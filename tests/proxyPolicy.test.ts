import { describe, expect, it } from 'vitest'

import {
  ALLOWED_METHODS,
  ALLOWED_PATH_PREFIXES,
  PAYLOAD_METHODS,
  PROXY_USER_AGENT,
  UPSTREAM_TIMEOUT_MS,
  classifyUpstreamError,
  isAllowedMethod,
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

describe('proxyPolicy - classifyUpstreamError', () => {
  // AC-1.9
  it('maps a TimeoutError DOMException to 504', () => {
    expect(classifyUpstreamError(new DOMException('x', 'TimeoutError'), 'S')).toEqual({
      statusCode: 504,
      message: 'upstream-timeout',
    })
  })

  it('maps a TimeoutError nested in cause to 504', () => {
    const wrapped = new Error('fetch failed', { cause: new DOMException('x', 'TimeoutError') })
    expect(classifyUpstreamError(wrapped, 'S')).toEqual({
      statusCode: 504,
      message: 'upstream-timeout',
    })
  })

  it('maps an AbortError to 504', () => {
    expect(classifyUpstreamError(new DOMException('x', 'AbortError'), 'S')).toEqual({
      statusCode: 504,
      message: 'upstream-timeout',
    })
  })

  // AC-1.10
  it('maps a plain error to 502 with the secret redacted', () => {
    expect(
      classifyUpstreamError(new Error('fetch failed https://api?key=SECRET'), 'SECRET'),
    ).toEqual({
      statusCode: 502,
      message: 'upstream-unreachable: fetch failed https://api?key=[redacted]',
    })
  })

  it('prefers the cause message over the wrapper message', () => {
    const wrapped = new Error('fetch failed', { cause: new Error('ECONNREFUSED 127.0.0.1:1') })
    expect(classifyUpstreamError(wrapped, 'api-key-value')).toEqual({
      statusCode: 502,
      message: 'upstream-unreachable: ECONNREFUSED 127.0.0.1:1',
    })
  })

  it('falls back to unknown for a non-error value', () => {
    expect(classifyUpstreamError('boom', 'S')).toEqual({
      statusCode: 502,
      message: 'upstream-unreachable: unknown',
    })
  })

  it('falls back to unknown for null', () => {
    expect(classifyUpstreamError(null, 'S')).toEqual({
      statusCode: 502,
      message: 'upstream-unreachable: unknown',
    })
  })

  it('falls back to unknown when name and message are not strings', () => {
    expect(classifyUpstreamError({ name: 1, message: 2, cause: 3 }, 'S')).toEqual({
      statusCode: 502,
      message: 'upstream-unreachable: unknown',
    })
  })
})
