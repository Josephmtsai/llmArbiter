import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'

import GuidePoolSankey from '../components/guide/GuidePoolSankey.vue'
import GuideRoundFlowDiagram from '../components/guide/GuideRoundFlowDiagram.vue'
import GuideRunFlowDiagram from '../components/guide/GuideRunFlowDiagram.vue'
import GuideRunSequenceDiagram from '../components/guide/GuideRunSequenceDiagram.vue'

const diagrams = [
  {
    name: 'GuidePoolSankey',
    component: GuidePoolSankey,
    title: 'Eval pool split and optimizer snapshot usage',
  },
  { name: 'GuideRunFlowDiagram', component: GuideRunFlowDiagram, title: 'Optimizer run lifecycle' },
  {
    name: 'GuideRoundFlowDiagram',
    component: GuideRoundFlowDiagram,
    title: 'Optimizer round gates',
  },
  {
    name: 'GuideRunSequenceDiagram',
    component: GuideRunSequenceDiagram,
    title: 'Optimizer run message sequence',
  },
] as const

const expectedText: Record<(typeof diagrams)[number]['name'], string[]> = {
  GuidePoolSankey: [
    '12,000 cases',
    '2,400 per action',
    '7,200 · 60%',
    '2,400 · 20%',
    '200 · 40/action',
    '400 · 80/action',
    '4,200',
    '600 of 12,000',
  ],
  GuideRunFlowDiagram: [
    'Start optimizer run',
    'Snapshot val set + baseline eval',
    'Round N: candidate + gates',
    'Target reached or max rounds?',
    'Test-set acceptance',
    'Operator activation gate',
    'PATCH /config/prompts/{id}/activate',
    'Fig. 3 → kept / rejected / skipped',
  ],
  GuideRoundFlowDiagram: [
    'G0 · Candidate valid?',
    'G1 · Overall accuracy > best?',
    'G2 · Protected actions hold?',
    'Kept → new best prompt',
    'Rejected → previous best stays',
    'Skipped → nothing tested',
    'notify_human, send_email ±2% · trigger_* ±5%',
  ],
  GuideRunSequenceDiagram: [
    'Operator UI',
    'Optimizer task',
    'Optimizer LLM',
    'Evaluator',
    'PostgreSQL',
    'POST /OPTIMIZER/RUN',
    'EVAL BASELINE · 200',
    'EVAL CANDIDATE · 200',
    'KEEP / REJECT GATES',
    'INSERT ROUND + FAILURES',
    'EVAL TEST · 400',
    'TEST_ACCURACY',
  ],
}

describe.each(diagrams)('$name', ({ name, component, title }) => {
  it('renders exactly one accessible svg with a title and description', () => {
    const wrapper = mount(component)
    const svgs = wrapper.findAll('svg[role="img"]')
    expect(svgs).toHaveLength(1)

    const svg = svgs[0]
    const titleEl = svg.find('title')
    const descEl = svg.find('desc')
    expect(titleEl.exists()).toBe(true)
    expect(descEl.exists()).toBe(true)
    expect(titleEl.text()).toBe(title)
    expect(descEl.text().length).toBeGreaterThan(0)

    const titleId = titleEl.attributes('id')
    const descId = descEl.attributes('id')
    expect(titleId).toBeTruthy()
    expect(descId).toBeTruthy()
    // The title is the accessible name; the long desc is the description,
    // so it must not be concatenated into aria-labelledby.
    expect(svg.attributes('aria-labelledby')).toBe(titleId)
    expect(svg.attributes('aria-describedby')).toBe(descId)
    expect(svg.find(`[id="${titleId}"]`).exists()).toBe(true)
    expect(svg.find(`[id="${descId}"]`).exists()).toBe(true)
  })

  it('contains the expected diagram text', () => {
    const text = mount(component).text()
    for (const fragment of expectedText[name]) {
      expect(text).toContain(fragment)
    }
  })

  it('has no scripts, literal fonts, or literal colours', () => {
    const html = mount(component).html()
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/font-family=/)
    // Strip url(#id) references first - their # is a fragment, not a colour.
    const withoutRefs = html.replace(/url\(#[^)]*\)/g, '')
    expect(withoutRefs).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(html).not.toMatch(/rgba?\(/)
    expect(html).not.toMatch(/\sstyle=/)
  })

  it('resolves every url(#…) reference to a marker in the same svg', () => {
    const wrapper = mount(component)
    const markerIds = wrapper.findAll('marker').map((marker) => marker.attributes('id'))
    const references = [...wrapper.html().matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1])
    for (const reference of references) {
      expect(markerIds).toContain(reference)
    }
    expect(markerIds.every((id) => id && id.length > 0)).toBe(true)
  })

  it('gives two instances on the same page different ids', () => {
    const Twice = defineComponent({
      components: { Diagram: component },
      template: '<div><Diagram /><Diagram /></div>',
    })
    const wrapper = mount(Twice)
    const titleIds = wrapper.findAll('title').map((el) => el.attributes('id'))
    expect(titleIds).toHaveLength(2)
    expect(titleIds[0]).not.toBe(titleIds[1])

    const markerIds = wrapper.findAll('marker').map((el) => el.attributes('id'))
    expect(new Set(markerIds).size).toBe(markerIds.length)
  })
})
