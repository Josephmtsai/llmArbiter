## Why

Users need to manage their evaluation history by removing unwanted or erroneous runs. Without a delete capability, the history list grows indefinitely and there is no way to clean up test runs triggered by mistake.

## What Changes

- Add `deleteEvalRun(runId: number)` method to `useApi()` composable — calls `DELETE /evaluate/history/{run_id}`
- Add delete button to each row in `/evaluate/history` (history list page)
- Add delete button to the run detail page (`/evaluate/history/[run_id].vue`)
- Show confirmation before deletion; on success navigate back to history list (from detail page) or remove row inline (from list page)
- Handle 404 gracefully (run already deleted)

## Capabilities

### New Capabilities

- `eval-run-delete`: Delete a single evaluation run by ID via `DELETE /evaluate/history/{run_id}`; frontend surfaces a confirm-then-delete flow in both the history list and the run detail view

### Modified Capabilities

- `eval-history-list`: History table rows gain a delete action column
- `eval-run-detail`: Run detail page gains a delete button in its header area

## Impact

- `composables/useApi.ts` — new method
- `pages/evaluate/history/index.vue` — delete button per row, optimistic row removal
- `pages/evaluate/history/[run_id].vue` — delete button, navigate away on success
- Backend: `DELETE /evaluate/history/{run_id}` must exist (new endpoint)
