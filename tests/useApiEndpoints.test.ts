import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

// Locks the proxy contract: every useApi method against the path and verb it
// sends to /api/arbiter. The server-side path allow-list is derived from this
// list, so a silent rename here would break the proxy rather than a page.
type Options = Record<string, unknown> | undefined

let inner: ReturnType<typeof vi.fn>

function lastCall(): [string, Options] {
  return inner.mock.calls.at(-1) as [string, Options]
}

function verb(): string {
  const [, options] = lastCall()
  return typeof options?.method === 'string' ? options.method : 'GET'
}

beforeEach(() => {
  inner = vi.fn().mockResolvedValue({ status: 'success', data: {}, message: '' })
  const fetchStub = Object.assign(vi.fn(), { create: () => inner })
  vi.stubGlobal('$fetch', fetchStub)
  vi.stubGlobal('navigateTo', vi.fn())
  vi.stubGlobal('useRoute', () => ({ path: '/decisions', fullPath: '/decisions' }))
  vi.stubGlobal('useAuthStore', () => ({ reset: vi.fn() }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function buildApi() {
  const { useApi } = await import('../composables/useApi')
  return useApi()
}

describe('useApi endpoint map', () => {
  it('sends analyze to POST /analyze', async () => {
    const api = await buildApi()
    await api.analyze({ log_snippet: 'boom' })
    expect(lastCall()[0]).toBe('/analyze')
    expect(verb()).toBe('POST')
  })

  it('drops null and undefined decision filters from the query', async () => {
    const api = await buildApi()
    await api.getDecisions({ limit: 10, action: null, provider: 'openai', since: undefined })
    expect(lastCall()[0]).toBe('/decisions')
    expect(lastCall()[1]?.query).toEqual({ limit: 10, provider: 'openai' })
  })

  it('omits the query entirely when no decision filters are given', async () => {
    const api = await buildApi()
    await api.getDecisions()
    expect(lastCall()[1]?.query).toBeUndefined()
  })

  it('sends decision stats with its window', async () => {
    const api = await buildApi()
    await api.getDecisionStats({ window_hours: 24 })
    expect(lastCall()[0]).toBe('/decisions/stats')
    expect(lastCall()[1]?.query).toEqual({ window_hours: 24 })
  })

  it('flattens the rules map into a list', async () => {
    const api = await buildApi()
    inner.mockResolvedValueOnce({
      status: 'success',
      message: '',
      data: {
        min_confidence: {
          rule_name: 'min_confidence',
          rule_value: { value: 0.8 },
          description: 'Minimum confidence',
          updated_at: '2026-01-01',
        },
      },
    })
    const res = await api.getRules()
    expect(lastCall()[0]).toBe('/config/rules')
    expect(res.data).toEqual([
      { name: 'min_confidence', value: 0.8, description: 'Minimum confidence' },
    ])
  })

  it('tolerates a rules response with no data', async () => {
    const api = await buildApi()
    inner.mockResolvedValueOnce({ status: 'success', message: '', data: undefined })
    const res = await api.getRules()
    expect(res.data).toEqual([])
  })

  it('percent-encodes a rule name on update', async () => {
    const api = await buildApi()
    await api.updateRule('a/b rule', true)
    expect(lastCall()[0]).toBe('/config/rules/a%2Fb%20rule')
    expect(verb()).toBe('PATCH')
    expect(lastCall()[1]?.body).toEqual({ value: true })
  })

  it('reads and writes the provider config', async () => {
    const api = await buildApi()
    await api.getProviders()
    expect(lastCall()[0]).toBe('/config/provider')
    expect(verb()).toBe('GET')

    await api.setProvider('anthropic')
    expect(lastCall()[0]).toBe('/config/provider')
    expect(verb()).toBe('PATCH')
    expect(lastCall()[1]?.body).toEqual({ provider: 'anthropic' })
  })

  it('normalises the active flag and created date on every prompt read', async () => {
    const api = await buildApi()
    inner.mockResolvedValueOnce({
      status: 'success',
      message: '',
      data: { prompts: [{ id: 1, label: 'v1', active: true, created_at: '2026-01-01' }] },
    })
    const res = await api.getPrompts()
    expect(lastCall()[0]).toBe('/config/prompts')
    expect(res.data[0]).toMatchObject({ is_active: true, active: true, created: '2026-01-01' })
  })

  it('returns an empty prompt list when the payload has none', async () => {
    const api = await buildApi()
    inner.mockResolvedValueOnce({ status: 'success', message: '', data: {} })
    const res = await api.getPrompts()
    expect(res.data).toEqual([])
  })

  it('normalises a newly created prompt', async () => {
    const api = await buildApi()
    inner.mockResolvedValueOnce({
      status: 'success',
      message: '',
      data: { id: 2, label: 'v2', is_active: false },
    })
    const res = await api.createPrompt('v2', 'body text')
    expect(lastCall()[0]).toBe('/config/prompts')
    expect(verb()).toBe('POST')
    expect(lastCall()[1]?.body).toEqual({ label: 'v2', content: 'body text' })
    expect(res.data).toMatchObject({ is_active: false, active: false, created: '' })
  })

  it('activates a prompt by id', async () => {
    const api = await buildApi()
    inner.mockResolvedValueOnce({ status: 'success', message: '', data: { id: 3, active: true } })
    await api.activatePrompt(3)
    expect(lastCall()[0]).toBe('/config/prompts/3/activate')
    expect(verb()).toBe('PATCH')
  })

  it('covers the case endpoints', async () => {
    const api = await buildApi()

    await api.getCases({ limit: 5, offset: 10 })
    expect(lastCall()[0]).toBe('/cases')
    expect(lastCall()[1]?.query).toEqual({ limit: 5, offset: 10 })

    await api.getCase(7)
    expect(lastCall()[0]).toBe('/cases/7')

    await api.createCase({ description: 'd', log_snippet: 'l', expected_action: 'notify_human' })
    expect(lastCall()[0]).toBe('/cases')
    expect(verb()).toBe('POST')

    await api.deleteCase(7)
    expect(lastCall()[0]).toBe('/cases/7')
    expect(verb()).toBe('DELETE')

    await api.seedCases()
    expect(lastCall()[0]).toBe('/cases/seed')
    expect(verb()).toBe('POST')
  })

  it('defaults an evaluation run to the active prompt and omits an unset model', async () => {
    const api = await buildApi()
    await api.startEvaluation()
    expect(lastCall()[0]).toBe('/evaluate')
    expect(lastCall()[1]?.body).toEqual({ prompt_version_id: 'active' })

    await api.startEvaluation(4, 'gpt-4o')
    expect(lastCall()[1]?.body).toEqual({ prompt_version_id: 4, model: 'gpt-4o' })
  })

  it('marks a pool evaluation with its source', async () => {
    const api = await buildApi()
    await api.startPoolEvaluation()
    expect(lastCall()[0]).toBe('/evaluate')
    expect(lastCall()[1]?.body).toEqual({ prompt_version_id: 'active', source: 'pool' })

    await api.startPoolEvaluation(9, 'claude')
    expect(lastCall()[1]?.body).toEqual({
      prompt_version_id: 9,
      source: 'pool',
      model: 'claude',
    })
  })

  it('lists running evaluation jobs', async () => {
    const api = await buildApi()
    await api.getEvalJobs()
    expect(lastCall()[0]).toBe('/evaluate/jobs')
  })

  it.each([
    [undefined, 'cancelled'],
    [409, 'already-ended'],
    [503, 'timeout'],
  ])('maps a %s cancel response to %s', async (status, expected) => {
    const api = await buildApi()
    if (status === undefined) inner.mockResolvedValueOnce(undefined)
    else inner.mockRejectedValueOnce({ status })

    await expect(api.cancelEvalJob(11)).resolves.toBe(expected)
    expect(lastCall()[0]).toBe('/evaluate/jobs/11')
    expect(verb()).toBe('DELETE')
  })

  it('rethrows an unexpected cancel failure', async () => {
    const api = await buildApi()
    inner.mockRejectedValueOnce({ status: 500 })
    await expect(api.cancelEvalJob(11)).rejects.toEqual({ status: 500 })
  })

  it('rethrows a cancel failure that carries no status at all', async () => {
    const api = await buildApi()
    inner.mockRejectedValueOnce(new Error('offline'))
    await expect(api.cancelEvalJob(11)).rejects.toThrow('offline')
  })

  it.each([
    ['a bare array', [{ id: 1 }], [{ id: 1 }]],
    ['an evaluations wrapper', { evaluations: [{ id: 2 }] }, [{ id: 2 }]],
    ['a results wrapper', { results: [{ id: 3 }] }, [{ id: 3 }]],
    ['an unrecognised shape', { total: 0 }, []],
  ])('unwraps eval results from %s', async (_label, data, expected) => {
    const api = await buildApi()
    inner.mockResolvedValueOnce({ status: 'success', message: '', data })
    const res = await api.getEvalResults({ prompt_version_id: 1 })
    expect(lastCall()[0]).toBe('/evaluate/results')
    expect(res.data).toEqual(expected)
  })

  it('covers the evaluation history endpoints', async () => {
    const api = await buildApi()

    await api.getEvalHistory()
    expect(lastCall()[0]).toBe('/evaluate/history')

    await api.getEvalRunDetail(12)
    expect(lastCall()[0]).toBe('/evaluate/history/12')

    await api.getEvalCompare('provider')
    expect(lastCall()[0]).toBe('/evaluate/history/compare')
    expect(lastCall()[1]?.query).toEqual({ by: 'provider' })

    await api.getEvalPoolStats()
    expect(lastCall()[0]).toBe('/eval-pool/stats')
  })

  it('treats a missing eval run as an already-deleted run', async () => {
    const api = await buildApi()
    inner.mockRejectedValueOnce({ status: 404 })
    await expect(api.deleteEvalRun(13)).resolves.toEqual({
      status: 'success',
      data: null,
      message: '',
    })
    expect(lastCall()[0]).toBe('/evaluate/history/13')
    expect(verb()).toBe('DELETE')
  })

  it('rethrows any other eval-run delete failure', async () => {
    const api = await buildApi()
    inner.mockRejectedValueOnce({ status: 500 })
    await expect(api.deleteEvalRun(13)).rejects.toEqual({ status: 500 })
  })

  it('deletes an eval run that exists', async () => {
    const api = await buildApi()
    await expect(api.deleteEvalRun(14)).resolves.toBeDefined()
    expect(lastCall()[0]).toBe('/evaluate/history/14')
  })

  it('covers the review queue endpoints', async () => {
    const api = await buildApi()

    await api.getReviewQueue()
    expect(lastCall()[0]).toBe('/review-queue')

    await api.updateReviewQueueEntry('case/9', { action: 'confirm' })
    expect(lastCall()[0]).toBe('/review-queue/case%2F9')
    expect(verb()).toBe('PATCH')
    expect(lastCall()[1]?.body).toEqual({ action: 'confirm' })
  })

  it('covers the optimizer endpoints', async () => {
    const api = await buildApi()

    await api.getOptimizerHistory()
    expect(lastCall()[0]).toBe('/optimizer/history')

    await api.getOptimizerRunDetail(21)
    expect(lastCall()[0]).toBe('/optimizer/history/21')

    await api.startOptimizerRun({ max_rounds: 3, target_accuracy: 0.9 })
    expect(lastCall()[0]).toBe('/optimizer/run')
    expect(verb()).toBe('POST')
    expect(lastCall()[1]?.body).toEqual({ max_rounds: 3, target_accuracy: 0.9 })

    await api.cancelOptimizerRun(21)
    expect(lastCall()[0]).toBe('/optimizer/runs/21')
    expect(verb()).toBe('DELETE')
  })

  it('exposes the health endpoint', async () => {
    const api = await buildApi()
    await api.healthCheck()
    expect(lastCall()[0]).toBe('/health')
  })
})
