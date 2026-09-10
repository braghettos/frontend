// @vitest-environment jsdom
/**
 * THE PUBLISH GATE MUST PAINT ABOVE THE PREVIEW DRAWER.
 *
 * Regression guard for the bug a tester photographed: the destination form opened BEHIND
 * the Autopilot preview drawer, clipped to a sliver with "Confirm destination" somewhere
 * unreachable, so a publish started from the preview could not be completed at all.
 *
 * Why it happened, and why an equality test is the right guard: in antd 6 both surfaces
 * default to `token.zIndexPopupBase` (1000). The drawer pins itself there EXPLICITLY, so a
 * modal left at the default merely TIES with it — and a tie is broken by DOM order, which
 * the always-mounted drawer wins. Nothing about that is visible in either file alone, so
 * this test asserts the RELATIONSHIP between the two constants rather than a magic number.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { PREVIEW_DRAWER_Z_INDEX } from './previewSurface'
import PublishTargetFormHost, { requestPublishTarget, resetPublishTargetForTests } from './publishTargetForm'

// antd's responsive observer needs matchMedia, and its Modal needs ResizeObserver; jsdom
// ships neither. Same stub the preview-drawer suite installs.
beforeAll(() => {
  const noop = () => undefined
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => ({
      addEventListener: noop,
      addListener: noop,
      dispatchEvent: () => false,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: noop,
      removeListener: noop,
    }),
    writable: true,
  })
  globalThis.ResizeObserver = class {
    disconnect = noop
    observe = noop
    unobserve = noop
  }
})

afterEach(() => {
  resetPublishTargetForTests()
})

describe('the publish-destination gate stacks above the preview drawer', () => {
  it('opens above the drawer instead of tying with it', async () => {
    render(<PublishTargetFormHost />)
    // The request is a promise the HOST resolves when the human answers, so it must not be
    // awaited here — awaiting it would hang until the modal that this test is checking for
    // is dismissed. Scheduling it inside act() flushes the state update that opens it.
    let settled = false
    await act(() => {
      void requestPublishTarget({ base: 'main', kind: 'page', owner: 'krateo-platformops', repo: 'krateo-oas' })
        .then(() => { settled = true })
      return Promise.resolve()
    })
    // Guard the guard: if no host had registered, the request would resolve its prefills
    // immediately and the assertions below would be vacuous.
    expect(settled).toBe(false)

    await waitFor(() => expect(screen.getByTestId('publish-target-form')).toBeTruthy())

    const wrap = document.querySelector<HTMLElement>('.ant-modal-wrap')
    expect(wrap).toBeTruthy()
    const declared = wrap?.style.zIndex ?? ''

    // An UNSET z-index is the bug itself, not a zero: antd then falls back to
    // `zIndexPopupBase`, which is the 1000 the drawer already occupies.
    expect(declared, 'the modal must declare a z-index; unset inherits 1000 and ties with the drawer').not.toBe('')
    // STRICTLY above, not merely equal — equal is what put the buttons out of reach.
    expect(Number(declared)).toBeGreaterThan(PREVIEW_DRAWER_Z_INDEX)
  })
})
