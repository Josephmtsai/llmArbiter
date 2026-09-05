/**
 * Railway's healthcheck target (`railway.toml`).
 *
 * It cannot be `/`: that route carries `definePageMeta({ middleware: 'auth' })`,
 * and `middleware/auth.ts` redirects an unauthenticated SSR request to /login,
 * which answers 302 -- Railway only accepts 2xx, so every deploy failed.
 *
 * This is a Nitro server route, so the app-side route middleware never runs for
 * it, and it is outside `/api/arbiter/**` so the proxy catch-all never sees it.
 *
 * The body is a fixed constant on purpose. This endpoint is unauthenticated, so
 * anything it reports -- env, version, uptime, upstream reachability -- is free
 * reconnaissance. It answers exactly one question: is this process alive.
 * Liveness, not readiness: binding upstream reachability in here would let one
 * upstream blip restart the whole service.
 */
export default defineEventHandler(() => ({ status: 'ok' }))
