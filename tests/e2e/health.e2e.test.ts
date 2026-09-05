// End-to-end check of the Railway healthcheck path (spec: deploy-recovery, AC-3.x/4.x).
//
// Why this file exists (review round 1): `tests/healthEndpoint.test.ts` stubs
// `defineEventHandler` to identity and calls the handler as a plain function.
// That can only observe the object it returns -- not Nitro's route table, not
// method matching, not the status code, not response headers, and not
// `railway.toml`. Every one of those is part of "Railway marks the deploy
// healthy", and the production failure lived in exactly that layer: the
// healthcheck hit `/`, got a 302, and no unit test could have noticed.
//
// It also caught the follow-up: with the route named `health.get.ts`, Nitro
// registered GET only and `HEAD /api/health` answered 404. Railway's docs
// (https://docs.railway.com/guides/healthchecks) say the probe polls until it
// gets "any 2xx" and never state which method it sends, so the route now
// answers on any method and this file pins that.
//
// The healthcheck path is *read from `railway.toml` and then requested*, rather
// than compared against a string constant: changing it back to `/`, or to a
// path that does not exist, has to fail here.
//
// Runs against `.output/`, so it needs `pnpm build` first (`pnpm test:e2e`).

import http from 'node:http'
import net from 'node:net'
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { existsSync, readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const SERVER_ENTRY = '.output/server/index.mjs'
const RAILWAY_CONFIG = 'railway.toml'
// nuxt-auth-utils requires a session password of at least 32 characters.
const PASSWORD = 'e2e-password-at-least-32-characters-long'

interface RawResponse {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
}

// stdin is ignored, so the process type has a null stdin and non-null pipes.
let app: ChildProcessByStdio<null, Readable, Readable>
let appPort = 0
let serverLog: string[] = []

/** The value Railway will actually poll, read from the committed config. */
function healthcheckPathFromRailwayConfig(): string {
  const toml = readFileSync(RAILWAY_CONFIG, 'utf8')
  const match = /^\s*healthcheckPath\s*=\s*"([^"]*)"\s*$/m.exec(toml)
  if (!match) throw new Error(`${RAILWAY_CONFIG} has no healthcheckPath`)
  return match[1]
}

const HEALTHCHECK_PATH = healthcheckPathFromRailwayConfig()

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

function raw(path: string, method = 'GET'): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: appPort, method, path }, (res) => {
      let body = ''
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString()
      })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

function spawnApp(port: number): ChildProcessByStdio<null, Readable, Readable> {
  return spawn(process.execPath, [SERVER_ENTRY], {
    env: {
      ...process.env,
      PORT: String(port),
      NITRO_PORT: String(port),
      // Never contacted: nothing here proxies. It only has to satisfy the
      // startup assertion, which is a config check and not a reachability probe.
      NUXT_API_BASE_URL: 'http://127.0.0.1:1',
      NUXT_API_KEY: 'e2e-api-key-not-a-real-secret',
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

/** See the note in proxy.e2e.test.ts: the reserved port can be lost to a race. */
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
  await startApp()
}, 180_000)

afterAll(() => {
  app?.kill()
})

describe('healthcheck endpoint on the built server', () => {
  // GET and HEAD both, because Railway does not document which one it sends.
  it.each(['GET', 'HEAD'])('answers 2xx to %s /api/health', async (method) => {
    const res = await raw('/api/health', method)

    expect(res.status).toBeGreaterThanOrEqual(200)
    expect(res.status).toBeLessThan(300)
  })

  it('answers GET with exactly {"status":"ok"}', async () => {
    const res = await raw('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toBe('{"status":"ok"}')
  })

  it('sets no cookie on the healthcheck response', async () => {
    // A probe polled every few seconds must not be handed session state, and a
    // Set-Cookie here would mean the endpoint had picked up session middleware.
    for (const method of ['GET', 'HEAD']) {
      const res = await raw('/api/health', method)
      expect(res.headers['set-cookie']).toBeUndefined()
    }
  })

  // The method surface is open on purpose (see server/api/health.ts). This
  // pins the decision: a future rename back to `health.get.ts` fails here.
  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS'])('also answers 2xx to %s', async (method) => {
    const res = await raw('/api/health', method)

    expect(res.status).toBeGreaterThanOrEqual(200)
    expect(res.status).toBeLessThan(300)
  })

  it('does not redirect, the way the old healthcheck target did', async () => {
    const health = await raw('/api/health')
    expect(health.headers.location).toBeUndefined()

    // The control: `/` is still the 302 that broke the deploy, so the assertion
    // above is about this route and not about the app having lost its guard.
    const root = await raw('/')
    expect(root.status).toBe(302)
  })
})

describe('railway.toml healthcheckPath', () => {
  it(`points at a route that really answers 2xx (${HEALTHCHECK_PATH})`, async () => {
    // Requested, not string-compared: pointing this back at `/` (302) or at a
    // path nobody serves (404) has to fail this test.
    const res = await raw(HEALTHCHECK_PATH)

    expect(res.status).toBeGreaterThanOrEqual(200)
    expect(res.status).toBeLessThan(300)
  })

  it('is polled with the same result on HEAD', async () => {
    const res = await raw(HEALTHCHECK_PATH, 'HEAD')

    expect(res.status).toBeGreaterThanOrEqual(200)
    expect(res.status).toBeLessThan(300)
  })
})
