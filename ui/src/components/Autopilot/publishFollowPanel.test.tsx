// @vitest-environment jsdom
/**
 * The rail's publish card. The assertions here are the customer report, restated as UI:
 *   - while the push is in flight the card says so AND SHOWS NO CHANGE-REQUEST LINK;
 *   - a failing child's own sentence is on screen, verbatim, not a generic "publish failed";
 *   - the link appears exactly once the push has actually landed;
 *   - the poll bound reads as "still running", never as a failure;
 *   - unmounting mid-poll (the routerVersion remount / navigating away) leaves no stuck spinner
 *     and no lying success — the follow keeps going in the module store and a remount shows the truth.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { FollowDeps, PublishFollowTarget } from './builderPublishFollow'
import { childResourceName } from './builderPublishStatus'
import { autopilotPublishStore } from './builderPublishStore'
import PublishFollowPanel, { formatElapsed } from './PublishFollowPanel'

const CLONE_FAILURE = 'observe failed: failed to clone repository: authentication required: invalid credentials'

const TARGET: PublishFollowTarget = {
  branch: 'builder/my-chart',
  claimName: 'publish-my-chart',
  deepLink: 'https://github.com/krateo-blueprints/blueprints/compare/main...builder/my-chart?expand=1',
  destination: 'krateo-blueprints/blueprints',
  expectedChildren: 2,
  namespace: 'krateo-system',
  snowplowBaseUrl: 'http://snowplow',
}

/** The request URL, without a base-to-string coercion on the RequestInfo union. */
const urlOf = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') {
    return input
  }
  return input instanceof URL ? input.href : input.url
}

const localResource = (status: string, message?: string) => ({ status: { conditions: [{ message, status, type: 'Synced' }] } })

const kids = (count: number, status: string, message?: string) => Object.fromEntries(
  Array.from({ length: count }, (_unused, index) => [childResourceName(TARGET.claimName, index), localResource(status, message)]),
)

const fakeDeps = (objects: Record<string, unknown>) => {
  let time = 0
  let seq = 0
  const queue: { at: number; id: number; run: () => void }[] = []
  const deps: FollowDeps = {
    authHeaders: () => ({}),
    fetch: (input: RequestInfo | URL) => {
      const name = new URL(urlOf(input)).searchParams.get('name') ?? ''
      return Promise.resolve(name in objects
        ? { json: () => Promise.resolve(objects[name]), ok: true, status: 200 } as Response
        : { ok: false, status: 404 } as Response)
    },
    now: () => time,
    schedule: (ms, run) => {
      seq += 1
      const id = seq
      queue.push({ at: time + ms, id, run })
      return () => {
        const index = queue.findIndex((entry) => entry.id === id)
        if (index >= 0) { queue.splice(index, 1) }
      }
    },
  }
  const tick = () => new Promise((resolve) => { setTimeout(resolve, 0) })
  const settle = async () => {
    await act(tick)
  }
  return {
    deps,
    pending: () => queue.length,
    pump: async () => {
      const next = queue.shift()
      if (!next) { return false }
      time = next.at
      await act(async () => {
        next.run()
        await new Promise((resolve) => { setTimeout(resolve, 0) })
      })
      return true
    },
    settle,
  }
}

beforeAll(() => {
  const noop = () => undefined
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => ({ addEventListener: noop, addListener: noop, dispatchEvent: () => false, matches: false, media: query, onchange: null, removeEventListener: noop, removeListener: noop }),
    writable: true,
  })
})

afterEach(() => {
  cleanup()
  autopilotPublishStore.reset()
})

describe('formatElapsed', () => {
  it('distinguishes ninety seconds from twelve hours', () => {
    expect(formatElapsed(8_000)).toBe('8s')
    expect(formatElapsed(90_000)).toBe('1m 30s')
    expect(formatElapsed(12 * 3_600_000)).toBe('12h 00m')
  })
})

describe('PublishFollowPanel', () => {
  it('shows no card when no publish is being followed (the live region is mounted, and empty)', () => {
    const view = render(<PublishFollowPanel />)
    expect(view.queryByTestId('autopilot-publish-card')).toBeNull()
    // The region itself IS present, so the first card that arrives is announced rather than
    // appearing together with the region and going unread.
    expect(view.getByTestId('autopilot-publish-panel').children).toHaveLength(0)
  })

  it('IN FLIGHT: says it is publishing, shows the destination + branch, and offers NO link yet', async () => {
    const clock = fakeDeps({})
    const view = render(<PublishFollowPanel />)
    autopilotPublishStore.follow(TARGET, { deps: clock.deps })
    await clock.settle()
    const card = view.getByTestId('autopilot-publish-card')
    expect(card.getAttribute('data-phase')).toBe('pending')
    expect(card.textContent).toContain('Publishing')
    expect(card.textContent).toContain('krateo-blueprints/blueprints')
    expect(card.textContent).toContain('builder/my-chart')
    expect(view.queryByText('Open change request')).toBeNull()
  })

  it('FAILED: surfaces the CHILD\'S OWN message verbatim, names the child, and still offers no link', async () => {
    const clock = fakeDeps({ ...kids(2, 'True'), [childResourceName(TARGET.claimName, 1)]: localResource('False', CLONE_FAILURE) })
    const view = render(<PublishFollowPanel />)
    autopilotPublishStore.follow(TARGET, { deps: clock.deps })
    await clock.settle()
    const card = view.getByTestId('autopilot-publish-card')
    expect(card.getAttribute('data-phase')).toBe('failed')
    expect(card.textContent).toContain('Publish failed')
    expect(view.getByText(CLONE_FAILURE)).toBeTruthy()
    expect(card.textContent).toContain('publish-my-chart-001')
    expect(card.textContent).toContain('no change request was created')
    expect(view.queryByText('Open change request')).toBeNull()
  })

  it('PUSHED: the change-request link appears only now, pointing at the real compare URL', async () => {
    const clock = fakeDeps(kids(2, 'True'))
    const view = render(<PublishFollowPanel />)
    autopilotPublishStore.follow(TARGET, { deps: clock.deps })
    await clock.settle()
    // One sweep is not enough — the count has to settle first (no lying success mid-render).
    expect(view.queryByText('Open change request')).toBeNull()
    await clock.pump()
    expect(view.getByTestId('autopilot-publish-card').getAttribute('data-phase')).toBe('pushed')
    const link = view.getByText('Open change request') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe(TARGET.deepLink)
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('THE BOUND: reads as "still running" with a Check again — not as a failure', async () => {
    const clock = fakeDeps(kids(2, 'Unknown'))
    const view = render(<PublishFollowPanel />)
    autopilotPublishStore.follow(TARGET, { budgetMs: 1, deps: clock.deps })
    await clock.settle()
    await clock.pump()
    const card = view.getByTestId('autopilot-publish-card')
    expect(card.getAttribute('data-phase')).toBe('stalled')
    expect(card.textContent).toContain('Still running')
    expect(card.textContent).toContain('nothing has failed')
    expect(card.textContent).not.toContain('Publish failed')
    // The link IS offered here — but never as a change request that exists.
    expect(view.queryByText('Open change request')).toBeNull()
    const hedged = view.getByText('Open change request (only exists if the push landed)') as HTMLAnchorElement
    expect(hedged.getAttribute('href')).toBe(TARGET.deepLink)
    // Check again resumes the watch rather than leaving the user with a dead card.
    fireEvent.click(view.getByText('Check again'))
    expect(view.getByTestId('autopilot-publish-card').getAttribute('data-phase')).toBe('pending')
  })

  it('A STALL WITH NOTHING RENDERED says so, instead of claiming a publish is progressing', async () => {
    const clock = fakeDeps({})
    const view = render(<PublishFollowPanel />)
    autopilotPublishStore.follow(TARGET, { budgetMs: 1, deps: clock.deps })
    await clock.settle()
    await clock.pump()
    const card = view.getByTestId('autopilot-publish-card')
    expect(card.getAttribute('data-phase')).toBe('stalled')
    expect(card.textContent).toContain('No git resources have been rendered')
    expect(card.textContent).not.toContain('keeps going on the cluster')
    expect(card.textContent).not.toContain('Publish failed')
  })

  it('KEEPS THE AGE ON SCREEN after Check again — the card must not restart at 0s', async () => {
    const clock = fakeDeps({})
    const view = render(<PublishFollowPanel />)
    autopilotPublishStore.follow(TARGET, { budgetMs: 1, deps: clock.deps })
    await clock.settle()
    await clock.pump()
    expect(view.getByTestId('autopilot-publish-card').getAttribute('data-phase')).toBe('stalled')
    const before = autopilotPublishStore.getSnapshot()[0].startedAt
    fireEvent.click(view.getByText('Check again'))
    expect(autopilotPublishStore.getSnapshot()[0].startedAt).toBe(before)
  })

  it('UNMOUNTED MID-POLL: no stuck spinner, no lying success — the remount shows the real outcome', async () => {
    const clock = fakeDeps({ ...kids(2, 'True'), [childResourceName(TARGET.claimName, 1)]: localResource('False', CLONE_FAILURE) })
    const first = render(<PublishFollowPanel />)
    act(() => { autopilotPublishStore.follow(TARGET, { deps: clock.deps }) })
    expect(first.getByTestId('autopilot-publish-card').getAttribute('data-phase')).toBe('pending')

    // The routerVersion remount: the rail (and this panel) is torn down mid-poll.
    first.unmount()
    await clock.settle()

    // The follow survived in the module store and reached the TRUTH while nothing was mounted.
    expect(autopilotPublishStore.getSnapshot()[0].phase).toBe('failed')
    const second = render(<PublishFollowPanel />)
    const card = second.getByTestId('autopilot-publish-card')
    expect(card.getAttribute('data-phase')).toBe('failed')
    expect(second.getByText(CLONE_FAILURE)).toBeTruthy()
    expect(second.queryByText('Open change request')).toBeNull()
  })

  it('dismissing a settled card removes it and leaves nothing scheduled', async () => {
    const clock = fakeDeps({ [childResourceName(TARGET.claimName, 0)]: localResource('False', 'nope') })
    const view = render(<PublishFollowPanel />)
    autopilotPublishStore.follow(TARGET, { deps: clock.deps })
    await clock.settle()
    fireEvent.click(view.getByLabelText('Dismiss this publish'))
    expect(view.queryByTestId('autopilot-publish-card')).toBeNull()
    expect(clock.pending()).toBe(0)
  })
})
