// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import WidgetErrorBoundary from './WidgetErrorBoundary'

/**
 * The app shipped with NO error boundary anywhere — zero `componentDidCatch` /
 * `getDerivedStateFromError` in the tree — on React 19, whose default for an uncaught render
 * error is to unmount the whole tree. A widget handed malformed `widgetDataTemplate` output
 * (which `--dry-run=server` never validates) therefore blanked the PAGE rather than failing in
 * place. These tests pin the two properties that fix depends on: it catches, and it stays scoped.
 */

const Boom = ({ message }: { message: string }): React.ReactElement => {
  throw new Error(message)
}

describe('WidgetErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught render errors to console.error; silence it so the suite output stays
    // readable, but keep the spy so a test can assert we logged.
    vi.spyOn(console, 'error').mockImplementation(() => { /* silenced */ })
  })
  // No global auto-cleanup in this suite, so unmount between tests — otherwise the
  // accumulated DOM makes every getByTestId('widget-error') ambiguous.
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('catches a render throw and shows the widget error card instead of unmounting', () => {
    render(
      <WidgetErrorBoundary>
        <Boom message='legend expected an array, received a string' />
      </WidgetErrorBoundary>,
    )

    expect(screen.getByTestId('widget-error')).toBeTruthy()
    // The thrown message reaches the reader — a blank page says nothing at all.
    expect(screen.getByText(/legend expected an array/)).toBeTruthy()
  })

  it('contains the failure — siblings outside the boundary still render', () => {
    render(
      <div>
        <WidgetErrorBoundary>
          <Boom message='bad shape' />
        </WidgetErrorBoundary>
        <p>sibling widget</p>
      </div>,
    )

    expect(screen.getByTestId('widget-error')).toBeTruthy()
    // This is the property that keeps "3 failing widgets among 10" showing the other 7.
    expect(screen.getByText('sibling widget')).toBeTruthy()
  })

  it('renders children untouched when nothing throws', () => {
    render(
      <WidgetErrorBoundary>
        <p>healthy widget</p>
      </WidgetErrorBoundary>,
    )

    expect(screen.getByText('healthy widget')).toBeTruthy()
    expect(screen.queryByTestId('widget-error')).toBeNull()
  })

  it('un-latches when resetKey changes, so a refetch that fixes the data recovers', () => {
    // Without this, a transiently-bad payload would leave the widget stuck on its first bad
    // render forever, even after a refetch delivered something valid.
    const Harness = () => {
      const [tick, setTick] = useState(0)
      return (
        <div>
          <button onClick={() => { setTick(1) }} type='button'>refetch</button>
          <WidgetErrorBoundary resetKey={tick}>
            {tick === 0 ? <Boom message='transient bad shape' /> : <p>recovered</p>}
          </WidgetErrorBoundary>
        </div>
      )
    }
    const { getByText, queryByTestId } = render(<Harness />)

    expect(queryByTestId('widget-error')).toBeTruthy()
    // fireEvent, not a raw DOM .click() — the latter bypasses React's act() batching so the
    // state update never flushes before the assertion.
    fireEvent.click(getByText('refetch'))
    expect(getByText('recovered')).toBeTruthy()
    expect(queryByTestId('widget-error')).toBeNull()
  })

  it('logs the component stack so the offending widget is identifiable', () => {
    render(
      <WidgetErrorBoundary widgetId='Card alerts-summary'>
        <Boom message='bad shape' />
      </WidgetErrorBoundary>,
    )

    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls
    expect(logged.some((args) => String(args[0]).includes('Card alerts-summary'))).toBe(true)
  })
})
