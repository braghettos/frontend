// @vitest-environment jsdom
/**
 * PageHeader — the contract, not the pixels.
 *
 * This widget exists because five pages each hand-rolled the same chrome under three different
 * names, so what matters is that the shape it guarantees actually holds: one baseline row carrying
 * the title, its counter and its tags, with the page's actions right-aligned beside them.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type * as Utils from '../../utils/utils'

import PageHeader from './PageHeader'
import type { PageHeaderWidgetData } from './PageHeader'

// The actions render a nested WidgetRenderer (which would fetch); stub it — we assert composition.
vi.mock('../../components/WidgetRenderer', () => ({ default: () => <div data-testid='action' /> }))
vi.mock('../../utils/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof Utils>()),
  getEndpointUrl: (id: string) => (id === 'missing' ? undefined : 'http://example.test/endpoint'),
}))

const renderHeader = (widgetData: Partial<PageHeaderWidgetData>) => render(
  <PageHeader
    resourcesRefs={{ items: [] }}
    uid='ph'
    widgetData={{ allowedResources: ['buttons'], items: [], title: 'Compositions', ...widgetData }}
  />,
)

describe('PageHeader', () => {
  afterEach(() => { cleanup() })

  it('renders the title as the page heading', () => {
    renderHeader({})
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Compositions')
  })

  it('renders a counter in brackets INSIDE the heading, not as a separate fact', () => {
    renderHeader({ counter: 397 })
    // Inside the h1 is the whole point: a count belongs to the title's type step (P4), which is
    // what stops it drifting into its own Paragraph as it did on the Marketplace page.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('(397)')
  })

  it('omits the counter entirely when absent — never renders an empty bracket', () => {
    renderHeader({})
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toContain('(')
  })

  it('renders a counter of zero — 0 is a real answer, not a missing one', () => {
    renderHeader({ counter: 0 })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('(0)')
  })

  it('places tags on the title line', () => {
    renderHeader({ tags: [{ color: 'green', label: 'Healthy' }] })
    expect(screen.getByText('Healthy')).toBeTruthy()
  })

  it('renders the subtitle when given, and nothing when not', () => {
    const { unmount } = renderHeader({ subtitle: 'Every composition on the cluster' })
    expect(screen.getByText('Every composition on the cluster')).toBeTruthy()
    unmount()

    renderHeader({})
    expect(screen.queryByText('Every composition on the cluster')).toBeNull()
  })

  it('renders each resolvable action', () => {
    renderHeader({ items: [{ resourceRefId: 'new-composition' }, { resourceRefId: 'export' }] })
    expect(screen.getAllByTestId('action')).toHaveLength(2)
  })

  it('skips an unresolvable action LOUDLY — a vanished button must not be silent', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => { /* silenced */ })
    renderHeader({ items: [{ resourceRefId: 'missing' }, { resourceRefId: 'ok' }] })

    expect(screen.getAllByTestId('action')).toHaveLength(1)
    // The whole point: the author gets told which ref failed, by name.
    expect(spy.mock.calls.some((args) => String(args[0]).includes('missing'))).toBe(true)
    spy.mockRestore()
  })

  it('renders a header with no actions at all', () => {
    renderHeader({ items: [] })
    expect(screen.queryAllByTestId('action')).toHaveLength(0)
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
  })
})
