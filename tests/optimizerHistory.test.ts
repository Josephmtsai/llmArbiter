import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import OptimizerHistory from '../components/optimizer/OptimizerHistory.vue'
import type { OptimizerRun } from '../types/api'

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
      stubs: {
        UiCard: { template: '<div><slot /></div>' },
        UiEyebrow: { template: '<span><slot /></span>' },
        UiSpinner: { template: '<span />' },
        NuxtLink: {
          props: ['to'],
          template: '<a :href="to"><slot /></a>',
        },
      },
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
})
