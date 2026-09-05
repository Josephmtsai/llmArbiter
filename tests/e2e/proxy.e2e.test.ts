// End-to-end check of the Arbiter proxy route (spec: proxy-hardening, AC-3.x).
//
// `server/api/arbiter/[...].ts` is the one part of the feature that unit tests
// cannot reach: what it receives depends on how Nitro parses and decodes the
// request line, which is not something `runProxy`'s injected dependencies can
// model. Getting that wrong is exactly the class of bug this spec exists to
// prevent, and it has already happened twice --
//
//   round 1: the handler was written against the assumption that the wildcard
//            arrives percent-encoded, which 404'd a legitimate
//            `config/rules/my%20rule` while every unit test stayed green;
//   round 2: h3 decodes the path with `decodeURIComponent` semantics before
//            routing, so an encoded '?' became a real query delimiter and
//            `config/rules/a%3Fb` silently proxied to a *different* rule with a 200.
//
// So this file drives the *built* server over a raw socket. A raw socket matters:
// `fetch`/undici normalises `..` away client-side, so an attack path has to be
// written verbatim onto the wire to be tested at all.
//
// Every assertion here is about state the shell cannot fake -- what the upstream
// received, what the browser received, whether a second origin was contacted at
// all -- so that deleting a control from the shell fails a test rather than
// passing one that only ever exercised an injected mock.
//
// Runs against `.output/`, so it needs `pnpm build` first. It is excluded from
// `pnpm test` / `pnpm test:coverage` and runs as its own CI step after the build
// (`pnpm test:e2e`, see .github/workflows/ci.yml).

import http from 'node:http'
import net from 'node:net'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { existsSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const SERVER_ENTRY = '.output/server/index.mjs'
const API_KEY = 'e2e-api-key-not-a-real-secret'
// nuxt-auth-utils requires a session password of at least 32 characters.
const PASSWORD = 'e2e-password-at-least-32-characters-long'

/** Path the mock upstream answers with a cross-origin 302 that also has a body. */
const REDIRECT_PATH = '/config/redirect-me'
/** Path the mock upstream answers with a payload far larger than one chunk. */
const LARGE_PATH = '/cases/large'
const LARGE_BODY = 'x'.repeat(512 * 1024)

interface UpstreamHit {
  method: string
  url: string
  headers: http.IncomingHttpHeaders
  body: string
}

interface RawResponse {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
}

interface RawOptions {
  method?: string
  body?: string
  headers?: http.OutgoingHttpHeaders
  /** Defaults to the logged-in session cookie. Pass '' to send none. */
  cookie?: string
}

const upstreamHits: UpstreamHit[] = []
/** Where a followed redirect would land. Must never be contacted. */
const redirectTargetHits: string[] = []

let upstream: http.Server
let redirectTarget: http.Server
let redirectTargetOrigin = ''
// stdin is ignored, so the process type has a null stdin and non-null pipes.
let app: ChildProcessByStdio<null, Readable, Readable>
let appPort = 0
let cookie = ''
let serverLog: string[] = []

/** Reserves an ephemeral port and releases it, so the app can bind to it. */
function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close()
        reject(new Error('could not reserve a port'))
        return
      }
      const { port } = address
      probe.close(() => resolve(port))
    })
  })
}

function collectBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })
    req.on('end', () => resolve(body))
  })
}

/**
 * Issues the request with the path written verbatim onto the wire. `fetch` would
 * resolve `..` before sending, which would make every traversal case vacuous.
 */
function raw(path: string, options: RawOptions = {}): Promise<RawResponse> {
  const sentCookie = options.cookie ?? cookie
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: appPort,
        method: options.method ?? 'GET',
        path,
        headers: {
          ...(sentCookie ? { cookie: sentCookie } : {}),
          ...(options.body === undefined
            ? {}
            : { 'content-length': Buffer.byteLength(options.body) }),
          ...options.headers,
        },
      },
      (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
      },
    )
    req.on('error', reject)
    if (options.body !== undefined) req.write(options.body)
    req.end()
  })
}

function portOf(server: http.Server): number {
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('server did not bind to a port')
  }
  return address.port
}

function spawnApp(port: number): ChildProcessByStdio<null, Readable, Readable> {
  return spawn(process.execPath, [SERVER_ENTRY], {
    env: {
      ...process.env,
      PORT: String(port),
      NITRO_PORT: String(port),
      NUXT_API_BASE_URL: `http://127.0.0.1:${portOf(upstream)}`,
      NUXT_API_KEY: API_KEY,
      NUXT_AUTH_PASSWORD: PASSWORD,
      NUXT_SESSION_PASSWORD: PASSWORD,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function waitForApp(child: ChildProcessByStdio<null, Readable, Readable>): Promise<boolean> {
  let exited = false
  child.once('exit', () => {
    exited = true
  })
  for (let attempt = 0; attempt < 120; attempt++) {
    if (exited) return false
    try {
      await fetch(`http://127.0.0.1:${appPort}/api/auth/check`)
      return true
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  return false
}

/**
 * `reservePort` has to release the port before the app can bind it, so it is
 * unclaimed for the length of a process start-up -- long enough for a parallel
 * CI job to take it. Rather than pretend that window does not exist, treat a
 * lost race as expected and try another port. (`PORT=0` is not an option: Nitro
 * reads it as falsy and falls back to 3000.)
 */
async function startApp(): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    appPort = await reservePort()
    serverLog = []
    const child = spawnApp(appPort)
    child.stdout.on('data', (chunk: Buffer) => serverLog.push(chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => serverLog.push(chunk.toString()))

    if (await waitForApp(child)) {
      app = child
      return
    }

    child.kill()
    if (!serverLog.join('').includes('EADDRINUSE')) {
      throw new Error('app did not start:\n' + serverLog.join(''))
    }
  }
  throw new Error('app could not claim a free port in 5 attempts')
}

beforeAll(async () => {
  if (!existsSync(SERVER_ENTRY)) {
    throw new Error(`${SERVER_ENTRY} is missing. Run \`pnpm build\` before \`pnpm test:e2e\`.`)
  }

  redirectTarget = http.createServer((req, res) => {
    redirectTargetHits.push(req.url ?? '')
    res.writeHead(200).end('collected')
  })
  await new Promise<void>((resolve) => redirectTarget.listen(0, '127.0.0.1', resolve))
  redirectTargetOrigin = `http://127.0.0.1:${portOf(redirectTarget)}`

  upstream = http.createServer((req, res) => {
    void collectBody(req).then((body) => {
      upstreamHits.push({
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body,
      })

      if (req.url === REDIRECT_PATH) {
        // A 3xx that also streams a body: refusing it has to cancel that body,
        // not merely ignore it.
        res.writeHead(302, {
          location: `${redirectTargetOrigin}/collect`,
          'content-type': 'text/html',
        })
        res.end('<html>moved</html>')
        return
      }
      if (req.url === LARGE_PATH) {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end(LARGE_BODY)
        return
      }

      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ reached: req.url }))
    })
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))

  await startApp()

  const loginRes = await fetch(`http://127.0.0.1:${appPort}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })
  cookie = (loginRes.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  if (!cookie) {
    throw new Error(`login failed: ${loginRes.status} ${await loginRes.text()}`)
  }
}, 180_000)

afterAll(async () => {
  app?.kill()
  for (const server of [upstream, redirectTarget]) {
    await new Promise<void>((resolve) => {
      if (!server) return resolve()
      server.close(() => resolve())
    })
  }
})

// AC-3.1 -- no traversal shape, encoded or not, may reach the upstream.
describe('proxy route - path traversal over a raw socket', () => {
  it.each([
    ['/api/arbiter/health/%2e%2e/admin', 'fully encoded dot segment'],
    ['/api/arbiter/health/.%2e/admin', 'half-encoded dot segment'],
    ['/api/arbiter/health/%2E%2E/admin', 'upper-case hex'],
    ['/api/arbiter/health/%2e%2e/%2e%2e/admin', 'multi-level'],
    ['/api/arbiter/cases/../config/provider', 'literal dot segments'],
    ['/api/arbiter/health/..%2fadmin', 'encoded separator after literal dots'],
    ['/api/arbiter/health/%2F%2E%2E%2Fadmin', 'traversal behind a reserved slash'],
    ['/api/arbiter/health/.', 'single dot segment the parser would rewrite'],
    ['/api/arbiter/admin/users', 'unlisted prefix'],
  ])('returns 404 for %s (%s) without contacting the upstream', async (path) => {
    const before = upstreamHits.length
    const res = await raw(path)

    expect(res.status).toBe(404)
    expect(upstreamHits.slice(before)).toEqual([])
  })

  // The rejection reason is a map of the allowlist, so it stays in the log.
  it('does not leak the rejection reason to the client', async () => {
    const res = await raw('/api/arbiter/admin/users')

    expect(res.body).not.toContain('not-allowed')
    expect(res.body).not.toContain('traversal')
  })
})

// AC-3.2 -- an encoding a correct client produces has to reach the upstream
// unchanged. Every case below was a 404 or a wrong-resource 200 under one of the
// two designs review rejected.
describe('proxy route - legitimate paths', () => {
  it.each([
    ['/api/arbiter/health', '/health', 'a bare allowed prefix'],
    ['/api/arbiter/config/rules/my%20rule', '/config/rules/my%20rule', 'an encoded space'],
    ['/api/arbiter/config/rules/a%3Fb', '/config/rules/a%3Fb', 'an encoded question mark'],
    ['/api/arbiter/config/rules/rate%25limit', '/config/rules/rate%25limit', 'an encoded percent'],
    ['/api/arbiter/config/rules/a%23b', '/config/rules/a%23b', 'an encoded hash'],
    ['/api/arbiter/decisions?limit=5', '/decisions?limit=5', 'a query string'],
    ['/api/arbiter/decisions?q=a%20b', '/decisions?q=a%20b', 'an encoded space in the query'],
  ])('forwards %s to %s (%s)', async (path, expected) => {
    const res = await raw(path)

    expect(res.status).toBe(200)
    expect(upstreamHits.at(-1)?.url).toBe(expected)
  })
})

// AC-3.4 -- the shell's own wiring. Each of these fails if a single line is
// deleted from `server/api/arbiter/[...].ts`, which the unit tests cannot see:
// they exercise `runProxy` against injected doubles, so nothing there notices
// when the shell stops passing the real thing in.
describe('proxy route - shell wiring', () => {
  // Dropping `redirect: 'manual'` makes undici follow the 302 and carry
  // `X-API-Key` to whatever origin the upstream named.
  it('refuses an upstream redirect instead of following it', async () => {
    const before = redirectTargetHits.length
    const res = await raw(`/api/arbiter${REDIRECT_PATH}`)

    expect(res.status).toBe(502)
    expect(redirectTargetHits.slice(before)).toEqual([])
    expect(res.headers.location).toBeUndefined()
    expect(res.body).not.toContain(redirectTargetOrigin)
  })

  // Wiring `getSessionUser` to anything truthy opens the upstream to anonymous
  // callers. Every other case here is authenticated, so only this one notices.
  it('rejects an unauthenticated request without contacting the upstream', async () => {
    const before = upstreamHits.length
    const res = await raw('/api/arbiter/health', { cookie: '' })

    expect(res.status).toBe(401)
    expect(upstreamHits.slice(before)).toEqual([])
  })

  it('rejects a method outside the allowlist', async () => {
    const before = upstreamHits.length
    const res = await raw('/api/arbiter/health', { method: 'PUT' })

    expect(res.status).toBe(405)
    expect(upstreamHits.slice(before)).toEqual([])
  })

  // Replacing the `pipeline` with a bare `res.end()` leaves status, upstream-URL
  // and header assertions all passing while every response body is silently
  // dropped. A payload larger than one chunk also exercises backpressure.
  it('relays the whole upstream body to the browser', async () => {
    const res = await raw(`/api/arbiter${LARGE_PATH}`)

    expect(res.status).toBe(200)
    expect(res.body.length).toBe(LARGE_BODY.length)
    expect(res.body).toBe(LARGE_BODY)
  })

  it('relays the upstream content-type', async () => {
    const res = await raw('/api/arbiter/health')

    expect(res.headers['content-type']).toContain('application/json')
  })

  // Wiring `readBody` to `undefined` turns every mutation into a bodyless write
  // upstream. All the other cases are GETs, so only these notice.
  it.each(['POST', 'PATCH', 'DELETE'])('forwards the request body on %s', async (method) => {
    const payload = JSON.stringify({ method, note: 'body must survive the hop' })
    const res = await raw('/api/arbiter/analyze', {
      method,
      body: payload,
      headers: { 'content-type': 'application/json' },
    })

    expect(res.status).toBe(200)
    const hit = upstreamHits.at(-1)
    expect(hit?.method).toBe(method)
    expect(hit?.body).toBe(payload)
    expect(hit?.headers['content-type']).toContain('application/json')
  })
})

// AC-3.3 -- header wiring, asserted on what the upstream actually received.
describe('proxy route - forwarded headers', () => {
  it('sends the API key on every upstream request', () => {
    expect(upstreamHits.length).toBeGreaterThan(0)
    expect(upstreamHits.every((hit) => hit.headers['x-api-key'] === API_KEY)).toBe(true)
  })

  it('never forwards the browser session cookie', () => {
    expect(upstreamHits.some((hit) => hit.headers.cookie)).toBe(false)
  })

  it('pins the User-Agent', () => {
    expect([...new Set(upstreamHits.map((hit) => hit.headers['user-agent']))]).toEqual([
      'arbiter-proxy',
    ])
  })
})
