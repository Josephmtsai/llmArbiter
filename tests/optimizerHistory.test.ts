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
        NuxtLink: {
          props: ['to'],
          template: '<a :href="to"><slot /></a>',
        },
      },
    },
  })
}

describe('OptimizerHistory', () => {
  it('renders baseline and round eval links while handling null round IDs', () => {
    const wrapper = mountHistory(makeRun({}))

    expect(wrapper.html()).toContain('/evaluate/history/24')
    expect(wrapper.html()).toContain('/evaluate/history/25')
    expect(wrapper.text()).toContain('n/a')
    expect(wrapper.text()).toContain('Kept')
    expect(wrapper.text()).toContain('Reverted')
  })

  it('renders direct baseline pass messaging for completed runs without rounds', () => {
    const wrapper = mountHistory(
      makeRun({
        status: 'completed',
        baseline_eval_run_id: 18,
        rounds: [],
      }),
    )

    expect(wrapper.text()).toContain('Baseline already met the target')
    expect(wrapper.html()).toContain('/evaluate/history/18')
  })
})
