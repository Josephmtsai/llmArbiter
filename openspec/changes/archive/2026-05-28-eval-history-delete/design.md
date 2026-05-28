## Context

The eval history feature exposes a list of past evaluation runs. Currently there is no way to remove a run once it has been recorded. The backend exposes `DELETE /evaluate/history/{run_id}` and the frontend needs to surface this action in both the history list and the run detail page.

The delete flow must be non-destructive in feel: the user must confirm before the request fires. On the list page, a successful delete removes the row without a full page reload (optimistic removal). On the detail page, the user is navigated back to `/evaluate/history` after deletion.

## Goals / Non-Goals

**Goals:**
- Wire `DELETE /evaluate/history/{run_id}` into `useApi()`
- Add confirm → delete flow to the history list page (inline row removal)
- Add confirm → delete flow to the run detail page (navigate away on success)
- Handle 404 (already deleted) gracefully — treat as success

**Non-Goals:**
- Bulk delete (out of scope; single-run delete only)
- Undo / soft-delete (backend decides retention; frontend does not implement recovery)
- Backend implementation (frontend-only change)

## Decisions

### Confirmation UX: `window.confirm` over a modal

Using `window.confirm` keeps the implementation minimal (no new modal component needed), fits the KISS/YAGNI principle, and is acceptable for a power-user admin tool. A dedicated `<ConfirmDialog>` component is not warranted for a single delete action with no complex messaging.

**Alternative**: Custom modal — rejected because it adds component surface area and state management for no UX gain in this context.

### List page: optimistic row removal

On successful delete from the history list, remove the run from `runs.value` immediately (filter by `run_id`) rather than refetching the full list. This avoids a network round-trip and feels snappier.

**Alternative**: Full refetch — rejected as slower and heavier than necessary.

### Error surface

Errors (network failure, unexpected 5xx) are shown inline near the delete button as a brief text message, auto-dismissed or replaced on next action. No toast library is introduced.

## Risks / Trade-offs

- `window.confirm` is browser-native and cannot be styled → acceptable for internal tooling
- Optimistic removal: if the DELETE request fails after the row is removed locally, the row disappears momentarily before re-appearing on error → mitigation: only remove after `await` resolves successfully; revert on error by keeping a local copy before splice

## Migration Plan

No migration needed. This is a purely additive frontend change. The backend endpoint must exist before the UI delete button becomes functional — if it returns 404/405 the error state is displayed inline.
