import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import GuideFigure from '../components/guide/GuideFigure.vue'

describe('GuideFigure', () => {
  it('renders eyebrow, title and caption from props', () => {
    const wrapper = mount(GuideFigure, {
      props: { eyebrow: 'Fig. 1 · Sankey', title: 'Where the cases go', caption: 'Ribbon width equals case count.' },
    })

    expect(wrapper.find('.gfig__eyebrow').text()).toBe('Fig. 1 · Sankey')
    expect(wrapper.find('.gfig__title').text()).toBe('Where the cases go')
    expect(wrapper.find('.gfig__caption').text()).toBe('Ribbon width equals case count.')
    expect(wrapper.find('figure.gfig figcaption.gfig__head').exists()).toBe(true)
  })

  it('omits the caption node when the prop is not passed', () => {
    const wrapper = mount(GuideFigure, {
      props: { eyebrow: 'Fig. 2', title: 'Run lifecycle' },
    })

    expect(wrapper.find('.gfig__caption').exists()).toBe(false)
    expect(wrapper.find('.gfig__title').text()).toBe('Run lifecycle')
  })

  it('renders slot content inside the scroll container', () => {
    const wrapper = mount(GuideFigure, {
      props: { eyebrow: 'Fig. 3', title: 'Gates' },
      slots: { default: '<svg data-test="diagram"></svg>' },
    })

    const scroll = wrapper.find('.gfig__scroll')
    expect(scroll.exists()).toBe(true)
    expect(scroll.find('[data-test="diagram"]').exists()).toBe(true)
    expect(wrapper.html()).not.toMatch(/\sstyle=/)
  })
})
