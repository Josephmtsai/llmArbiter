import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'
import { runProxy, type UpstreamResponse } from '../../utils/proxyHandler'

// Minimal hand-rolled proxy (spec proxy-hardening, Option C). h3's `proxyRequest`
// cannot be used: it always merges `getProxyRequestHeaders(event)` into the
// upstream request and `mergeHeaders` only sets keys, so browser `cookie` /
// `authorization` headers cannot be removed. Everything forwarded in either
// direction is an explicit allowlist.
//
// This file is the imperative shell only. The policy lives in
// `server/utils/proxyHandler.ts` so it can be unit-tested without a Nitro server.
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  const outcome = await runProxy(
    {
      method: event.method,
      wildcard: getRouterParam(event, '_') ?? '',
      query: getQuery(event),
      headers: getRequestHeaders(event),
    },
    {
      getSessionUser: async () => (await getUserSession(event)).user,
      readBody: () => readRawBody(event, false),
      fetchUpstream: (url, init) =>
        $fetch.raw<ReadableStream>(url, {
          ...init,
          responseType: 'stream',
          // ofetch retries retryable 5xx on idempotent methods by default, which
          // would multiply the effective deadline against an already-slow upstream.
          retry: 0,
          // Keep upstream 4xx/5xx as pass-through status codes instead of throws.
          ignoreResponseError: true,
          // Undici strips `authorization` / `cookie` on a cross-origin hop but
          // keeps custom headers, so a followed redirect would carry `X-API-Key`
          // to whatever origin the upstream named. `runProxy` turns 3xx into 502.
          redirect: 'manual',
        }) as Promise<UpstreamResponse>,
      config: {
        apiKey: config.apiKey as string,
        apiBaseUrl: config.apiBaseUrl as string,
      },
      // No logger utility exists in this codebase yet (it arrives with
      // silent-failure-elimination). stderr keeps the detail server-side, which
      // is the property that matters: none of it reaches the browser.
      logError: (line) => {
        process.stderr.write(line + '\n')
      },
    },
  )

  if (outcome.kind === 'error') {
    if (outcome.headers) setResponseHeaders(event, outcome.headers)
    // `cause` is deliberately never attached: Nitro serializes it to the browser in dev.
    throw createError({ statusCode: outcome.statusCode, message: outcome.message })
  }

  setResponseStatus(event, outcome.status)
  setResponseHeaders(event, outcome.headers)
  if (!outcome.body) return null

  // Not `sendStream`: its web-stream branch writes into a `WritableStream` that
  // ignores `res.write`'s backpressure signal and never cancels the upstream body
  // when the client disconnects. `pipeline` does both and ends the response, which
  // sets `writableEnded` so h3 treats the event as handled.
  // The DOM and node:stream/web ReadableStream types describe the same object here;
  // only the node one declares the async-iterator members `Readable.fromWeb` asks for.
  const webStream = outcome.body as NodeReadableStream<Uint8Array>
  await pipeline(Readable.fromWeb(webStream), event.node.res)
  return undefined
})
