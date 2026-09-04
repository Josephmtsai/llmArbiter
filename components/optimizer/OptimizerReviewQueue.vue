<script setup lang="ts">
import { Check, X } from 'lucide-vue-next'
import type { ArbiterAction, ReviewQueueEntry, ReviewQueueMutationRequest } from '~/types/api'
import { ARBITER_ACTIONS } from '~/utils/optimizerState'

const search = defineModel<string>('search', { required: true })
const actionFilter = defineModel<'all' | ArbiterAction>('actionFilter', { required: true })
const correctionAction = defineModel<ArbiterAction>('correctionAction', { required: true })

defineProps<{
  items: ReviewQueueEntry[]
  loading: boolean
  error: string | null
  selectedReview: ReviewQueueEntry | null
  mutatingId: string | null
}>()

defineEmits<{
  selectReview: [item: ReviewQueueEntry]
  closeReview: []
  mutate: [item: ReviewQueueEntry, action: ReviewQueueMutationRequest['action']]
}>()

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function isKnownAction(action: string): action is ArbiterAction {
  return ARBITER_ACTIONS.includes(action as ArbiterAction)
}
</script>

<template>
  <section class="optimizer-review">
    <UiCard>
      <div class="optimizer-review__filters">
        <UiInput v-model="search" placeholder="Search descriptions, logs, datasets" />
        <UiSelect v-model="actionFilter">
          <option value="all">All actions</option>
          <option v-for="action in ARBITER_ACTIONS" :key="action" :value="action">
            {{ action }}
          </option>
        </UiSelect>
      </div>
      <div v-if="error" class="optimizer-review__error">{{ error }}</div>
      <div v-if="loading" class="optimizer-review__empty"><UiSpinner size="sm" /></div>
      <div v-else-if="items.length === 0" class="optimizer-review__empty">
        No pending review cases. Low-confidence relabeled cases will appear here.
      </div>
      <table v-else class="optimizer-review__table">
        <thead>
          <tr>
            <th>Confidence</th>
            <th>Expected</th>
            <th>Description</th>
            <th>Dataset</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td class="num">{{ formatPercent(item.confidence) }}</td>
            <td>
              <UiActionBadge
                v-if="isKnownAction(item.expected_action)"
                :action="item.expected_action"
                size="sm"
              />
              <span v-else class="optimizer-review__unknown-action">{{
                item.expected_action
              }}</span>
            </td>
            <td>
              <button
                class="optimizer-review__text-btn"
                type="button"
                @click="$emit('selectReview', item)"
              >
                {{ item.description }}
              </button>
              <p class="optimizer-review__snippet">{{ item.log_snippet }}</p>
            </td>
            <td>{{ item.source_dataset }}</td>
            <td>
              <div class="optimizer-review__row-actions">
                <UiButton
                  size="sm"
                  variant="secondary"
                  :loading="mutatingId === item.id"
                  @click="$emit('mutate', item, 'confirm')"
                >
                  <template #icon><Check :size="13" /></template>
                  Confirm
                </UiButton>
                <UiButton size="sm" variant="ghost" @click="$emit('selectReview', item)"
                  >Correct</UiButton
                >
                <UiButton
                  size="sm"
                  variant="danger"
                  :disabled="mutatingId === item.id"
                  @click="$emit('mutate', item, 'reject')"
                >
                  <template #icon><X :size="13" /></template>
                  Reject
                </UiButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </UiCard>

    <div v-if="selectedReview" class="optimizer-review__modal" role="dialog" aria-modal="true">
      <div class="optimizer-review__modal-panel">
        <div class="optimizer-review__panel-head">
          <div>
            <UiEyebrow>Review case</UiEyebrow>
            <h2 class="optimizer-review__title">{{ selectedReview.description }}</h2>
          </div>
          <button
            class="optimizer-review__icon-btn"
            type="button"
            aria-label="Close"
            @click="$emit('closeReview')"
          >
            <X :size="16" />
          </button>
        </div>
        <div class="optimizer-review__modal-grid">
          <div>
            <UiEyebrow>Log snippet</UiEyebrow>
            <pre class="optimizer-review__log">{{ selectedReview.log_snippet }}</pre>
          </div>
          <div>
            <UiEyebrow>Hardware info</UiEyebrow>
            <pre class="optimizer-review__log">{{
              JSON.stringify(selectedReview.hardware_info, null, 2)
            }}</pre>
          </div>
        </div>
        <div v-if="selectedReview.reasoning" class="optimizer-review__reasoning">
          <UiEyebrow>Reasoning</UiEyebrow>
          <p>{{ selectedReview.reasoning }}</p>
        </div>
        <div class="optimizer-review__modal-actions">
          <UiSelect v-model="correctionAction" class="optimizer-review__correction-select">
            <option v-for="action in ARBITER_ACTIONS" :key="action" :value="action">
              {{ action }}
            </option>
          </UiSelect>
          <UiButton
            variant="secondary"
            :loading="mutatingId === selectedReview.id"
            @click="$emit('mutate', selectedReview, 'confirm')"
            >Confirm</UiButton
          >
          <UiButton
            variant="primary"
            :loading="mutatingId === selectedReview.id"
            @click="$emit('mutate', selectedReview, 'correct')"
            >Correct</UiButton
          >
          <UiButton
            variant="danger"
            :disabled="mutatingId === selectedReview.id"
            @click="$emit('mutate', selectedReview, 'reject')"
            >Reject</UiButton
          >
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.optimizer-review {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.optimizer-review__filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.optimizer-review__error {
  margin-top: 10px;
  border: 1px solid rgba(248, 113, 113, 0.24);
  border-radius: var(--r-sm);
  padding: 10px 12px;
  background: var(--bg-tint-danger);
  color: var(--action-notify);
  font-size: 13px;
}
.optimizer-review__empty {
  display: flex;
  justify-content: center;
  border: 1px dashed var(--border-subtle);
  border-radius: var(--r-md);
  padding: 22px;
  color: var(--fg-4);
  font-size: 13px;
  text-align: center;
}
.optimizer-review__table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
}
.optimizer-review__table th,
.optimizer-review__table td {
  border-bottom: 1px solid var(--border-subtle);
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
}
.optimizer-review__table th {
  color: var(--fg-4);
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
}
.optimizer-review__table td {
  color: var(--fg-2);
  font-size: 13px;
}
.optimizer-review__unknown-action {
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 3px 7px;
  color: var(--fg-3);
  font-family: var(--font-mono);
  font-size: 11px;
}
.optimizer-review__text-btn,
.optimizer-review__icon-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
  font: inherit;
}
.optimizer-review__text-btn {
  color: var(--accent);
  text-align: left;
}
.optimizer-review__text-btn:hover {
  text-decoration: underline;
}
.optimizer-review__snippet {
  display: -webkit-box;
  margin: 5px 0 0;
  overflow: hidden;
  color: var(--fg-4);
  font-family: var(--font-mono);
  font-size: 11px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.optimizer-review__row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.optimizer-review__modal {
  position: fixed;
  z-index: 300;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgba(0, 0, 0, 0.65);
}
.optimizer-review__modal-panel {
  display: flex;
  width: min(940px, 100%);
  max-height: calc(100dvh - 40px);
  flex-direction: column;
  gap: 16px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: 18px;
  background: var(--bg-1);
  box-shadow: var(--shadow-lg);
}
.optimizer-review__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.optimizer-review__title {
  margin: 4px 0 0;
  color: var(--fg-0);
  font-size: 18px;
  font-weight: 600;
}
.optimizer-review__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--r-sm);
  color: var(--fg-3);
}
.optimizer-review__icon-btn:hover {
  background: var(--bg-2);
  color: var(--fg-1);
}
.optimizer-review__modal-grid {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr;
  gap: 14px;
}
.optimizer-review__log {
  max-height: 260px;
  margin: 8px 0 0;
  overflow: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-sm);
  padding: 12px;
  background: var(--bg-inset);
  color: var(--fg-2);
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: pre-wrap;
}
.optimizer-review__reasoning p {
  margin: 6px 0 0;
  color: var(--fg-2);
}
.optimizer-review__modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.optimizer-review__correction-select {
  max-width: 230px;
}
@media (max-width: 900px) {
  .optimizer-review__filters,
  .optimizer-review__modal-grid {
    grid-template-columns: 1fr;
  }
  .optimizer-review__modal-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
