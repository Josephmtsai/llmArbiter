# Arbiter Dashboard

Vue 3 + Nuxt.js frontend for the **CI/CD LLM Arbiter** — a build-failure auto-decision management UI.

Backend lives at `https://artbiter-production.up.railway.app` (FastAPI on Railway).

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Nuxt 3 (Vue 3 + `<script setup lang="ts">`) |
| Build | Nuxt default Vite builder |
| Styling | Tailwind CSS (dark-only, design tokens in `assets/css/design-tokens.css`) |
| State | Pinia (Composition API style) |
| Auth | `nuxt-auth-utils` (password-based, server-side session) |
| Test | Vitest + Vue Test Utils |
| Package manager | pnpm |

---

## Project Structure

```
pages/          # Route pages: /analyze /decisions /settings /cases /evaluate /login
components/     # Auto-imported UI components (PascalCase)
composables/    # Auto-imported logic (useXxx.ts)
stores/         # Pinia stores
server/api/     # Nuxt server routes (auth proxy, etc.)
assets/css/     # design-tokens.css (CSS variables)
types/          # Shared TypeScript types
```

---

## Local Dev

```bash
pnpm install
cp .env.example .env        # fill in values (see Environment Variables below)
pnpm dev                    # http://localhost:3000
```

```bash
pnpm lint                   # ESLint fix
pnpm format                 # Prettier
pnpm vue-tsc                # type-check (no emit)
pnpm test                   # Vitest
pnpm test:coverage          # coverage report (target ≥ 80%)
```

---

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `NUXT_AUTH_PASSWORD` | server-only | Password for the login page (min **8** chars — 8–15 random characters recommended) |
| `NUXT_SESSION_PASSWORD` | server-only | Session encryption key (min 32 chars for `nuxt-auth-utils`) |
| `NUXT_API_BASE_URL` | server-only | Backend base URL — never exposed to the browser |
| `NUXT_API_KEY` | server-only | `X-API-Key` sent only from the Nuxt server proxy — never in the browser |
| `PORT` | server-only | Port for the Nuxt/Nitro server on Railway (`8080` for this deployment) |

> **Rule**: `runtimeConfig.public.*` is exposed to the browser. Never put secrets there.
> Server-only secrets go under `runtimeConfig.*` (no `public` prefix).

> **The two password floors are different, on purpose.** `NUXT_AUTH_PASSWORD` needs
> **≥ 8** characters; `NUXT_SESSION_PASSWORD` needs **≥ 32**. The session password is
> `nuxt-auth-utils`' encryption key (the iron-webcrypto seal key) and the module
> requires 32 itself, so that one is not ours to lower. The login password is a
> human-typed secret sitting behind a rate-limited endpoint (5 attempts per address per
> minute **and** 30 per minute across all sources combined), and that rate limiter is
> what makes 8 acceptable — so pick 8–15 **random** characters, never a dictionary word.
> The server asserts both at startup and refuses to boot otherwise
> (`server/plugins/assert-config.ts`).

> **`NUXT_API_KEY` and `NUXT_API_BASE_URL` are also asserted at startup.** The key must
> be non-empty and the base URL an absolute `http(s)` URL. Without that check a
> deployment with no API key starts, answers the healthcheck with `200`, is marked live
> by Railway — and then fails every dashboard request upstream with an empty
> `X-API-Key`. The assertion is on the *configuration* only: the upstream is never
> contacted at boot, so an upstream outage cannot fail a deploy.

`.env.example`:
```
NUXT_AUTH_PASSWORD=replace-me-with-openssl-rand-hex-32-output
NUXT_SESSION_PASSWORD=replace-me-with-openssl-rand-hex-32-output
NUXT_API_BASE_URL=https://artbiter-production.up.railway.app
NUXT_API_KEY=your_api_key_here
PORT=8080
```

---

## API Integration

All browser API calls go to the Nuxt server proxy at `/api/arbiter/*`.
The Nuxt server adds `X-API-Key` and forwards the request to the real backend.
The API key is **never sent to the browser**.

All API calls must go through Nuxt's `$fetch` / `useFetch` — never raw `fetch` or axios.

### Composable pattern

```ts
// composables/useApi.ts — no API key needed; proxy handles it server-side
export function useApi() {
  return $fetch.create({ baseURL: '/api/arbiter' })
}
```

### Proxy route

```ts
// server/api/arbiter/[...].ts — catch-all that forwards to the real backend
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session.user) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const config = useRuntimeConfig(event)
  const path = event.path.replace(/^\/api\/arbiter/, '')
  return proxyRequest(event, `${config.apiBaseUrl}${path}`, {
    headers: { 'X-API-Key': config.apiKey as string },
  })
})
```

### Key endpoints

```
POST /analyze                              → ArbiterDecision
GET  /decisions?limit&offset&action&provider&since&until
GET  /decisions/stats?window_hours=24
GET  /config/rules
PATCH /config/rules/{rule_name}
GET  /config/provider
PATCH /config/provider
GET  /config/prompts
POST /config/prompts
PATCH /config/prompts/{prompt_id}/activate
GET  /cases?limit&offset
POST /cases
DELETE /cases/{case_id}
POST /cases/seed
POST /evaluate
GET  /evaluate/results?prompt_version_id
```

### TypeScript types (source of truth)

Located in `types/api.ts`. Key types:

```ts
interface ArbiterResponse<T = Record<string, unknown>> {
  status: 'success' | 'error'
  data: T
  message: string
}

type PrimaryAction = 'trigger_rebuild' | 'trigger_fallback' | 'trigger_restart' | 'notify_human' | 'send_email'

interface DecisionData {
  primary_action: PrimaryAction
  side_action: 'notify_human' | 'send_email' | null
  confidence: number       // 0.0–1.0
  reason: string
  thinking: string | null
  source: 'manual' | 'jenkins' | 'redfish'
  provider: string
  decision_id: number
}
```

Full type definitions in `docs/for-claude-design.md` section D.

---

## Optional rsbuild

This project currently uses Nuxt's default Vite builder. rsbuild is an optional future optimization, not required for Railway deploy.

### Setup

```bash
pnpm add -D @nuxt/rsbuild
```

`nuxt.config.ts`:
```ts
export default defineNuxtConfig({
  builder: 'rsbuild',          // swap bundler
  // ... rest of config unchanged
})
```

`rsbuild.config.ts` (project root, optional overrides):
```ts
import { defineRsbuildConfig } from '@nuxt/rsbuild'

export default defineRsbuildConfig({
  // Custom rsbuild rules go here if needed
})
```

> rsbuild is a drop-in replacement — no changes to components or composables required.

---

## Deploy to Railway

### Services required

| Service | Details |
|---------|---------|
| **Frontend** (this repo) | Nuxt 3 SSR Node server |
| **Backend** | FastAPI on Railway (already deployed) |
| **Database** | PostgreSQL plugin (backend only) |

### Steps

1. **Connect repo** → Railway dashboard → New Project → Deploy from GitHub repo (this repo).

2. **Build & Start commands**:

   | | Command |
   |---|---------|
   | Build | Dockerfile (`node:20.19.5-slim`, `pnpm@9.15.9`) |
   | Start | `node .output/server/index.mjs` |

3. **Environment variables** in Railway service settings:

   ```
   NUXT_AUTH_PASSWORD=<random-secret-min-8-chars>
   NUXT_SESSION_PASSWORD=<strong-session-secret-min-32-chars>
   NUXT_API_BASE_URL=https://artbiter-production.up.railway.app
   NUXT_API_KEY=<your-api-key>
   PORT=8080
   ```

   The two floors differ: `NUXT_AUTH_PASSWORD` must be **at least 8** characters and
   `NUXT_SESSION_PASSWORD` **at least 32**. The session password is `nuxt-auth-utils`'
   encryption key, so 32 is a hard requirement of the module. The login password is
   allowed to be shorter because the login endpoint is rate limited — 5 attempts per
   address per minute, and 30 per minute in total — which is the compensating control
   that makes 8 defensible, so it must be **randomly generated**, not a dictionary word.

   > The per-address half of that limiter can only be as good as the forwarding headers
   > Railway sends, and their semantics are
   > [disputed by Railway's own staff](https://station.railway.com/questions/which-header-should-i-rely-on-for-real-c-d78a6f96).
   > The key is therefore taken from `X-Real-IP`, then `X-Envoy-External-Address`, then
   > the rightmost `X-Forwarded-For` entry, then the socket — and the **global** 30/minute
   > cap holds whichever reading is right, including when the key is attacker-chosen.
   > See `server/utils/auth.ts` (`resolveRateLimitKey`).

   > Both limiters are **in-memory, scoped to a single instance**. If this service is ever
   > scaled past one replica, each replica keeps its own counters and the effective attempt
   > budget multiplies — re-evaluate the 8-character floor before doing so.

   Before deploying, confirm in Railway service variables that all four are set — the two
   passwords clearing 8 and 32 respectively and neither still an `.env.example`
   placeholder, plus `NUXT_API_KEY` and `NUXT_API_BASE_URL`, which the server now also
   refuses to boot without.

4. **Generate domain** → Settings → Networking → Generate Domain.

5. **Health check** path: `/api/health` (returns `200` with `{"status":"ok"}`, no auth
   required, on **any** HTTP method). It must not be `/` — that route is behind
   `middleware/auth.ts` and answers **302** to an unauthenticated request, which Railway
   counts as a failed healthcheck. The route answers on any method on purpose: Railway's
   [healthcheck docs](https://docs.railway.com/guides/healthchecks) say only that it polls
   until it gets "any 2xx" and never state which method the probe sends, and a handler
   that returns a constant has no surface a method could widen.

### GitHub Actions deploy

The workflow at `.github/workflows/ci.yml` runs CI on pull requests and pushes to `main`.
On `main` pushes, the `deploy` job runs `railway up --ci` to the Railway `production`
environment after type-check, tests, and build pass.

Add this GitHub repository secret:

```
RAILWAY_TOKEN=<Railway project token>
```

Add these GitHub repository variables:

```
RAILWAY_PROJECT_ID=<Railway project id>
RAILWAY_SERVICE_ID=<Railway frontend service id>
```

Keep application runtime variables in Railway service variables, not GitHub secrets:

```
NUXT_AUTH_PASSWORD=<random-secret-min-8-chars>
NUXT_SESSION_PASSWORD=<strong-session-secret-min-32-chars>
NUXT_API_BASE_URL=https://artbiter-production.up.railway.app
NUXT_API_KEY=<your-api-key>
PORT=8080
```

Use either this GitHub Actions deploy job or Railway GitHub auto-deploys. Do not enable both for the same branch/service, or each push may create duplicate deployments.

### railway.toml (place in repo root)

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "node .output/server/index.mjs"
healthcheckPath = "/api/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

### Dockerfile build

```dockerfile
FROM node:20.19.5-slim AS build
WORKDIR /app
RUN npm install -g pnpm@9.15.9
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
```

Pin Node with `package.json` and `.node-version`:

```
// package.json
"engines": {
  "node": "20.19.x"
}

// .node-version
20.19.5
```

---

## Codex Task Checklist

Items for Codex to implement in order:

- [ ] **types/api.ts** — export all TypeScript interfaces from `docs/for-claude-design.md` section D
- [ ] **composables/useApi.ts** — `$fetch` factory with base URL + API key header
- [ ] **server/api/auth/login.post.ts** — validate `AUTH_PASSWORD`, set session via `nuxt-auth-utils`
- [ ] **middleware/auth.ts** — redirect unauthenticated users to `/login`
- [ ] **pages/analyze.vue** — `LogInputForm` → POST `/analyze` → `DecisionResultCard`
- [ ] **pages/decisions.vue** — `DecisionsTable` + `DecisionFilters` + `StatsCards`
- [ ] **pages/settings.vue** — three-tab layout: Rules / Provider / Prompts
- [ ] **pages/cases.vue** — CRUD table + seed button
- [ ] **pages/evaluate.vue** — `EvaluateRunner` + `EvalResultTable`
- [ ] **rsbuild.config.ts** — optional future optimization: add `builder: 'rsbuild'` to `nuxt.config.ts`, add optional config file
- [ ] **railway.toml** + **Dockerfile** — deploy config files
- [ ] **tests/** — Vitest unit tests for composables (target ≥ 80% coverage)

Component specs and visual direction in `docs/for-claude-design.md` sections E–G.

---

## Code Standards

- `<script setup lang="ts">` only — no Options API
- No `any` — use `// @ts-expect-error` + comment if unavoidable
- No `console.log` — use a logger utility
- No `v-html` with unsanitized input
- Tailwind utility classes only — no inline styles, no magic numbers
- Mobile-first responsive breakpoints
- Conventional Commits: `feat:` `fix:` `chore:` `test:` `docs:`
