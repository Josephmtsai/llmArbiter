// End-to-end check of the Arbiter proxy route (spec: proxy-hardening, AC-3.x).
//
// `server/api/arbiter/[...].ts` is the one part of the feature that unit tests
// cannot reach: what it receives depends on how Nitro parses and decodes the
// request line, which is not something `runProxy`'s injected dependencies can
// model. Getting that wrong is exactly the class of bug this spec exists to
// prevent -- during review round 1 the handler was briefly written against the
// assumption that the wildcard arrives percent-encoded, which 404'd a legitimate
// `config/rules/my%20rule` while every unit test stayed green.
//
// So this file drives the *built* server over a raw socket. A raw socket matters:
// `fetch`/undici normalises `..` away client-side, so an attack path has to be
// written verbatim onto the wire to be tested at all.
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

interface UpstreamHit {
  url: string
  headers: http.IncomingHttpHeaders
}

interface RawResponse {
  status: number
  body: string
}

const upstreamHits: UpstreamHit[] = []
let upstream: http.Server
// stdin is ignored, so the process type has a null stdin and non-null pipes.
let app: ChildProcessByStdio<null, Readable, Readable>
let appPort = 0
let cookie = ''
const serverLog: string[] = []

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

/**
 * Issues the request with the path written verbatim onto the wire. `fetch` would
 * resolve `..` before sending, which would make every traversal case vacuous.
 */
function rawGet(path: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: appPort, method: 'GET', path, headers: { cookie } },
      (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

async function waitForApp(): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      await fetch(`http://127.0.0.1:${appPort}/api/auth/check`)
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw new Error('app did not start:\n' + serverLog.join(''))
}

beforeAll(async () => {
  if (!existsSync(SERVER_ENTRY)) {
    throw new Error(`${SERVER_ENTRY} is missing. Run \`pnpm build\` before \`pnpm test:e2e\`.`)
  }

  upstream = http.createServer((req, res) => {
    upstreamHits.push({ url: req.url ?? '', headers: req.headers })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ reached: req.url }))
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const upstreamAddress = upstream.address()
  if (upstreamAddress === null || typeof upstreamAddress === 'string') {
    throw new Error('mock upstream did not bind to a port')
  }

  appPort = await reservePort()
  app = spawn(process.execPath, [SERVER_ENTRY], {
    env: {
      ...process.env,
      PORT: String(appPort),
      NITRO_PORT: String(appPort),
      NUXT_API_BASE_URL: `http://127.0.0.1:${upstreamAddress.port}`,
      NUXT_API_KEY: API_KEY,
      NUXT_AUTH_PASSWORD: PASSWORD,
      NUXT_SESSION_PASSWORD: PASSWORD,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  app.stdout.on('data', (chunk: Buffer) => serverLog.push(chunk.toString()))
  app.stderr.on('data', (chunk: Buffer) => serverLog.push(chunk.toString()))

  await waitForApp()

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
  await new Promise<void>((resolve) => {
    if (!upstream) return resolve()
    upstream.close(() => resolve())
  })
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
    ['/api/arbiter/health/.', 'single dot segment the parser would rewrite'],
    ['/api/arbiter/admin/users', 'unlisted prefix'],
  ])('returns 404 for %s (%s) without contacting the upstream', async (path) => {
    const before = upstreamHits.length
    const res = await rawGet(path)

    expect(res.status).toBe(404)
    expect(upstreamHits.slice(before)).toEqual([])
  })

  // The rejection reason is a map of the allowlist, so it stays in the log.
  it('does not leak the rejection reason to the client', async () => {
    const res = await rawGet('/api/arbiter/admin/users')

    expect(res.body).not.toContain('not-allowed')
    expect(res.body).not.toContain('traversal')
  })
})

// AC-3.2 -- Nitro percent-decodes the wildcard before the handler, so a client
// that correctly encodes a rule name must still reach the upstream.
describe('proxy route - legitimate paths', () => {
  it('forwards an allowed path', async () => {
    const res = await rawGet('/api/arbiter/health')

    expect(res.status).toBe(200)
    expect(upstreamHits.at(-1)?.url).toBe('/health')
  })

  it('forwards an encoded space, re-encoded, rather than 404ing it', async () => {
    const res = await rawGet('/api/arbiter/config/rules/my%20rule')

    expect(res.status).toBe(200)
    expect(upstreamHits.at(-1)?.url).toBe('/config/rules/my%20rule')
  })

  it('forwards the query string', async () => {
    const res = await rawGet('/api/arbiter/decisions?limit=5')

    expect(res.status).toBe(200)
    expect(upstreamHits.at(-1)?.url).toBe('/decisions?limit=5')
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
