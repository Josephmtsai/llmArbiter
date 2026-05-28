## 1. API Composable

- [x] 1.1 Add `deleteEvalRun(runId: number)` method to `useApi()` in `composables/useApi.ts` — calls `DELETE /evaluate/history/{runId}`; treats 404 as success

## 2. History List Page

- [x] 2.1 Add "Actions" column header to the history table in `pages/evaluate/history/index.vue`
- [x] 2.2 Add delete button to each row; on click call `window.confirm` then `deleteEvalRun(run.run_id)`
- [x] 2.3 On successful delete, splice the run out of `runs.value` (optimistic removal)
- [x] 2.4 On error, display inline error message near the row's delete button
- [x] 2.5 Verify empty state is shown when the last run is deleted

## 3. Run Detail Page

- [x] 3.1 Add `deleteError` ref and `deleting` loading state to `pages/evaluate/history/[run_id].vue`
- [x] 3.2 Add "Delete run" button in the page header area; disable while `loading` or `deleting`
- [x] 3.3 On click call `window.confirm` then `deleteEvalRun(runId)`; on success `navigateTo('/evaluate/history')`
- [x] 3.4 On error display inline error message near the delete button

## 4. Styling

- [x] 4.1 Style the delete button as `variant="ghost"` with a red/danger colour (`var(--action-notify)`) using existing `UiButton` component
- [x] 4.2 Ensure delete button in history list does not trigger row click navigation (use `@click.stop`)
