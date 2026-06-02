import type { EvalRun, EvalRunResult, OptimizerRun } from '~/types/api'

export type EvalRunSource = 'manual' | 'optimizer'

const MEANINGFUL_ACCURACY_STATUSES = new Set(['completed', 'completed_max_rounds'])

export function collectOptimizerEvalRunIds(runs: Pick<OptimizerRun, 'baseline_eval_run_id' | 'rounds'>[]): Set<number> {
  const ids = new Set<number>()
  for (const run of runs) {
    if (run.baseline_eval_run_id != null) ids.add(run.baseline_eval_run_id)
    for (const round of run.rounds) {
      if (round.eval_run_id != null) ids.add(round.eval_run_id)
    }
  }
  return ids
}

export function getEvalRunSource(run: Pick<EvalRun, 'run_id'>, optimizerEvalRunIds: ReadonlySet<number>): EvalRunSource {
  return optimizerEvalRunIds.has(run.run_id) ? 'optimizer' : 'manual'
}

export function hasMeaningfulAccuracy(run: Pick<EvalRun, 'status'>): boolean {
  return !run.status || MEANINGFUL_ACCURACY_STATUSES.has(run.status)
}

export function getAccuracyColor(value: number): string {
  if (value >= 0.8) return 'var(--action-rebuild)'
  if (value >= 0.6) return 'var(--action-fallback)'
  return 'var(--action-notify)'
}

export function getRunAccuracyDisplay(run: Pick<EvalRun, 'accuracy' | 'status'>): { label: string; color: string } {
  if (!hasMeaningfulAccuracy(run)) return { label: '--', color: 'var(--fg-4)' }
  return {
    label: `${(run.accuracy * 100).toFixed(1)}%`,
    color: getAccuracyColor(run.accuracy),
  }
}

export function countFailedResults(results: Pick<EvalRunResult, 'is_correct'>[]): number {
  return results.filter(result => !result.is_correct).length
}

export function averageLatencyMs(results: Pick<EvalRunResult, 'latency_ms'>[]): number | null {
  const latencies = results
    .map(result => result.latency_ms)
    .filter((latency): latency is number => latency != null)
  if (latencies.length === 0) return null
  return Math.round(latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length)
}
