import { describe, expect, it } from 'vitest'

import {
  bestOptimizerAccuracy,
  getLowestActionCoverage,
  isEvalPoolEmpty,
  optimizerRoundCount,
  shouldPollOptimizerHistory,
} from '../utils/optimizerState'

describe('optimizer state helpers', () => {
  it('polls optimizer history when a run is running', () => {
    expect(shouldPollOptimizerHistory([{ optimizer_run_id: 7, status: 'running' }])).toBe(true)
  })

  it('stops polling when all runs are terminal', () => {
    expect(
      shouldPollOptimizerHistory([
        { optimizer_run_id: 1, status: 'completed' },
        { optimizer_run_id: 2, status: 'cancelled' },
      ]),
    ).toBe(false)
  })

  it('reads optimizer summary fields from lightweight history runs', () => {
    expect(bestOptimizerAccuracy({ best_accuracy: 0.735 })).toBe(0.735)
    expect(optimizerRoundCount({ round_count: 2 })).toBe(2)
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
