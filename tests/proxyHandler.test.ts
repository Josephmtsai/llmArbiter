import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import {
  runProxy,
  type ProxyDeps,
  type ProxyRequest,
  type UpstreamResponse,
} from '../server/utils/proxyHandler'

const API_KEY = 'test-api-key-value'
const BASE_URL = 'https://upstream.test'

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

function upstreamOk(overrides: Partial<UpstreamResponse> = {}): UpstreamResponse {
  return {
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    body: streamOf('{}'),
    ...overrides,
  }
}

function makeRequest(overrides: Partial<ProxyRequest> = {}): ProxyRequest {
  return {
    method: 'GET',
    rawUrl: '/api/arbiter/decisions',
    headers: {},
    ...overrides,
  }
}

interface Harness {
  deps: ProxyDeps
  fetchUpstream: Mock
  readBody: Mock
  getSessionUser: Mock
  logError: Mock
}

function makeHarness(overrides: Partial<ProxyDeps> = {}): Harness {
  const fetchUpstream = vi.fn(async () => upstreamOk())
  const readBody = vi.fn(async () => Buffer.from('{"a":1}'))
  const getSessionUser = vi.fn(async () => ({ name: 'admin' }))
  const logError = vi.fn()

  const deps: ProxyDeps = {
    getSessionUser,
    readBody,
    fetchUpstream,
    logError,
    config: { apiKey: API_KEY, apiBaseUrl: BASE_URL },
    // A real `AbortSignal.timeout` would leave a 30s timer pending in every test.
    createTimeoutSignal: () => new AbortController().signal,
    ...overrides,
  }

  return {
    deps,
    fetchUpstream: deps.fetchUpstream as Mock,
    readBody: deps.readBody as Mock,
    getSessionUser: deps.getSessionUser as Mock,
    logError: deps.logError as Mock,
  }
}

async function readStream(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!body) return ''
  const chunks: Uint8Array[] = []
  const reader = body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')
}

describe('runProxy - authentication gate', () => {
  // AC-2.1
  it('returns 401 when there is no session user', async () => {
    const h = makeHarness({ getSessionUser: vi.fn(async () => undefined) })
    const outcome = await runProxy(makeRequest(), h.deps)

    expect(outcome).toEqual({ kind: 'error', statusCode: 401, message: 'Unauthorized' })
  })

  // AC-2.2 -- the 401 must come first, or an anonymous caller could still probe
  // which methods and paths the proxy accepts by reading 405 / 404 apart.
  it('checks auth before the method gate', async () => {
    const h = makeHarness({ getSessionUser: vi.fn(async () => undefined) })
    const outcome = await runProxy(makeRequest({ method: 'PUT' }), h.deps)

    expect(outcome).toMatchObject({ statusCode: 401 })
  })

  it('checks auth before the path gate and never calls upstream', async () => {
    const h = makeHarness({ getSessionUser: vi.fn(async () => undefined) })
    const outcome = await runProxy(makeRequest({ rawUrl: '/api/arbiter/admin/users' }), h.deps)

    expect(outcome).toMatchObject({ statusCode: 401 })
    expect(h.fetchUpstream).not.toHaveBeenCalled()
  })
})

describe('runProxy - method gate', () => {
  // AC-2.3
  it('returns 405 with an Allow header for a disallowed method', async () => {
    const h = makeHarness()
    const outcome = await runProxy(makeRequest({ method: 'PUT' }), h.deps)

    expect(outcome).toEqual({
      kind: 'error',
      statusCode: 405,
      message: 'Method Not Allowed',
      headers: { Allow: 'GET, POST, PATCH, DELETE' },
    })
    expect(h.fetchUpstream).not.toHaveBeenCalled()
  })
})

describe('runProxy - path gate', () => {
  // AC-2.4
  it.each([
    ['/api/arbiter/admin/users', 'unlisted prefix'],
    ['/api/arbiter/cases/../config', 'literal traversal'],
    ['/api/arbiter/health/%2e%2e/admin', 'encoded traversal'],
    ['/api/arbiter/health/%2F%2E%2E%2Fadmin', 'traversal behind a reserved slash'],
    ['/api/arbiter/', 'empty wildcard'],
    ['/api/other/health', 'a target outside the mount prefix'],
  ])('returns 404 for %s (%s)', async (rawUrl) => {
    const h = makeHarness()
    const outcome = await runProxy(makeRequest({ rawUrl }), h.deps)

    expect(outcome).toEqual({ kind: 'error', statusCode: 404, message: 'Not Found' })
    expect(h.fetchUpstream).not.toHaveBeenCalled()
  })

  // AC-2.5 -- the reason is useful in a log and a map of the allowlist in a response.
  it('logs the rejection reason without returning it', async () => {
    const h = makeHarness()
    const outcome = await runProxy(makeRequest({ rawUrl: '/api/arbiter/admin/users' }), h.deps)

    expect(h.logError).toHaveBeenCalledWith('[proxy] path rejected (not-allowed)')
    expect(JSON.stringify(outcome)).not.toContain('not-allowed')
  })
})

describe('runProxy - upstream request construction', () => {
  // AC-2.6
  it('builds the upstream URL from the validated path and the raw query', async () => {
    const h = makeHarness()
    await runProxy(makeRequest({ rawUrl: '/api/arbiter/decisions?limit=20' }), h.deps)

    expect(h.fetchUpstream).toHaveBeenCalledWith(
      'https://upstream.test/decisions?limit=20',
      expect.anything(),
    )
  })

  it('omits the question mark when the target carries no query', async () => {
    const h = makeHarness()
    await runProxy(makeRequest({ rawUrl: '/api/arbiter/decisions' }), h.deps)

    expect(h.fetchUpstream.mock.calls[0][0]).toBe('https://upstream.test/decisions')
  })

  // The query is relayed verbatim: parsing and re-serialising it is what lost
  // data before, so an encoded space in a value must survive as '%20'.
  it('relays the query byte for byte', async () => {
    const h = makeHarness()
    await runProxy(makeRequest({ rawUrl: '/api/arbiter/cases?q=a%20b&flag' }), h.deps)

    expect(h.fetchUpstream.mock.calls[0][0]).toBe('https://upstream.test/cases?q=a%20b&flag')
  })

  // Review round 2, finding 1. Taking the path off the raw request line is what
  // keeps an encoded '?' inside the path; h3's router had already split there and
  // the proxy silently targeted a different rule with a 200.
  it('keeps an encoded question mark in the path instead of splitting the target', async () => {
    const h = makeHarness()
    await runProxy(makeRequest({ rawUrl: '/api/arbiter/config/rules/a%3Fb' }), h.deps)

    expect(h.fetchUpstream.mock.calls[0][0]).toBe('https://upstream.test/config/rules/a%3Fb')
  })

  it('forwards an encoded space in the path unchanged', async () => {
    const h = makeHarness()
    await runProxy(makeRequest({ rawUrl: '/api/arbiter/config/rules/my%20rule' }), h.deps)

    expect(h.fetchUpstream.mock.calls[0][0]).toBe('https://upstream.test/config/rules/my%20rule')
  })

  it('strips a trailing slash from the configured base URL', async () => {
    const h = makeHarness({ config: { apiKey: API_KEY, apiBaseUrl: 'https://upstream.test/' } })
    await runProxy(makeRequest(), h.deps)

    expect(h.fetchUpstream.mock.calls[0][0]).toBe('https://upstream.test/decisions')
  })

  // AC-2.7
  it('sends the API key and a pinned User-Agent, and drops browser credentials', async () => {
    const h = makeHarness()
    await runProxy(
      makeRequest({
        headers: {
          cookie: 'nuxt-session=abc',
          authorization: 'Bearer token',
          'user-agent': 'Mozilla/5.0',
          referer: 'https://dashboard.test/decisions',
          'content-type': 'application/json',
        },
      }),
      h.deps,
    )

    expect(h.fetchUpstream.mock.calls[0][1].headers).toEqual({
      'content-type': 'application/json',
      'X-API-Key': API_KEY,
      'User-Agent': 'arbiter-proxy',
    })
  })
})

describe('runProxy - request body', () => {
  // AC-2.8
  it('does not read a body for GET', async () => {
    const h = makeHarness()
    await runProxy(makeRequest({ method: 'GET' }), h.deps)

    expect(h.readBody).not.toHaveBeenCalled()
    expect(h.fetchUpstream.mock.calls[0][1].body).toBeUndefined()
  })

  it.each(['POST', 'PATCH', 'DELETE'])('forwards the raw body for %s', async (method) => {
    const h = makeHarness()
    await runProxy(makeRequest({ method, rawUrl: '/api/arbiter/analyze' }), h.deps)

    expect(h.readBody).toHaveBeenCalledOnce()
    expect(h.fetchUpstream.mock.calls[0][1].body).toEqual(Buffer.from('{"a":1}'))
  })

  // AC-2.9 -- previously the read was wrapped in `.catch(() => undefined)`, which
  // turned a truncated upload into a successful upstream write with no payload.
  it('returns 400 instead of forwarding an empty body when the read fails', async () => {
    const h = makeHarness({
      readBody: vi.fn(async () => {
        throw new Error('aborted mid-body')
      }),
    })
    const outcome = await runProxy(
      makeRequest({ method: 'POST', rawUrl: '/api/arbiter/analyze' }),
      h.deps,
    )

    expect(outcome).toEqual({ kind: 'error', statusCode: 400, message: 'Invalid Request Body' })
    expect(h.fetchUpstream).not.toHaveBeenCalled()
    expect(h.logError).toHaveBeenCalledWith('[proxy] request body unreadable: aborted mid-body')
  })

  it('logs a non-Error rejection without crashing on it', async () => {
    const h = makeHarness({
      // A rejection that is not an Error. Node stream errors usually are, but
      // nothing in the type guarantees it and String(error) is the fallback.
      readBody: vi.fn(() => Promise.reject('ECONNRESET')),
    })
    const outcome = await runProxy(
      makeRequest({ method: 'POST', rawUrl: '/api/arbiter/analyze' }),
      h.deps,
    )

    expect(outcome).toEqual({ kind: 'error', statusCode: 400, message: 'Invalid Request Body' })
    expect(h.logError).toHaveBeenCalledWith('[proxy] request body unreadable: ECONNRESET')
  })

  // Every other test injects `createTimeoutSignal`, so without this one the real
  // default -- the thing production actually runs -- is never executed.
  it('falls back to a real timeout signal when none is injected', async () => {
    const h = makeHarness()
    const deps = { ...h.deps }
    delete deps.createTimeoutSignal
    await runProxy(makeRequest(), deps)

    const signal = h.fetchUpstream.mock.calls[0][1].signal
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
  })
})

describe('runProxy - upstream failures', () => {
  // AC-2.10
  it('maps a timeout to 504 and keeps the cause out of the response', async () => {
    const h = makeHarness({
      fetchUpstream: vi.fn(async () => {
        throw new DOMException('The operation was aborted', 'TimeoutError')
      }),
    })
    const outcome = await runProxy(makeRequest(), h.deps)

    expect(outcome).toEqual({ kind: 'error', statusCode: 504, message: 'upstream-timeout' })
    expect(h.logError).toHaveBeenCalledWith('[proxy] upstream-timeout: The operation was aborted')
  })

  // AC-2.11
  it('maps a network error to 502 with no internal address in the response', async () => {
    const h = makeHarness({
      fetchUpstream: vi.fn(async () => {
        throw new Error('connect ECONNREFUSED 10.0.7.12:8000')
      }),
    })
    const outcome = await runProxy(makeRequest(), h.deps)

    expect(outcome).toEqual({ kind: 'error', statusCode: 502, message: 'upstream-unreachable' })
    expect(JSON.stringify(outcome)).not.toContain('10.0.7.12')
  })

  it('redacts the API key from the logged detail', async () => {
    const h = makeHarness({
      fetchUpstream: vi.fn(async () => {
        throw new Error(`request to https://upstream.test?key=${API_KEY} failed`)
      }),
    })
    await runProxy(makeRequest(), h.deps)

    const logged = h.logError.mock.calls[0][0] as string
    expect(logged).not.toContain(API_KEY)
    expect(logged).toContain('[redacted]')
  })
})

describe('runProxy - upstream redirects', () => {
  // AC-2.12 -- undici strips `authorization` / `cookie` across origins but keeps
  // custom headers, so following a redirect would hand `X-API-Key` to whatever
  // origin the upstream named. Relaying the 3xx would steer the browser instead.
  it.each([301, 302, 307, 308])('refuses a %i and returns 502', async (status) => {
    const h = makeHarness({
      fetchUpstream: vi.fn(async () =>
        upstreamOk({
          status,
          headers: new Headers({ location: 'https://attacker.test/collect' }),
          body: null,
        }),
      ),
    })
    const outcome = await runProxy(makeRequest(), h.deps)

    expect(outcome).toEqual({ kind: 'error', statusCode: 502, message: 'upstream-unreachable' })
    expect(JSON.stringify(outcome)).not.toContain('attacker.test')
  })

  it('logs the refused redirect status', async () => {
    const h = makeHarness({
      fetchUpstream: vi.fn(async () => upstreamOk({ status: 302, body: null })),
    })
    await runProxy(makeRequest(), h.deps)

    expect(h.logError).toHaveBeenCalledWith('[proxy] upstream redirect refused (status 302)')
  })

  // Review round 2, finding 2. A manual-redirect response still carries a live
  // body, and the pipeline that would drain it never runs for a refused 3xx. The
  // earlier tests all passed `body: null`, which hid it: the upstream socket
  // stayed occupied until GC or the 30s signal, so a redirect loop could drain
  // the connection pool while every request got a prompt 502.
  it('cancels the body of a refused redirect', async () => {
    const cancel = vi.fn(async () => undefined)
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('redirect page'))
      },
      cancel,
    })
    const h = makeHarness({
      fetchUpstream: vi.fn(async () => upstreamOk({ status: 302, body })),
    })

    const outcome = await runProxy(makeRequest(), h.deps)

    expect(outcome).toEqual({ kind: 'error', statusCode: 502, message: 'upstream-unreachable' })
    expect(cancel).toHaveBeenCalledOnce()
    expect(body.locked).toBe(false)
  })

  // A body that refuses to cancel must not turn the 502 into an unhandled
  // rejection: the browser still gets its 502.
  it('still returns 502 when cancelling the redirect body rejects', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('redirect page'))
      },
      cancel: () => Promise.reject(new Error('socket already gone')),
    })
    const h = makeHarness({
      fetchUpstream: vi.fn(async () => upstreamOk({ status: 302, body })),
    })

    const outcome = await runProxy(makeRequest(), h.deps)

    expect(outcome).toEqual({ kind: 'error', statusCode: 502, message: 'upstream-unreachable' })
  })

  // A 3xx with no body at all is the common case and must not throw.
  it('handles a refused redirect that carries no body', async () => {
    const h = makeHarness({
      fetchUpstream: vi.fn(async () => upstreamOk({ status: 307, body: null })),
    })

    const outcome = await runProxy(makeRequest(), h.deps)

    expect(outcome).toEqual({ kind: 'error', statusCode: 502, message: 'upstream-unreachable' })
  })
})

describe('runProxy - successful response', () => {
  // AC-2.13
  it('relays the status, the allowlisted headers and the body stream', async () => {
    const h = makeHarness({
      fetchUpstream: vi.fn(async () =>
        upstreamOk({
          status: 201,
          headers: new Headers({
            'content-type': 'application/json',
            'set-cookie': 'upstream=1',
            'x-powered-by': 'FastAPI',
          }),
          body: streamOf('{"decision_id":7}'),
        }),
      ),
    })
    const outcome = await runProxy(
      makeRequest({ method: 'POST', rawUrl: '/api/arbiter/analyze' }),
      h.deps,
    )

    expect(outcome.kind).toBe('stream')
    if (outcome.kind !== 'stream') return
    expect(outcome.status).toBe(201)
    expect(outcome.headers).toEqual({ 'content-type': 'application/json' })
    await expect(readStream(outcome.body)).resolves.toBe('{"decision_id":7}')
  })

  // AC-2.14 -- upstream 4xx/5xx pass through so the UI can show the real error.
  it.each([400, 404, 422, 500])('passes an upstream %i through unchanged', async (status) => {
    const h = makeHarness({ fetchUpstream: vi.fn(async () => upstreamOk({ status })) })
    const outcome = await runProxy(makeRequest(), h.deps)

    expect(outcome).toMatchObject({ kind: 'stream', status })
  })

  // AC-2.15
  it.each([0, 199, 600, 999, Number.NaN])(
    'collapses the unwritable upstream status %s to 502',
    async (status) => {
      const h = makeHarness({ fetchUpstream: vi.fn(async () => upstreamOk({ status })) })
      const outcome = await runProxy(makeRequest(), h.deps)

      expect(outcome).toMatchObject({ kind: 'stream', status: 502 })
    },
  )

  it('handles an upstream response with no body', async () => {
    const h = makeHarness({
      fetchUpstream: vi.fn(async () =>
        upstreamOk({ status: 204, headers: new Headers(), body: null }),
      ),
    })
    const outcome = await runProxy(makeRequest(), h.deps)

    expect(outcome).toEqual({ kind: 'stream', status: 204, headers: {}, body: null })
  })
})

describe('runProxy - timeout signal', () => {
  let harness: Harness

  beforeEach(() => {
    harness = makeHarness()
  })

  // AC-2.16
  it('passes an abort signal on every upstream call', async () => {
    await runProxy(makeRequest(), harness.deps)

    expect(harness.fetchUpstream.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
})
