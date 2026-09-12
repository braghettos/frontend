// @vitest-environment jsdom
/**
 * A Tag must never carry its meaning by colour alone.
 *
 * #82 §0.7: an unset annotation resolved `label` to '' and the widget rendered a bare coloured
 * pill — a 6px dot and nothing else. That is invisible to a screen reader and to a colourblind
 * reader, and it survives neither a print nor a screenshot into a ticket.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import Tag from './Tag'

const renderTag = (widgetData: Record<string, unknown>) =>
  render(<Tag resourcesRefs={{ items: [] }} uid='t' widgetData={widgetData as never} />)

const dot = (container: HTMLElement) => container.querySelector('.ant-tag > span[style*="border-radius"]')

describe('Tag — colour is never the only signal', () => {
  afterEach(() => { cleanup() })

  it('renders the status dot for a coloured, labelled pill', () => {
    const { container } = renderTag({ color: 'green', label: 'Healthy' })

    expect(container.textContent).toContain('Healthy')
    expect(dot(container)).not.toBeNull()
  })

  it('renders NO dot when the label is empty — colour alone is not a signal', () => {
    const { container } = renderTag({ color: 'green', label: '' })

    expect(dot(container)).toBeNull()
  })

  it('renders no dot when the label is absent entirely', () => {
    const { container } = renderTag({ color: 'green' })

    expect(dot(container)).toBeNull()
  })

  it('an uncoloured labelled tag renders its text and no dot', () => {
    const { container } = renderTag({ label: 'Draft' })

    expect(container.textContent).toContain('Draft')
    expect(dot(container)).toBeNull()
  })
})
