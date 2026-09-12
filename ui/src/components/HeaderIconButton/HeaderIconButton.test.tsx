// @vitest-environment jsdom
/**
 * The shared header chrome control.
 *
 * #80 §0.7 asked for it by name. What made it worth building even after the two controls had
 * converged on 36×36 is that they agreed by COINCIDENCE — one set the size inline in its TSX, the
 * other in a CSS module, and nothing kept the two numbers equal. These tests pin the contract that
 * replaced that: one class, one accessible name, one optional tooltip.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import HeaderIconButton from './HeaderIconButton'

const ICON = ['fas', 'bell'] as never

describe('HeaderIconButton', () => {
  afterEach(() => { cleanup() })

  it('is icon-only but never nameless — aria-label is required by the type and applied', () => {
    render(<HeaderIconButton ariaLabel='Notifications' icon={ICON} onClick={vi.fn()} />)

    // The whole reason the bell was a defect: icon-only with nothing for a screen reader.
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy()
  })

  it('fires its handler on click', () => {
    const onClick = vi.fn()
    render(<HeaderIconButton ariaLabel='Notifications' icon={ICON} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is keyboard-operable, because it is a real button', () => {
    // Not asserting a custom keydown handler — asserting that we did NOT hand-roll a div, which is
    // what made the account menu unreachable elsewhere in the header.
    render(<HeaderIconButton ariaLabel='Notifications' icon={ICON} onClick={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Notifications' })

    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('disabled')).toBeNull()
  })

  it('carries the shared geometry class rather than inline sizing', () => {
    // The point of the component: size comes from one CSS class fed by `layout.headerIconSize`,
    // not from numbers repeated at each call site.
    render(<HeaderIconButton ariaLabel='Notifications' icon={ICON} onClick={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Notifications' })

    expect(button.className).toMatch(/headerIcon/)
    expect(button.getAttribute('style')).toBeNull()
  })

  it('renders without a tooltip when none is given', () => {
    render(<HeaderIconButton ariaLabel='Notifications' icon={ICON} onClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy()
  })
})
