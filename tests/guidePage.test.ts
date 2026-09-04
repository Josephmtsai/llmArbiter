import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

// pages/guide.vue relies on Nuxt auto-imports; provide them before the page is imported.
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('definePageMeta', () => undefined)

const GuidePage = (await import('../pages/guide.vue')).default

const globalStubs = {
  AppTopBar: { props: ['title', 'subtitle'], template: '<header>{{ title }}</header>' },
  UiEyebrow: { template: '<span><slot /></span>' },
  UiCard: { template: '<div><slot /></div>' },
  NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
  GuideTooltip: { props: ['text'], template: '<span><slot /></span>' },
  GuideFigure: {
    props: ['eyebrow', 'title', 'caption'],
    template:
      '<figure><span class="fig-eyebrow">{{ eyebrow }}</span><strong class="fig-title">{{ title }}</strong>' +
      '<p class="fig-caption">{{ caption }}</p><slot /></figure>',
  },
  GuidePoolSankey: { template: '<svg data-test="pool-sankey" />' },
  GuideRunFlowDiagram: { template: '<svg data-test="run-flow" />' },
  GuideRoundFlowDiagram: { template: '<svg data-test="round-flow" />' },
  GuideRunSequenceDiagram: { template: '<svg data-test="run-seq" />' },
}

function mountPage() {
  return mount(GuidePage, { global: { stubs: globalStubs } })
}

describe('pages/guide.vue', () => {
  it('places each diagram inside its own section', () => {
    const wrapper = mountPage()

    expect(wrapper.find('#data-splits [data-test="pool-sankey"]').exists()).toBe(true)
    expect(wrapper.find('#run-lifecycle [data-test="run-flow"]').exists()).toBe(true)
    expect(wrapper.find('#gates [data-test="round-flow"]').exists()).toBe(true)
    expect(wrapper.find('#runtime-flow [data-test="run-seq"]').exists()).toBe(true)

    // Each section hosts exactly one figure, and the figures appear in page order.
    for (const id of ['data-splits', 'run-lifecycle', 'gates', 'runtime-flow']) {
      expect(wrapper.findAll(`#${id} figure`)).toHaveLength(1)
    }
    const order = wrapper.findAll('figure [data-test]').map((el) => el.attributes('data-test'))
    expect(order).toEqual(['pool-sankey', 'run-flow', 'round-flow', 'run-seq'])
  })

  it('places the round flowchart before the gate cards and the sequence before the timeline', () => {
    const wrapper = mountPage()

    const gates = wrapper.find('#gates')
    const gateChildren = [...gates.element.children].map(
      (el) => el.className || el.tagName.toLowerCase(),
    )
    expect(gateChildren.indexOf('figure')).toBeLessThan(
      gateChildren.indexOf('arb-guide__gate-grid'),
    )
    expect(gateChildren.indexOf('figure')).toBeGreaterThan(
      gateChildren.indexOf('arb-guide__section-head'),
    )

    const runtime = wrapper.find('#runtime-flow')
    const runtimeChildren = [...runtime.element.children].map(
      (el) => el.className || el.tagName.toLowerCase(),
    )
    expect(runtimeChildren.indexOf('figure')).toBeLessThan(
      runtimeChildren.indexOf('arb-guide__timeline'),
    )
    expect(runtimeChildren.indexOf('figure')).toBeGreaterThan(
      runtimeChildren.indexOf('arb-guide__section-head'),
    )
  })

  it('no longer renders the retired split and loop diagrams', () => {
    const html = mountPage().html().toLowerCase()

    expect(html).not.toContain('guidesplitdiagram')
    expect(html).not.toContain('guideloopdiagram')
    expect(html).not.toContain('10,400')
    // The retired split diagram showed 800 for both val and test. Scope the
    // check to the data-splits section so unrelated 800s cannot trip it.
    const splits = mountPage().find('#data-splits').html()
    expect(splits).not.toMatch(/\b800\b/)
  })

  it('keeps the two-gate heading and explains G0 in the Fig. 3 caption', () => {
    const wrapper = mountPage()

    expect(wrapper.find('#gates h2').text()).toBe('The two gates a candidate must pass')
    expect(wrapper.find('#gates .fig-caption').text()).toContain('Skipped, not Rejected')
  })

  it('switches every figure caption and the run-lifecycle heading when 中文 is selected', async () => {
    const wrapper = mountPage()

    expect(wrapper.text()).toContain('The backbone of one optimizer run')
    expect(wrapper.find('#run-lifecycle h2').text()).toBe(
      'One run, start to finish: from snapshot to test accuracy',
    )

    const tabs = wrapper.findAll('.arb-guide__lang-tab')
    expect(tabs).toHaveLength(2)
    await tabs[1].trigger('click')

    const text = wrapper.text()
    expect(text).toContain('一次 optimizer run 的骨幹')
    expect(text).not.toContain('The backbone of one optimizer run')
    expect(text).toContain('測試案例的流向：12,000 筆裡只有 600 筆會被評分')
    expect(text).toContain('每一輪的三道 gate：候選 prompt 怎麼變成 kept / rejected / skipped')
    expect(text).toContain('一次 run 的訊息往返：誰負責分析、誰負責評分、誰負責留下紀錄')
    expect(wrapper.find('#run-lifecycle h2').text()).toBe('一次執行從頭到尾：從快照到測試準確率')
    expect(wrapper.find('#gates h2').text()).toBe('候選提示必須通過的兩道閘')
    expect(wrapper.findAll('.fig-eyebrow').map((el) => el.text())).toEqual([
      '圖 1 · Sankey',
      '圖 2 · 流程圖 · Run 層級',
      '圖 3 · 流程圖 · Round 層級',
      '圖 4 · 循序圖',
    ])
  })
})
