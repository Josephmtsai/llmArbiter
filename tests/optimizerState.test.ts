import { describe, expect, it } from 'vitest'

import {
  getLowestActionCoverage,
  isEvalPoolEmpty,
  shouldPollOptimizerHistory,
} from '../utils/optimizerState'

describe('optimizer state helpers', () => {
  it('polls optimizer history when a run is running', () => {
    expect(shouldPollOptimizerHistory([{ optimizer_run_id: 7, status: 'running', rounds: [] }])).toBe(
      true,
    )
  })

  it('stops polling when all runs are terminal', () => {
    expect(
      shouldPollOptimizerHistory([
        { optimizer_run_id: 1, status: 'completed', rounds: [] },
        { optimizer_run_id: 2, status: 'cancelled', rounds: [] },
      ]),
    ).toBe(false)
  })

  it('detects empty eval pools', () => {
    expect(isEvalPoolEmpty({ total: 0, by_action: {} })).toBe(true)
  })

  it('finds the lowest action coverage across known actions', () => {
    expect(
      getLowestActionCoverage({
        total: 12,
        by_action: {
          trigger_rebuild: 12,
          trigger_fallback: 3,
          trigger_restart: 8,
        },
      }),
    ).toEqual({ action: 'notify_human', count: 0 })
  })
})
