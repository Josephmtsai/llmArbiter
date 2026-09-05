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
 * ## Why this file is not `health.get.ts`
 *
 * A `.get.ts` suffix registers the route for GET only; every other method falls
 * through to the 404 renderer (measured, not assumed: HEAD /api/health answered
 * 404 on the built server). Railway's healthcheck documentation
 * (https://docs.railway.com/guides/healthchecks) says only that it polls the
 * path "until it receives any 2xx" -- it does not document which method it
 * uses, and HEAD is what a probe would conventionally send.
 *
 * Restricting the method was AC-3.6's "keep the method surface small", and that
 * is given up here on purpose: this handler returns a constant, touches no I/O,
 * reads no config and holds no state, so there is no surface for a method to
 * widen. Trading a theoretical restriction for "the probe cannot possibly miss"
 * is the right side of that bet while production is down.
 *
 * The body is a fixed constant on purpose. This endpoint is unauthenticated, so
 * anything it reports -- env, version, uptime, upstream reachability -- is free
 * reconnaissance. It answers exactly one question: is this process alive.
 * Liveness, not readiness: the configuration a request actually needs is
 * asserted at boot (`server/plugins/assert-config.ts`), which is where a
 * misconfigured deployment gets caught, and upstream reachability is not this
 * deployment's property to report.
 */
export default defineEventHandler(() => ({ status: 'ok' }))
