import { describe, expect, it } from 'vitest'

import {
  averageLatencyMs,
  collectOptimizerEvalRunIds,
  countFailedResults,
  getEvalRunSource,
  getRunAccuracyDisplay,
} from '../utils/evalDisplay'
import type { EvalRun, EvalRunResult, OptimizerRun } from '../types/api'

function makeOptimizerRun(overrides: Partial<OptimizerRun>): OptimizerRun {
  return {
    optimizer_run_id: 1,
    status: 'completed',
    max_rounds: 3,
    target_accuracy: 0.8,
    started_at: '2026-06-01T00:00:00.000Z',
    finished_at: '2026-06-01T00:10:00.000Z',
    baseline_eval_run_id: null,
    rounds: [],
    ...overrides,
  }
}

function makeEvalRun(overrides: Partial<EvalRun>): EvalRun {
  return {
    run_id: 1,
    prompt_version_id: 1,
    provider: 'codex',
    model: 'gpt-4o-mini',
    started_at: '2026-06-01T00:00:00.000Z',
    finished_at: '2026-06-01T00:10:00.000Z',
    total: 10,
    correct: 8,
    timeout_count: 0,
    accuracy: 0.8,
    status: 'completed',
    ...overrides,
  }
}

function makeResult(overrides: Partial<EvalRunResult>): EvalRunResult {
  return {
    test_case_id: 1,
    expected_action: 'trigger_rebuild',
    predicted_action: 'trigger_rebuild',
    is_correct: true,
    latency_ms: 100,
    ...overrides,
  }
}

describe('eval display helpers', () => {
  it('collects optimizer eval IDs from baseline and rounds while ignoring nulls', () => {
    const ids = collectOptimizerEvalRunIds([
      makeOptimizerRun({
        baseline_eval_run_id: 24,
        rounds: [
          {
            round_number: 1,
            accuracy: 0.65,
            prompt_version_id: 5,
            failed_case_count: 35,
            kept: true,
            eval_run_id: 25,
          },
          {
            round_number: 2,
            accuracy: 0.63,
            prompt_version_id: 6,
            failed_case_count: 37,
            kept: false,
            eval_run_id: null,
          },
        ],
      }),
      makeOptimizerRun({ optimizer_run_id: 2, baseline_eval_run_id: null }),
    ])

    expect([...ids].sort((a, b) => a - b)).toEqual([24, 25])
  })

  it('tags eval runs as optimizer when their run ID is in the optimizer set', () => {
    expect(getEvalRunSource(makeEvalRun({ run_id: 25 }), new Set([24, 25]))).toBe('optimizer')
    expect(getEvalRunSource(makeEvalRun({ run_id: 26 }), new Set([24, 25]))).toBe('manual')
  })

  it('formats completed accuracy and hides failed or running accuracy', () => {
    expect(getRunAccuracyDisplay(makeEvalRun({ accuracy: 0.9032, status: 'completed' }))).toEqual({
      label: '90.3%',
      color: 'var(--action-rebuild)',
    })
    expect(getRunAccuracyDisplay(makeEvalRun({ accuracy: 0.65, status: 'completed' }))).toEqual({
      label: '65.0%',
      color: 'var(--action-fallback)',
    })
    expect(getRunAccuracyDisplay(makeEvalRun({ accuracy: 0.42, status: 'completed' }))).toEqual({
      label: '42.0%',
      color: 'var(--action-notify)',
    })
    expect(getRunAccuracyDisplay(makeEvalRun({ accuracy: 0, status: 'failed' }))).toEqual({
      label: '--',
      color: 'var(--fg-4)',
    })
    expect(getRunAccuracyDisplay(makeEvalRun({ accuracy: 0, status: 'running' }))).toEqual({
      label: '--',
      color: 'var(--fg-4)',
    })
    expect(getRunAccuracyDisplay(makeEvalRun({ accuracy: 0, status: 'pending' }))).toEqual({
      label: '--',
      color: 'var(--fg-4)',
    })
    expect(getRunAccuracyDisplay(makeEvalRun({ accuracy: 0, status: 'aborted' }))).toEqual({
      label: '--',
      color: 'var(--fg-4)',
    })
  })

  it('derives failed result count and average latency', () => {
    const results = [
      makeResult({ is_correct: true, latency_ms: 100 }),
      makeResult({ test_case_id: 2, is_correct: false, latency_ms: 200 }),
      makeResult({ test_case_id: 3, is_correct: false, latency_ms: null }),
    ]

    expect(countFailedResults(results)).toBe(2)
    expect(averageLatencyMs(results)).toBe(150)
  })
})
