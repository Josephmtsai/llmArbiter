import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import OptimizerHistory from '../components/optimizer/OptimizerHistory.vue'
import type { OptimizerRun } from '../types/api'

vi.mock('@vueform/slider', () => ({
  default: {
    name: 'Slider',
    props: ['modelValue', 'min', 'max', 'step', 'tooltips', 'lazy'],
    emits: ['update:modelValue'],
    template: '<div class="slider-stub" />',
  },
}))

vi.mock('@vuepic/vue-datepicker', () => ({
  VueDatePicker: {
    name: 'VueDatePicker',
    props: ['modelValue', 'dark', 'enableTimePicker', 'autoApply', 'format', 'modelType', 'placeholder'],
    emits: ['update:modelValue'],
    template: '<input class="datepicker-stub" />',
  },
}))

const globalStubs = {
  UiCard: { template: '<div><slot /></div>' },
  UiEyebrow: { template: '<span><slot /></span>' },
  UiSpinner: { template: '<span />' },
  ClientOnly: { template: '<div><slot /></div>' },
  NuxtLink: {
    props: ['to'],
    template: '<a :href="to"><slot /></a>',
  },
}

const COMPARE_GUIDE_TEXT = '請回到 Runs 選取至少 2 個 run 進行比較（最多 4 個）'

function makeRun(overrides: Partial<OptimizerRun>): OptimizerRun {
  return {
    optimizer_run_id: 4,
    status: 'completed_max_rounds',
    max_rounds: 3,
    target_accuracy: 0.8,
    started_at: '2026-06-01T10:00:00.000Z',
    finished_at: '2026-06-01T10:15:00.000Z',
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
    ...overrides,
  }
}

function mountHistory(selectedRun: OptimizerRun) {
  return mount(OptimizerHistory, {
    props: {
      runs: [selectedRun],
      selectedRun,
      loading: false,
    },
    global: {
      stubs: globalStubs,
    },
  })
}

describe('OptimizerHistory', () => {
  it('renders baseline, test, and round eval links while handling null round IDs', () => {
    const wrapper = mountHistory(makeRun({ test_eval_run_id: 66 }))

    // baseline eval link in stats row
    expect(wrapper.html()).toContain('/evaluate/history/24')
    expect(wrapper.html()).toContain('/evaluate/history/66')
    expect(wrapper.text()).toContain('Test eval')
    // round 1 has eval_run_id=25 → link rendered
    expect(wrapper.html()).toContain('/evaluate/history/25')
    // kept/rejected badges reflect new labels
    expect(wrapper.text()).toContain('Kept')
    expect(wrapper.text()).toContain('Rejected')
  })

  it('renders no-rounds empty state for completed runs without rounds', () => {
    const wrapper = mountHistory(
      makeRun({
        status: 'completed',
        baseline_eval_run_id: 18,
        rounds: [],
      }),
    )

    // baseline link still shown in stats
    expect(wrapper.html()).toContain('/evaluate/history/18')
    // no-rounds empty state
    expect(wrapper.text()).toContain('No rounds yet.')
  })

  it('renders lightweight history list runs without round detail payloads', () => {
    const wrapper = mountHistory(
      makeRun({
        optimizer_run_id: 3,
        status: 'completed_max_rounds',
        round_count: 2,
        best_accuracy: 0.735,
        baseline_accuracy: 0.5,
        test_accuracy: 0.7175,
        test_eval_run_id: 66,
        current_eval_run_id: null,
        rounds: undefined,
      }),
    )

    expect(wrapper.text()).toContain('#3')
    expect(wrapper.text()).toContain('73.5%')
    expect(wrapper.html()).toContain('/evaluate/history/66')
    expect(wrapper.text()).toContain('Test eval')
    expect(wrapper.text()).toContain('2 rounds')
    expect(wrapper.text()).toContain('No rounds yet.')
  })

  it('labels current eval as final test eval while optimizer status is evaluating', () => {
    const wrapper = mountHistory(
      makeRun({
        status: 'evaluating',
        finished_at: null,
        current_eval_run_id: 66,
        round_count: 3,
        rounds: undefined,
      }),
    )

    expect(wrapper.text()).toContain('Test eval')
    expect(wrapper.text()).toContain('Final test eval is running')
    expect(wrapper.html()).toContain('/evaluate/history/66')
  })

  it('does not show a running final eval banner after the run has finished', () => {
    const wrapper = mountHistory(
      makeRun({
        status: 'evaluating',
        finished_at: '2026-06-04T15:11:48.523503Z',
        current_eval_run_id: 66,
        round_count: 3,
        rounds: undefined,
      }),
    )

    expect(wrapper.text()).toContain('Test eval')
    expect(wrapper.text()).not.toContain('Final test eval is running')
    expect(wrapper.html()).toContain('/evaluate/history/66')
  })

  it('renders failure samples with filters while omitting secret-like metadata', async () => {
    const wrapper = mountHistory(
      makeRun({
        rounds: [
          {
            round_number: 1,
            accuracy: 0.48,
            previous_best_accuracy: 0.53,
            accuracy_delta: -0.05,
            prompt_version_id: 44,
            failed_case_count: 2,
            kept: false,
            eval_run_id: 91,
            failure_analysis: 'The prompt confuses restartable service failures with human review.',
            analysis_text: 'Fallback analysis should not be displayed when failure_analysis exists.',
            failures: [
              {
                source_case_id: 'pool-abc',
                expected_action: 'trigger_restart',
                predicted_action: 'notify_human',
                confidence: 0.62,
                log_snippet: 'service daemon timeout after watchdog restart attempt',
                hardware_info: {
                  source_dataset: 'logchunks',
                  line_no: 123,
                  api_key: 'secret-value',
                  headers: {
                    authorization: 'Bearer nested-secret',
                    request_id: 'req-1',
                  },
                  env: {
                    api_key: 'nested-api-key',
                    rack: 'r42',
                  },
                },
                parsed_output: { primary_action: 'notify_human' },
                raw_output: 'raw evaluator trace',
              },
              {
                expected_action: 'trigger_fallback',
                predicted_action: 'trigger_rebuild',
                confidence: 0.51,
                log_snippet: 'fallback device unavailable',
              },
            ],
          },
        ],
      }),
    )

    await wrapper.find('.optimizer-history__round-head').trigger('click')

    expect(wrapper.text()).toContain('Failure samples')
    expect(wrapper.text()).toContain('restart')
    expect(wrapper.text()).toContain('notify/human')
    expect(wrapper.text()).toContain('62.0%')
    expect(wrapper.text()).toContain('source_dataset')
    expect(wrapper.text()).toContain('source_case_id')
    expect(wrapper.text()).toContain('pool-abc')
    expect(wrapper.text()).toContain('logchunks')
    expect(wrapper.text()).toContain('request_id')
    expect(wrapper.text()).toContain('req-1')
    expect(wrapper.text()).toContain('rack')
    expect(wrapper.text()).toContain('r42')
    expect(wrapper.text()).not.toContain('api_key')
    expect(wrapper.text()).not.toContain('secret-value')
    expect(wrapper.text()).not.toContain('authorization')
    expect(wrapper.text()).not.toContain('Bearer nested-secret')
    expect(wrapper.text()).not.toContain('nested-api-key')
    expect(wrapper.text()).toContain('The prompt confuses restartable service failures')
    expect(wrapper.text()).not.toContain('Fallback analysis should not be displayed')
    expect(wrapper.find('.optimizer-history__raw-output').attributes('open')).toBeUndefined()

    const expectedSelect = wrapper.findAll('select')[0]
    await expectedSelect.setValue('trigger_fallback')

    expect(wrapper.text()).toContain('fallback device unavailable')
    expect(wrapper.text()).not.toContain('service daemon timeout')
  })

  it('falls back to analysis_text and skips empty diagnostics tables when optional data is missing', async () => {
    const wrapper = mountHistory(
      makeRun({
        model_comparisons: [],
        rounds: [
          {
            round_number: 1,
            accuracy: 0.72,
            prompt_version_id: 11,
            failed_case_count: 0,
            kept: true,
            eval_run_id: null,
            analysis_text: 'Legacy analysis remains readable.',
          },
        ],
      }),
    )

    await wrapper.find('.optimizer-history__round-head').trigger('click')

    expect(wrapper.text()).toContain('Legacy analysis remains readable.')
    expect(wrapper.text()).not.toContain('Failure samples')
    expect(wrapper.text()).not.toContain('Model comparison')
  })

  it('renders model comparison diagnostics with would-keep decisions', () => {
    const wrapper = mountHistory(
      makeRun({
        model_comparisons: [
          {
            model_name: 'anthropic/claude-sonnet-4-6',
            baseline_accuracy: 0.53,
            candidate_accuracy: 0.61,
            accuracy_delta: 0.08,
            failure_count: 39,
            generated_prompt_version_id: 52,
            would_keep: true,
          },
          {
            model: 'deepseek/deepseek-chat',
            baseline_accuracy: 0.53,
            candidate_accuracy: 0.48,
            accuracy_delta: -0.05,
            failure_count: 44,
            generated_prompt_version_id: 53,
            would_keep: false,
          },
        ],
      }),
    )

    expect(wrapper.text()).toContain('Model comparison')
    expect(wrapper.text()).toContain('anthropic/claude-sonnet-4-6')
    expect(wrapper.text()).toContain('deepseek/deepseek-chat')
    expect(wrapper.text()).toContain('+8.0%')
    expect(wrapper.text()).toContain('-5.0%')
    expect(wrapper.text()).toContain('Would keep')
    expect(wrapper.text()).toContain('Reject')
  })

  it('shows rejection reason inline in the badge when reject_reason is present', () => {
    const wrapper = mountHistory(
      makeRun({
        rounds: [
          {
            round_number: 1,
            accuracy: 0.72,
            prompt_version_id: 10,
            failed_case_count: 5,
            kept: false,
            eval_run_id: 30,
            reject_reason: 'send_email regressed beyond tolerance',
          },
        ],
      }),
    )

    expect(wrapper.text()).toContain('Rejected: send_email regressed beyond tolerance')
  })

  it('shows plain Rejected badge when kept is false and reject_reason is absent', () => {
    const wrapper = mountHistory(
      makeRun({
        rounds: [
          {
            round_number: 1,
            accuracy: 0.68,
            prompt_version_id: 11,
            failed_case_count: 8,
            kept: false,
            eval_run_id: 31,
          },
        ],
      }),
    )

    expect(wrapper.text()).toContain('Rejected')
    expect(wrapper.text()).not.toContain('Rejected:')
  })

  it('renders per-action deltas table with action names and formatted percentages', async () => {
    const wrapper = mountHistory(
      makeRun({
        rounds: [
          {
            round_number: 1,
            accuracy: 0.75,
            prompt_version_id: 12,
            failed_case_count: 3,
            kept: false,
            eval_run_id: 32,
            reject_reason: 'send_email regressed beyond tolerance',
            per_action_deltas: {
              trigger_rebuild: {
                baseline_accuracy: 0.85,
                candidate_accuracy: 0.88,
                delta: 0.03,
                baseline_total: 20,
                candidate_total: 20,
                tolerance: 0.05,
              },
              send_email: {
                baseline_accuracy: 0.8,
                candidate_accuracy: 0.71,
                delta: -0.09,
                baseline_total: 25,
                candidate_total: 25,
                tolerance: 0.05,
              },
            },
          },
        ],
      }),
    )

    await wrapper.find('.optimizer-history__round-head').trigger('click')

    expect(wrapper.text()).toContain('Per-action deltas')
    expect(wrapper.text()).toContain('rebuild')
    expect(wrapper.text()).toContain('send/email')
    expect(wrapper.text()).toContain('85.0%')
    expect(wrapper.text()).toContain('88.0%')
    expect(wrapper.text()).toContain('80.0%')
    expect(wrapper.text()).toContain('71.0%')
  })

  it('highlights delta cells that exceed gate tolerance with regression class', async () => {
    const wrapper = mountHistory(
      makeRun({
        rounds: [
          {
            round_number: 1,
            accuracy: 0.75,
            prompt_version_id: 13,
            failed_case_count: 3,
            kept: false,
            eval_run_id: 33,
            per_action_deltas: {
              trigger_rebuild: {
                baseline_accuracy: 0.85,
                candidate_accuracy: 0.88,
                delta: 0.03,
                baseline_total: 20,
                candidate_total: 20,
                tolerance: 0.05,
              },
              send_email: {
                baseline_accuracy: 0.8,
                candidate_accuracy: 0.71,
                delta: -0.09,
                baseline_total: 25,
                candidate_total: 25,
                tolerance: 0.05,
              },
            },
          },
        ],
      }),
    )

    await wrapper.find('.optimizer-history__round-head').trigger('click')

    const regressionCells = wrapper.findAll('.optimizer-history__delta-cell--regression')
    expect(regressionCells).toHaveLength(1)
  })

  it('does not highlight delta cell when delta equals tolerance exactly', async () => {
    const wrapper = mountHistory(
      makeRun({
        rounds: [
          {
            round_number: 1,
            accuracy: 0.75,
            prompt_version_id: 15,
            failed_case_count: 2,
            kept: false,
            eval_run_id: 34,
            per_action_deltas: {
              send_email: {
                baseline_accuracy: 0.8,
                candidate_accuracy: 0.75,
                delta: -0.05,
                baseline_total: 20,
                candidate_total: 20,
                tolerance: 0.05,
              },
            },
          },
        ],
      }),
    )

    await wrapper.find('.optimizer-history__round-head').trigger('click')

    const regressionCells = wrapper.findAll('.optimizer-history__delta-cell--regression')
    expect(regressionCells).toHaveLength(0)
  })

  it('does not render per-action deltas table when per_action_deltas is null', async () => {
    const wrapper = mountHistory(
      makeRun({
        rounds: [
          {
            round_number: 1,
            accuracy: 0.72,
            prompt_version_id: 14,
            failed_case_count: 0,
            kept: true,
            eval_run_id: null,
            per_action_deltas: null,
          },
        ],
      }),
    )

    await wrapper.find('.optimizer-history__round-head').trigger('click')

    expect(wrapper.text()).not.toContain('Per-action deltas')
  })
})

// ── Filter & Compare tests ────────────────────────────────────────────────────

async function checkInput(
  wrapper: { element: Element; trigger: (event: string) => Promise<void> },
  checked = true,
): Promise<void> {
  ;(wrapper.element as HTMLInputElement).checked = checked
  await wrapper.trigger('change')
}

function makeMultiRun(overrides: Partial<OptimizerRun>, id: number): OptimizerRun {
  return {
    optimizer_run_id: id,
    status: 'completed',
    max_rounds: 3,
    target_accuracy: 0.8,
    started_at: '2026-06-01T10:00:00.000Z',
    finished_at: '2026-06-01T10:15:00.000Z',
    baseline_eval_run_id: null,
    rounds: [],
    ...overrides,
  }
}

function mountHistoryMulti(runs: OptimizerRun[], selectedRun: OptimizerRun | null = null) {
  return mount(OptimizerHistory, {
    props: { runs, selectedRun, loading: false },
    global: {
      stubs: globalStubs,
    },
  })
}

type HistoryWrapper = ReturnType<typeof mountHistoryMulti>

function subTabs(wrapper: HistoryWrapper) {
  return wrapper.findAll('.optimizer-history__subtab')
}

async function openCompareTab(wrapper: HistoryWrapper): Promise<void> {
  await subTabs(wrapper)[1].trigger('click')
}

async function openRunsTab(wrapper: HistoryWrapper): Promise<void> {
  await subTabs(wrapper)[0].trigger('click')
}

async function emitSliderUpdate(wrapper: HistoryWrapper, value: [number, number]): Promise<void> {
  wrapper.findComponent({ name: 'Slider' }).vm.$emit('update:modelValue', value)
  await nextTick()
}

function openDetailsCount(wrapper: HistoryWrapper): number {
  return wrapper
    .findAll('details.optimizer-history__filter-group')
    .filter((d) => (d.element as HTMLDetailsElement).open).length
}

describe('Filter functionality', () => {
  it('shows all runs when no filters applied', () => {
    const runs = [
      makeMultiRun({ status: 'completed' }, 1),
      makeMultiRun({ status: 'failed' }, 2),
      makeMultiRun({ status: 'running' }, 3),
    ]
    const wrapper = mountHistoryMulti(runs)

    expect(wrapper.text()).toContain('#1')
    expect(wrapper.text()).toContain('#2')
    expect(wrapper.text()).toContain('#3')
    expect(wrapper.text()).not.toContain('No runs match the current filters.')
  })

  it('filters by status (OR logic within status)', async () => {
    const runs = [
      makeMultiRun({ status: 'completed' }, 1),
      makeMultiRun({ status: 'failed' }, 2),
      makeMultiRun({ status: 'running' }, 3),
    ]
    const wrapper = mountHistoryMulti(runs)

    // Check 'completed' status checkbox
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    // Status checkboxes come first in ALL_STATUSES order
    // Find the one for 'completed' (index 2 in ALL_STATUSES: running, evaluating, completed)
    const completedCheckbox = checkboxes.find((cb) => {
      const label = cb.element.closest('label')
      return label?.textContent?.includes('completed') && !label?.textContent?.includes('completed_max_rounds')
    })
    expect(completedCheckbox).toBeDefined()
    await checkInput(completedCheckbox!)

    expect(wrapper.text()).toContain('#1')
    expect(wrapper.text()).not.toContain('#2')
    expect(wrapper.text()).not.toContain('#3')
  })

  it('shows empty state when filter matches nothing', async () => {
    const runs = [
      makeMultiRun({ status: 'completed' }, 1),
      makeMultiRun({ status: 'completed' }, 2),
    ]
    const wrapper = mountHistoryMulti(runs)

    // Check 'failed' status — no runs have this status
    const failedCheckbox = wrapper.findAll('input[type="checkbox"]').find((cb) => {
      const label = cb.element.closest('label')
      return label?.textContent?.trim().startsWith('failed')
    })
    expect(failedCheckbox).toBeDefined()
    await checkInput(failedCheckbox!)

    expect(wrapper.text()).toContain('No runs match the current filters.')
    expect(wrapper.text()).not.toContain('#1')
    expect(wrapper.text()).not.toContain('#2')
  })

  it('clears individual filter dimension via chip', async () => {
    const runs = [
      makeMultiRun({ status: 'completed' }, 1),
      makeMultiRun({ status: 'failed' }, 2),
    ]
    const wrapper = mountHistoryMulti(runs)

    // Filter by completed
    const completedCheckbox = wrapper.findAll('input[type="checkbox"]').find((cb) => {
      const label = cb.element.closest('label')
      return label?.textContent?.includes('completed') && !label?.textContent?.includes('completed_max_rounds')
    })
    await checkInput(completedCheckbox!)

    // Only run #1 visible
    expect(wrapper.text()).toContain('#1')
    expect(wrapper.text()).not.toContain('#2')

    // Click clear button on the status chip
    const clearBtn = wrapper.find('.optimizer-history__chip-close')
    await clearBtn.trigger('click')

    // Both runs visible again
    expect(wrapper.text()).toContain('#1')
    expect(wrapper.text()).toContain('#2')
  })

  it('clears all filters via clear all button', async () => {
    const runs = [
      makeMultiRun({ status: 'completed' }, 1),
      makeMultiRun({ status: 'failed' }, 2),
    ]
    const wrapper = mountHistoryMulti(runs)

    const completedCheckbox = wrapper.findAll('input[type="checkbox"]').find((cb) => {
      const label = cb.element.closest('label')
      return label?.textContent?.includes('completed') && !label?.textContent?.includes('completed_max_rounds')
    })
    await checkInput(completedCheckbox!)
    expect(wrapper.text()).not.toContain('#2')

    const clearAll = wrapper.find('.optimizer-history__clear-all')
    await clearAll.trigger('click')

    expect(wrapper.text()).toContain('#1')
    expect(wrapper.text()).toContain('#2')
  })

  it('excludes runs with null test_accuracy when accuracy filter is active', async () => {
    const runs = [
      makeMultiRun({ test_accuracy: 0.85 }, 1),
      makeMultiRun({ test_accuracy: null }, 2),
      makeMultiRun({ test_accuracy: 0.6 }, 3),
    ]
    const wrapper = mountHistoryMulti(runs)

    await emitSliderUpdate(wrapper, [70, 100])

    expect(wrapper.text()).toContain('#1')
    expect(wrapper.text()).not.toContain('#2')
    expect(wrapper.text()).not.toContain('#3')
  })

  it('shows null-accuracy runs when no accuracy filter is active', () => {
    const runs = [
      makeMultiRun({ test_accuracy: 0.85 }, 1),
      makeMultiRun({ test_accuracy: null }, 2),
    ]
    const wrapper = mountHistoryMulti(runs)

    expect(wrapper.text()).toContain('#1')
    expect(wrapper.text()).toContain('#2')
  })
})

describe('Compare functionality', () => {
  it('shows guidance text in Compare tab when fewer than 2 runs selected', async () => {
    const runs = [makeMultiRun({}, 1), makeMultiRun({}, 2)]
    const wrapper = mountHistoryMulti(runs)

    const runCheckboxes = wrapper.findAll('.optimizer-history__run-checkbox-label input[type="checkbox"]')
    await checkInput(runCheckboxes[0])

    await openCompareTab(wrapper)

    // Cannot compare with < 2 selected: guidance text instead of a table
    expect(wrapper.text()).toContain(COMPARE_GUIDE_TEXT)
    expect(wrapper.find('.optimizer-history__compare-table').exists()).toBe(false)
  })

  it('shows badge count and comparison table when 2+ runs selected', async () => {
    const runs = [makeMultiRun({}, 1), makeMultiRun({}, 2)]
    const wrapper = mountHistoryMulti(runs)

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    // Skip status filter checkboxes; find run checkboxes by label class
    const runCheckboxes = checkboxes.filter((cb) => {
      const label = cb.element.closest('label')
      return label?.classList.contains('optimizer-history__run-checkbox-label')
    })
    await checkInput(runCheckboxes[0])
    await checkInput(runCheckboxes[1])

    const badge = wrapper.find('.optimizer-history__subtab-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('2')

    await openCompareTab(wrapper)
    expect(wrapper.find('.optimizer-history__compare-table').exists()).toBe(true)
  })

  it('shows comparison table with correct fields when Compare sub-tab opened', async () => {
    const runs = [
      makeMultiRun({ baseline_accuracy: 0.5, test_accuracy: 0.7 }, 1),
      makeMultiRun({ baseline_accuracy: 0.6, test_accuracy: 0.8 }, 2),
    ]
    const wrapper = mountHistoryMulti(runs)

    const runCheckboxes = wrapper.findAll('.optimizer-history__run-checkbox-label input[type="checkbox"]')
    await checkInput(runCheckboxes[0])
    await checkInput(runCheckboxes[1])

    await openCompareTab(wrapper)

    expect(wrapper.find('.optimizer-history__compare-table').exists()).toBe(true)
    expect(wrapper.text()).toContain('Run Comparison')
    expect(wrapper.text()).toContain('Baseline Accuracy')
    expect(wrapper.text()).toContain('Test Accuracy')
    expect(wrapper.text()).toContain('Best Accuracy')
    expect(wrapper.text()).toContain('Accuracy Gain')
  })

  it('highlights max test accuracy in comparison table', async () => {
    const runs = [
      makeMultiRun({ test_accuracy: 0.7 }, 1),
      makeMultiRun({ test_accuracy: 0.85 }, 2),
    ]
    const wrapper = mountHistoryMulti(runs)

    const runCheckboxes = wrapper.findAll('.optimizer-history__run-checkbox-label input[type="checkbox"]')
    await checkInput(runCheckboxes[0])
    await checkInput(runCheckboxes[1])
    await openCompareTab(wrapper)

    const highlighted = wrapper.findAll('.optimizer-history__compare-highlight')
    expect(highlighted.length).toBeGreaterThan(0)
  })

  it('removes run from comparison when remove button clicked', async () => {
    const runs = [makeMultiRun({}, 1), makeMultiRun({}, 2)]
    const wrapper = mountHistoryMulti(runs)

    const runCheckboxes = wrapper.findAll('.optimizer-history__run-checkbox-label input[type="checkbox"]')
    await checkInput(runCheckboxes[0])
    await checkInput(runCheckboxes[1])
    await openCompareTab(wrapper)

    // Compare table visible
    expect(wrapper.find('.optimizer-history__compare-table').exists()).toBe(true)

    // Click remove on first run column
    await wrapper.find('.optimizer-history__compare-remove').trigger('click')

    // Table replaced by guidance text (< 2 runs)
    expect(wrapper.find('.optimizer-history__compare-table').exists()).toBe(false)
    expect(wrapper.text()).toContain(COMPARE_GUIDE_TEXT)
  })

  it('limits selection to 4 runs (MAX_COMPARE)', async () => {
    const runs = [1, 2, 3, 4, 5].map((id) => makeMultiRun({}, id))
    const wrapper = mountHistoryMulti(runs)

    const runCheckboxes = wrapper.findAll('.optimizer-history__run-checkbox-label input[type="checkbox"]')
    // Select first 4
    for (let i = 0; i < 4; i++) {
      await checkInput(runCheckboxes[i])
    }

    // 5th checkbox should be disabled
    expect((runCheckboxes[4].element as HTMLInputElement).disabled).toBe(true)
  })
})

describe('Filter-Compare integration', () => {
  it('clears selected runs that are filtered out', async () => {
    const runs = [
      makeMultiRun({ status: 'completed' }, 1),
      makeMultiRun({ status: 'failed' }, 2),
    ]
    const wrapper = mountHistoryMulti(runs)

    // Select both runs for compare
    const runCheckboxes = wrapper.findAll('.optimizer-history__run-checkbox-label input[type="checkbox"]')
    await checkInput(runCheckboxes[0])
    await checkInput(runCheckboxes[1])

    // Both selected — Compare badge shows 2
    expect(wrapper.find('.optimizer-history__subtab-badge').text()).toBe('2')

    // Now filter to only 'completed' — run #2 (failed) gets filtered out
    const completedCheckbox = wrapper.findAll('input[type="checkbox"]').find((cb) => {
      const label = cb.element.closest('label')
      return label?.textContent?.includes('completed') && !label?.textContent?.includes('completed_max_rounds')
    })
    await checkInput(completedCheckbox!)

    // Only 1 run selected now — Compare tab shows guidance text instead of a table
    expect(wrapper.find('.optimizer-history__subtab-badge').text()).toBe('1')
    await openCompareTab(wrapper)
    expect(wrapper.find('.optimizer-history__compare-table').exists()).toBe(false)
    expect(wrapper.text()).toContain(COMPARE_GUIDE_TEXT)
  })

  it('shows guidance text in Compare tab when selected runs drop below 2', async () => {
    const runs = [makeMultiRun({}, 1), makeMultiRun({}, 2)]
    const wrapper = mountHistoryMulti(runs)

    const runCheckboxes = wrapper.findAll('.optimizer-history__run-checkbox-label input[type="checkbox"]')
    await checkInput(runCheckboxes[0])
    await checkInput(runCheckboxes[1])
    await openCompareTab(wrapper)

    // Table visible
    expect(wrapper.find('.optimizer-history__compare-table').exists()).toBe(true)

    // Go back to Runs and deselect one run
    await openRunsTab(wrapper)
    const refreshedCheckboxes = wrapper.findAll('.optimizer-history__run-checkbox-label input[type="checkbox"]')
    await checkInput(refreshedCheckboxes[1], false)

    // Compare tab now shows guidance instead of the table
    await openCompareTab(wrapper)
    expect(wrapper.find('.optimizer-history__compare-table').exists()).toBe(false)
    expect(wrapper.text()).toContain(COMPARE_GUIDE_TEXT)
  })
})

// ── AC-36: formatDuration 邊界情況 ────────────────────────────────────────────

describe('formatDuration in compare panel', () => {
  it('shows — when finished_at is null', async () => {
    const runs = [
      makeMultiRun({ finished_at: null }, 1),
      makeMultiRun({ finished_at: null }, 2),
    ]
    const wrapper = mountHistoryMulti(runs)
    const runCheckboxes = wrapper.findAll('.optimizer-history__run-checkbox-label input[type="checkbox"]')
    await checkInput(runCheckboxes[0])
    await checkInput(runCheckboxes[1])
    await openCompareTab(wrapper)
    const rows = wrapper.findAll('.optimizer-history__compare-table tr')
    const durationRow = rows.find((r) => r.text().includes('Duration'))
    expect(durationRow?.text()).toContain('—')
  })

  it('calculates duration correctly for finished runs', async () => {
    const runs = [
      makeMultiRun({ started_at: '2026-06-01T10:00:00.000Z', finished_at: '2026-06-01T10:02:30.000Z' }, 1),
      makeMultiRun({ started_at: '2026-06-01T10:00:00.000Z', finished_at: '2026-06-01T10:02:30.000Z' }, 2),
    ]
    const wrapper = mountHistoryMulti(runs)
    const runCheckboxes = wrapper.findAll('.optimizer-history__run-checkbox-label input[type="checkbox"]')
    await checkInput(runCheckboxes[0])
    await checkInput(runCheckboxes[1])
    await openCompareTab(wrapper)
    const rows = wrapper.findAll('.optimizer-history__compare-table tr')
    const durationRow = rows.find((r) => r.text().includes('Duration'))
    expect(durationRow?.text()).toContain('2m 30s')
  })
})

// ── AC-37: accuracyGain 邊界情況 ──────────────────────────────────────────────

describe('accuracyGain in compare panel', () => {
  it('shows — when baseline_accuracy is null', async () => {
    const runs = [
      makeMultiRun({ baseline_accuracy: null, best_accuracy: 0.8 }, 1),
      makeMultiRun({ baseline_accuracy: null, best_accuracy: 0.7 }, 2),
    ]
    const wrapper = mountHistoryMulti(runs)
    const runCheckboxes = wrapper.findAll('.optimizer-history__run-checkbox-label input[type="checkbox"]')
    await checkInput(runCheckboxes[0])
    await checkInput(runCheckboxes[1])
    await openCompareTab(wrapper)
    const rows = wrapper.findAll('.optimizer-history__compare-table tr')
    const gainRow = rows.find((r) => r.text().includes('Accuracy Gain'))
    expect(gainRow?.text()).toContain('—')
  })

  it('calculates positive gain correctly', async () => {
    const runs = [
      makeMultiRun({ baseline_accuracy: 0.5 }, 1),
      makeMultiRun({ baseline_accuracy: 0.6 }, 2),
    ]
    runs[0].rounds = [{ round_number: 1, accuracy: 0.8, prompt_version_id: 1, failed_case_count: 0, kept: true, eval_run_id: null }]
    runs[1].rounds = [{ round_number: 1, accuracy: 0.75, prompt_version_id: 2, failed_case_count: 0, kept: true, eval_run_id: null }]
    const wrapper = mountHistoryMulti(runs)
    const runCheckboxes = wrapper.findAll('.optimizer-history__run-checkbox-label input[type="checkbox"]')
    await checkInput(runCheckboxes[0])
    await checkInput(runCheckboxes[1])
    await openCompareTab(wrapper)
    const rows = wrapper.findAll('.optimizer-history__compare-table tr')
    const gainRow = rows.find((r) => r.text().includes('Accuracy Gain'))
    expect(gainRow?.text()).toContain('+30.0%')
    expect(gainRow?.text()).toContain('+15.0%')
  })
})

// ── AC-38: compareMaxField 邊界情況 ──────────────────────────────────────────

describe('compare highlight logic', () => {
  it('does not highlight any cell when all test accuracies are null', async () => {
    const runs = [
      makeMultiRun({ test_accuracy: null }, 1),
      makeMultiRun({ test_accuracy: null }, 2),
    ]
    const wrapper = mountHistoryMulti(runs)
    const runCheckboxes = wrapper.findAll('.optimizer-history__run-checkbox-label input[type="checkbox"]')
    await checkInput(runCheckboxes[0])
    await checkInput(runCheckboxes[1])
    await openCompareTab(wrapper)
    const highlights = wrapper.findAll('.optimizer-history__compare-highlight')
    const testAccuracyHighlights = highlights.filter((h) => {
      const row = h.element.closest('tr')
      return row?.textContent?.includes('Test Accuracy')
    })
    expect(testAccuracyHighlights).toHaveLength(0)
  })

  it('highlights all cells when all have same max value', async () => {
    const runs = [
      makeMultiRun({ test_accuracy: 0.8 }, 1),
      makeMultiRun({ test_accuracy: 0.8 }, 2),
    ]
    const wrapper = mountHistoryMulti(runs)
    const runCheckboxes = wrapper.findAll('.optimizer-history__run-checkbox-label input[type="checkbox"]')
    await checkInput(runCheckboxes[0])
    await checkInput(runCheckboxes[1])
    await openCompareTab(wrapper)
    const rows = wrapper.findAll('.optimizer-history__compare-table tr')
    const testRow = rows.find((r) => r.text().includes('Test Accuracy'))
    const highlights = testRow?.findAll('.optimizer-history__compare-highlight') ?? []
    expect(highlights).toHaveLength(2)
  })
})

// ── Sub-tab switching (Runs / Compare) ───────────────────────────────────────

describe('Sub-tab switching', () => {
  it('defaults to Runs sub-tab without compare bar or compare panel', () => {
    const runs = [makeMultiRun({}, 1), makeMultiRun({}, 2)]
    const wrapper = mountHistoryMulti(runs)

    const tabs = subTabs(wrapper)
    expect(tabs).toHaveLength(2)
    expect(tabs[0].classes()).toContain('optimizer-history__subtab--active')
    expect(tabs[1].classes()).not.toContain('optimizer-history__subtab--active')

    // Runs view content visible
    expect(wrapper.find('.optimizer-history__filter-bar').exists()).toBe(true)
    expect(wrapper.text()).toContain('#1')

    // Legacy compare bar and full-width compare panel no longer exist
    expect(wrapper.find('.optimizer-history__compare-bar').exists()).toBe(false)
    expect(wrapper.find('.optimizer-history__compare-btn').exists()).toBe(false)
    expect(wrapper.find('.optimizer-history__compare-panel').exists()).toBe(false)
    expect(wrapper.find('.optimizer-history__compare-table').exists()).toBe(false)
  })

  it('shows guidance text in Compare tab when nothing is selected', async () => {
    const runs = [makeMultiRun({}, 1), makeMultiRun({}, 2)]
    const wrapper = mountHistoryMulti(runs)

    await openCompareTab(wrapper)

    expect(subTabs(wrapper)[1].classes()).toContain('optimizer-history__subtab--active')
    expect(wrapper.text()).toContain(COMPARE_GUIDE_TEXT)
    expect(wrapper.find('.optimizer-history__compare-table').exists()).toBe(false)
    // No badge when nothing is selected
    expect(wrapper.find('.optimizer-history__subtab-badge').exists()).toBe(false)
  })

  it('shows selection count badge on the Compare sub-tab label', async () => {
    const runs = [makeMultiRun({}, 1), makeMultiRun({}, 2), makeMultiRun({}, 3)]
    const wrapper = mountHistoryMulti(runs)

    const runCheckboxes = wrapper.findAll('.optimizer-history__run-checkbox-label input[type="checkbox"]')
    await checkInput(runCheckboxes[0])
    await checkInput(runCheckboxes[1])
    await checkInput(runCheckboxes[2])

    const badge = wrapper.find('.optimizer-history__subtab-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('3')
  })

  it('preserves compare selection when switching back to Runs sub-tab', async () => {
    const runs = [makeMultiRun({}, 1), makeMultiRun({}, 2)]
    const wrapper = mountHistoryMulti(runs)

    const runCheckboxes = wrapper.findAll('.optimizer-history__run-checkbox-label input[type="checkbox"]')
    await checkInput(runCheckboxes[0])
    await checkInput(runCheckboxes[1])

    await openCompareTab(wrapper)
    expect(wrapper.find('.optimizer-history__compare-table').exists()).toBe(true)

    await openRunsTab(wrapper)
    // Selection preserved: badge still shows 2 and both rows are marked selected
    expect(wrapper.find('.optimizer-history__subtab-badge').text()).toBe('2')
    expect(wrapper.findAll('.optimizer-history__run-item--selected')).toHaveLength(2)
  })
})

// ── Exclusive filter dropdown expansion ──────────────────────────────────────

describe('Exclusive filter dropdown', () => {
  it('keeps at most one filter dropdown open at a time', async () => {
    const runs = [makeMultiRun({}, 1)]
    const wrapper = mountHistoryMulti(runs)

    const summaries = wrapper.findAll('.optimizer-history__filter-summary')
    // Runs without models render 3 filter groups: Status, Test Accuracy, Started At
    expect(summaries.length).toBeGreaterThanOrEqual(3)

    await summaries[0].trigger('click')
    expect(openDetailsCount(wrapper)).toBe(1)

    await summaries[1].trigger('click')
    expect(openDetailsCount(wrapper)).toBe(1)

    const details = wrapper.findAll('details.optimizer-history__filter-group')
    expect((details[0].element as HTMLDetailsElement).open).toBe(false)
    expect((details[1].element as HTMLDetailsElement).open).toBe(true)
  })

  it('toggles a dropdown closed when its summary is clicked again', async () => {
    const runs = [makeMultiRun({}, 1)]
    const wrapper = mountHistoryMulti(runs)

    const summaries = wrapper.findAll('.optimizer-history__filter-summary')
    await summaries[0].trigger('click')
    expect(openDetailsCount(wrapper)).toBe(1)

    await summaries[0].trigger('click')
    expect(openDetailsCount(wrapper)).toBe(0)
  })

  it('closes all dropdowns when clicking outside the filter bar', async () => {
    const runs = [makeMultiRun({}, 1)]
    const wrapper = mountHistoryMulti(runs)

    const summaries = wrapper.findAll('.optimizer-history__filter-summary')
    await summaries[0].trigger('click')
    expect(openDetailsCount(wrapper)).toBe(1)

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await nextTick()

    expect(openDetailsCount(wrapper)).toBe(0)
  })
})

// ── Accuracy range slider sync ───────────────────────────────────────────────

describe('Accuracy slider sync', () => {
  it('syncs slider percentages to 0-1 filter values and shows the chip', async () => {
    const runs = [
      makeMultiRun({ test_accuracy: 0.5 }, 1),
      makeMultiRun({ test_accuracy: 0.6 }, 2),
      makeMultiRun({ test_accuracy: 0.9 }, 3),
    ]
    const wrapper = mountHistoryMulti(runs)

    await emitSliderUpdate(wrapper, [55, 85])

    // Chip reflects 0-1 values formatted as percentages
    expect(wrapper.text()).toContain('Accuracy: 55.0% to 85.0%')
    // Range display shows the slider percentages
    expect(wrapper.text()).toContain('55% – 85%')
    // Runs filtered by 0-1 values (0.55–0.85)
    expect(wrapper.text()).not.toContain('#1')
    expect(wrapper.text()).toContain('#2')
    expect(wrapper.text()).not.toContain('#3')
  })

  it('treats the full range [0, 100] as no active accuracy filter', async () => {
    const runs = [
      makeMultiRun({ test_accuracy: 0.5 }, 1),
      makeMultiRun({ test_accuracy: null }, 2),
    ]
    const wrapper = mountHistoryMulti(runs)

    await emitSliderUpdate(wrapper, [40, 85])
    expect(wrapper.text()).toContain('1 filter active')

    await emitSliderUpdate(wrapper, [0, 100])

    // No accuracy chip and runs with null accuracy stay visible
    expect(wrapper.text()).not.toContain('filter active')
    expect(wrapper.text()).toContain('#1')
    expect(wrapper.text()).toContain('#2')
  })

  it('resets the slider to [0, 100] when clearing all filters', async () => {
    const runs = [makeMultiRun({ test_accuracy: 0.5 }, 1)]
    const wrapper = mountHistoryMulti(runs)

    await emitSliderUpdate(wrapper, [40, 85])
    expect(wrapper.text()).toContain('Accuracy: 40.0% to 85.0%')

    await wrapper.find('.optimizer-history__clear-all').trigger('click')

    const slider = wrapper.findComponent({ name: 'Slider' })
    expect(slider.props('modelValue')).toEqual([0, 100])
    expect(wrapper.text()).not.toContain('Accuracy: 40.0%')
    expect(wrapper.text()).toContain('0% – 100%')
  })
})
