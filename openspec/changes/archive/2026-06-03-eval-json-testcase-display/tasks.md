## 1. Guide and Branch Context

- [x] 1.1 Ensure implementation worktree includes `docs/frontend-eval-display-guide.md` from `main` commit `b9a8a17`.
- [x] 1.2 Read `docs/frontend-eval-display-guide.md` and `docs/frontend-optimizer-eval-link.md` before coding.
- [x] 1.3 Confirm existing `types/api.ts` contains `EvalRun.status`, `OptimizerRun.baseline_eval_run_id`, and `OptimizerRound.eval_run_id`.

## 2. Source Tagging Helpers

- [x] 2.1 Add strict TypeScript helper to collect optimizer eval run IDs from `baseline_eval_run_id` and `rounds[].eval_run_id`.
- [x] 2.2 Add strict TypeScript helper or local mapping to tag eval runs as `optimizer` or `manual`.
- [x] 2.3 Add focused tests for baseline IDs, round IDs, null IDs, and manual fallback behavior.

## 3. Eval History List

- [x] 3.1 Update `/evaluate/history` to load eval history and optimizer history in parallel or coordinated sequence.
- [x] 3.2 Add source and status columns or equivalent badges to the run list.
- [x] 3.3 Implement status-aware accuracy formatting: completed-like runs show percentage, failed/running/cancelled runs show `--`.
- [x] 3.4 Update accuracy thresholds to match the guide: green >= 80%, yellow 60-79%, red < 60%.
- [x] 3.5 Preserve compare link, row navigation, delete action, loading, error, and empty states.

## 4. Eval Run Detail

- [x] 4.1 Add run status to `/evaluate/history/[run_id]` summary.
- [x] 4.2 Avoid misleading `0%` accuracy display for failed or non-completed run statuses.
- [x] 4.3 Show failed-case count near the results controls.
- [x] 4.4 Derive and display average latency when result rows contain latency values.
- [x] 4.5 Keep the failures-only filter and per-question table behavior intact.
- [x] 4.6 Optionally derive and render a confusion matrix from expected/predicted actions if layout risk is low.

## 5. Optimizer History

- [x] 5.1 Update optimizer run detail to show baseline eval link when `baseline_eval_run_id` is available.
- [x] 5.2 Update each optimizer round row to show eval run detail link when `round.eval_run_id` is available.
- [x] 5.3 Handle null baseline and round eval IDs without broken links.
- [x] 5.4 Add direct-baseline-pass messaging for `status = "completed"` with empty `rounds`.
- [x] 5.5 Keep prompt version links, kept/reverted display, trend display, and run selection behavior intact.

## 6. Eval Pool Display

- [x] 6.1 Verify optimizer overview/pool UI displays aggregate eval pool total and per-action distribution.
- [x] 6.2 Ensure raw eval pool cases or raw `eval_pool.json` logs are not rendered as the primary frontend view.
- [x] 6.3 Preserve empty-pool and low-coverage warning behavior.

## 7. Verification

- [x] 7.1 Run `pnpm vue-tsc --noEmit`.
- [x] 7.2 Run targeted Vitest tests for source tagging, status-aware formatting, and optimizer eval links.
- [x] 7.3 Smoke test `/evaluate/history` with manual and optimizer-tagged runs.
- [x] 7.4 Smoke test `/evaluate/history/{run_id}` for completed and failed/running-style data.
- [x] 7.5 Smoke test `/optimizer` history detail for baseline link, round links, null IDs, and empty-round completed runs.
