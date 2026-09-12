// @vitest-environment jsdom
/**
 * Accessibility regression tests for ListView's clickable rows.
 *
 * WCAG 2.1 SC 2.1.1 (Keyboard): a row that navigates on click must be operable by keyboard alone
 * — focusable (tabIndex), announced as an actionable control (role=button), and activated by
 * Enter/Space. `Table` fixed this and documented the standard; ListView reproduced the original
 * mouse-only shape across four navigable variants, including the card tile behind the Marketplace
 * grid.
 *
 * The second half matters as much as the first: a row with NO destination must stay inert, or
 * keyboard users collect tab stops that do nothing.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { App } from 'antd'
import type * as ReactRouter from 'react-router'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('matchMedia', (query: string) => ({
  addEventListener: vi.fn(),
  addListener: vi.fn(),
  dispatchEvent: vi.fn(() => false),
  matches: false,
  media: query,
  onchange: null,
  removeEventListener: vi.fn(),
  removeListener: vi.fn(),
}))

const navigateSpy = vi.fn()
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useNavigate: () => navigateSpy,
}))

vi.mock('../../hooks/useHandleActions', () => ({
  useHandleAction: () => ({ handleAction: vi.fn(), isActionLoading: false }),
}))

import { ListView } from './ListView'

const renderList = (navigateTo?: string) => render(
  <MemoryRouter>
    <App>
      <ListView
        itemTemplate={{ primaryText: '{name}', ...(navigateTo ? { navigateTo } : {}) }}
        items={[{ name: 'Row one' }]}
        rowKey='a11y-test'
      />
    </App>
  </MemoryRouter>,
)

const firstRow = (container: HTMLElement) => container.querySelector('.ant-list-item')

describe('ListView — clickable rows are keyboard-operable', () => {
  afterEach(() => {
    cleanup()
    navigateSpy.mockClear()
  })

  it('a navigating row is focusable and announced as a control', () => {
    const { container } = renderList('/compositions/ns/name')
    const row = firstRow(container)

    expect(row?.getAttribute('role')).toBe('button')
    expect(row?.getAttribute('tabindex')).toBe('0')
  })

  it('Enter activates the row', () => {
    const { container } = renderList('/compositions/ns/name')
    fireEvent.keyDown(firstRow(container)!, { key: 'Enter' })

    expect(navigateSpy).toHaveBeenCalledWith('/compositions/ns/name')
  })

  it('Space activates the row', () => {
    const { container } = renderList('/compositions/ns/name')
    fireEvent.keyDown(firstRow(container)!, { key: ' ' })

    expect(navigateSpy).toHaveBeenCalledWith('/compositions/ns/name')
  })

  it('an unrelated key does not activate it', () => {
    const { container } = renderList('/compositions/ns/name')
    fireEvent.keyDown(firstRow(container)!, { key: 'a' })

    expect(navigateSpy).not.toHaveBeenCalled()
  })

  it('a row with NO destination stays inert — no role, no tab stop', () => {
    // Without this, every non-navigating row becomes a focus target that does nothing, which is
    // its own accessibility defect rather than a fix.
    const { container } = renderList()
    const row = firstRow(container)

    expect(row?.getAttribute('role')).toBeNull()
    expect(row?.getAttribute('tabindex')).toBeNull()
  })
})
