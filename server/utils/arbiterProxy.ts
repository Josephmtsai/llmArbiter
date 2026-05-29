type ProxyErrorInput = {
  status?: number
  statusCode?: number
  statusMessage?: string
  message?: string
  data?: unknown
  response?: { status?: number }
}

type ValidationResult = { valid: true } | { valid: false; detail: string }
export function buildArbiterUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

export function normalizeProxyError(error: unknown): {
  statusCode: number
  data: unknown
  statusMessage: string
} {
  const err = error as ProxyErrorInput
  const data = err?.data ?? { detail: err?.message ?? 'arbiter-proxy-error' }
  const detail =
    data && typeof data === 'object' && 'detail' in data
      ? String((data as { detail: unknown }).detail)
      : err?.statusMessage ?? err?.message ?? 'arbiter-proxy-error'

  return {
    statusCode: err?.statusCode ?? err?.status ?? err?.response?.status ?? 500,
    data,
    statusMessage: detail,
  }
}

export function validateReviewQueueMutation(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, detail: 'review-action-required' }
  }

  const action = (body as { action?: unknown }).action
  if (action !== 'confirm' && action !== 'correct' && action !== 'reject') {
    return { valid: false, detail: 'review-action-invalid' }
  }

  if (action === 'correct') {
    const expectedAction = (body as { expected_action?: unknown }).expected_action
    if (typeof expectedAction !== 'string' || expectedAction.length === 0) {
      return { valid: false, detail: 'expected_action-required' }
    }
  }

  return { valid: true }
}

export function validateOptimizerRunId(id: string | undefined): ValidationResult {
  if (!id || !Number.isInteger(Number(id))) {
    return { valid: false, detail: 'optimizer-run-id-invalid' }
  }
  return { valid: true }
}

export async function forwardArbiterRequest<T>(
  event: Parameters<typeof useRuntimeConfig>[0],
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    body?: unknown
    query?: Record<string, unknown>
  } = {},
): Promise<T> {
  const config = useRuntimeConfig(event) as { apiBaseUrl?: string; apiKey?: string }
  const apiBaseUrl = config.apiBaseUrl
  const apiKey = config.apiKey

  if (!apiBaseUrl || !apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'arbiter-proxy-config-missing',
      data: { detail: 'arbiter-proxy-config-missing' },
    })
  }

  try {
    const request = $fetch as <R>(
      url: string,
      options: {
        method: string
        body?: unknown
        query?: Record<string, unknown>
        headers: Record<string, string>
      },
    ) => Promise<R>
    return await request<T>(buildArbiterUrl(apiBaseUrl, path), {
      method: options.method ?? 'GET',
      body: options.body,
      query: options.query,
      headers: {
        'X-API-Key': apiKey,
      },
    })
  } catch (error) {
    const normalized = normalizeProxyError(error)
    throw createError(normalized)
  }
}
