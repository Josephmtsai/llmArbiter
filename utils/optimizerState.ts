import type { ArbiterAction, EvalPoolStats, OptimizerRun } from '~/types/api'

export const ARBITER_ACTIONS: readonly ArbiterAction[] = [
  'trigger_rebuild',
  'trigger_fallback',
  'trigger_restart',
  'notify_human',
  'send_email',
] as const

const ACTIVE_OPTIMIZER_STATUSES = new Set(['running', 'evaluating'])

export function isOptimizerRunActive(run: Pick<OptimizerRun, 'status' | 'finished_at'>): boolean {
  if (run.finished_at != null) return false
  return ACTIVE_OPTIMIZER_STATUSES.has(run.status)
}

export function shouldPollOptimizerHistory(
  runs: Array<Pick<OptimizerRun, 'status' | 'finished_at'> & { optimizer_run_id: number }>,
): boolean {
  return runs.some(run => isOptimizerRunActive(run))
}

export function isEvalPoolEmpty(stats: EvalPoolStats | null | undefined): boolean {
  return !stats || stats.total === 0
}

export function getLowestActionCoverage(stats: EvalPoolStats): { action: ArbiterAction; count: number } {
  return ARBITER_ACTIONS.map(action => ({
    action,
    count: stats.by_action[action] ?? 0,
  })).sort((a, b) => a.count - b.count)[0]
}

export function optimizerRoundCount(run: Pick<OptimizerRun, 'rounds' | 'round_count'>): number {
  return run.round_count ?? run.rounds?.length ?? 0
}

export function bestOptimizerAccuracy(run: Pick<OptimizerRun, 'rounds' | 'best_accuracy'>): number | null {
  if (run.best_accuracy != null) return run.best_accuracy
  if (!run.rounds || run.rounds.length === 0) return null
  return Math.max(...run.rounds.map(round => round.accuracy))
}
