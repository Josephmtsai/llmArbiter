import { describe, expect, it } from 'vitest'

import {
  bestOptimizerAccuracy,
  getLowestActionCoverage,
  isOptimizerRunActive,
  isEvalPoolEmpty,
  optimizerRoundCount,
  shouldPollOptimizerHistory,
} from '../utils/optimizerState'

describe('optimizer state helpers', () => {
  it('polls optimizer history when a run is running', () => {
    expect(
      shouldPollOptimizerHistory([{ optimizer_run_id: 7, status: 'running', finished_at: null }]),
    ).toBe(true)
  })

  it('polls optimizer history when final test evaluation is running', () => {
    expect(
      shouldPollOptimizerHistory([
        { optimizer_run_id: 8, status: 'evaluating', finished_at: null },
      ]),
    ).toBe(true)
  })

  it('does not poll when a run has finished even if status is active-like', () => {
    expect(
      shouldPollOptimizerHistory([
        { optimizer_run_id: 8, status: 'evaluating', finished_at: '2026-06-04T15:11:48.523503Z' },
      ]),
    ).toBe(false)
  })

  it('stops polling when all runs are terminal', () => {
    expect(
      shouldPollOptimizerHistory([
        { optimizer_run_id: 1, status: 'completed', finished_at: '2026-06-04T15:11:48.523503Z' },
        { optimizer_run_id: 2, status: 'cancelled', finished_at: null },
        { optimizer_run_id: 3, status: 'failed', finished_at: null },
        { optimizer_run_id: 4, status: 'aborted', finished_at: null },
      ]),
    ).toBe(false)
  })

  it('treats only running and evaluating unfinished runs as active', () => {
    expect(isOptimizerRunActive({ status: 'running', finished_at: null })).toBe(true)
    expect(isOptimizerRunActive({ status: 'evaluating', finished_at: null })).toBe(true)
    expect(isOptimizerRunActive({ status: 'completed_max_rounds', finished_at: null })).toBe(false)
    expect(isOptimizerRunActive({ status: 'cancelling', finished_at: null })).toBe(false)
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
