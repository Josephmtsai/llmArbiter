import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import OptimizerOverview from '../components/optimizer/OptimizerOverview.vue'
import type { OptimizerRun } from '../types/api'

const lightweightRun: OptimizerRun = {
  optimizer_run_id: 3,
  status: 'completed_max_rounds',
  max_rounds: 2,
  target_accuracy: 0.9,
  optimizer_model: 'deepseek/deepseek-v4-flash',
  evaluator_provider: 'openrouter',
  evaluator_model: 'tencent/hy3-preview',
  started_at: '2026-06-03T12:19:39.059270+00:00',
  finished_at: '2026-06-03T13:47:43.638110+00:00',
  prompt_version_id: 3,
  baseline_eval_run_id: 44,
  current_eval_run_id: null,
  baseline_accuracy: 0.5,
  best_accuracy: 0.735,
  test_accuracy: 0.7175,
  round_count: 2,
  error_message: null,
}

describe('OptimizerOverview', () => {
  it('renders recent runs from lightweight optimizer history payloads', () => {
    const wrapper = mount(OptimizerOverview, {
      props: {
        stats: null,
        lowestCoverage: null,
        reviewTotal: 0,
        latestRun: lightweightRun,
        activeRun: null,
        runs: [lightweightRun],
        loadingStats: false,
        starting: false,
        cancellingRunId: null,
        maxRounds: 2,
        targetAccuracy: 0.9,
      },
      global: {
        stubs: {
          UiActionBadge: { props: ['action'], template: '<span>{{ action }}</span>' },
          UiButton: { template: '<button><slot name="icon" /><slot /></button>' },
          UiCard: { template: '<div><slot /></div>' },
          UiEyebrow: { template: '<span><slot /></span>' },
          UiField: { template: '<label><slot /></label>' },
          UiInput: { template: '<input />' },
        },
      },
    })

    expect(wrapper.text()).toContain('Recent optimizer runs')
    expect(wrapper.text()).toContain('#3')
    expect(wrapper.text()).toContain('completed_max_rounds')
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('74%')
  })
})
