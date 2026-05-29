import { describe, expect, it } from 'vitest'

import {
  buildArbiterUrl,
  normalizeProxyError,
  validateOptimizerRunId,
  validateReviewQueueMutation,
} from '../server/utils/arbiterProxy'

describe('arbiter proxy utilities', () => {
  it('builds backend URLs without leaking double slashes', () => {
    expect(buildArbiterUrl('https://arbiter.example.com/', '/optimizer/history')).toBe(
      'https://arbiter.example.com/optimizer/history',
    )
  })

  it('rejects review corrections without an expected action', () => {
    expect(validateReviewQueueMutation({ action: 'correct' })).toEqual({
      valid: false,
      detail: 'expected_action-required',
    })
  })

  it('accepts review confirmations without an expected action', () => {
    expect(validateReviewQueueMutation({ action: 'confirm' })).toEqual({ valid: true })
  })

  it('rejects non-numeric optimizer run ids', () => {
    expect(validateOptimizerRunId('abc')).toEqual({
      valid: false,
      detail: 'optimizer-run-id-invalid',
    })
  })

  it('preserves backend status and detail errors', () => {
    const normalized = normalizeProxyError({
      status: 409,
      data: { detail: 'optimizer-already-running' },
    })

    expect(normalized).toEqual({
      statusCode: 409,
      data: { detail: 'optimizer-already-running' },
      statusMessage: 'optimizer-already-running',
    })
  })
})
