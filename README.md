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
| `NUXT_AUTH_PASSWORD` | server-only | Password for the login page (min 32 chars for `nuxt-auth-utils`) |
| `NUXT_SESSION_PASSWORD` | server-only | Session encryption key (min 32 chars for `nuxt-auth-utils`) |
| `NUXT_PUBLIC_API_BASE` | public | Backend base URL (default `https://artbiter-production.up.railway.app`) |
| `NUXT_PUBLIC_API_KEY` | public | `X-API-Key` header value sent with every API call |
| `PORT` | server-only | Port for the Nuxt/Nitro server on Railway (`8080` for this deployment) |

> **Rule**: `runtimeConfig.public.*` is exposed to the browser. Never put secrets there.
> Server-only secrets go under `runtimeConfig.*` (no `public` prefix).

`.env.example`:
```
NUXT_AUTH_PASSWORD=change-me-at-least-32-characters-long
NUXT_SESSION_PASSWORD=change-me-at-least-32-characters-long
NUXT_PUBLIC_API_BASE=https://artbiter-production.up.railway.app
NUXT_PUBLIC_API_KEY=your-api-key-here
PORT=8080
```

---

## API Integration

**Base URL**: `NUXT_PUBLIC_API_BASE`
**Auth header**: `X-API-Key: {NUXT_PUBLIC_API_KEY}` on every request.

All API calls must go through Nuxt's `$fetch` / `useFetch` — never raw `fetch` or axios.

### Composable pattern

```ts
// composables/useApi.ts
export function useApi() {
  const config = useRuntimeConfig()

  return $fetch.create({
    baseURL: config.public.apiBase,
    headers: { 'X-API-Key': config.public.apiKey },
  })
}
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
   NUXT_AUTH_PASSWORD=<strong-secret-min-32-chars>
   NUXT_SESSION_PASSWORD=<strong-session-secret-min-32-chars>
   NUXT_PUBLIC_API_BASE=https://artbiter-production.up.railway.app
   NUXT_PUBLIC_API_KEY=<your-api-key>
   PORT=8080
   ```

   `NUXT_AUTH_PASSWORD` and `NUXT_SESSION_PASSWORD` must both be at least 32 characters.

4. **Generate domain** → Settings → Networking → Generate Domain.

5. **Health check** path: `/` (Nuxt returns 200 on root).

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
NUXT_AUTH_PASSWORD=<strong-secret-min-32-chars>
NUXT_SESSION_PASSWORD=<strong-session-secret-min-32-chars>
NUXT_PUBLIC_API_BASE=https://artbiter-production.up.railway.app
NUXT_PUBLIC_API_KEY=<your-api-key>
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
healthcheckPath = "/"
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
