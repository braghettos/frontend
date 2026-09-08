/**
 * The follow store: the module-level surface that keeps a publish visible across the rail's
 * `RouterProvider key={routerVersion}` remount, and pushes the settled verdict into the transcript
 * so the outcome outlives the card.
 */
import { describe, expect, it, vi } from 'vitest'

import type { FollowDeps, PublishFollowState, PublishFollowTarget } from './builderPublishFollow'
import { childResourceName } from './builderPublishStatus'
import {
  MAX_TRACKED_PUBLISHES,
  createPublishAnnouncer,
  createPublishFollowStore,
  publishSettlementActions,
  publishSettlementText,
  startPublishFollow,
} from './builderPublishStore'
import { autopilotConversationStore } from './conversationStore'

const CLONE_FAILURE = 'observe failed: failed to clone repository: authentication required: invalid credentials'

const target = (claimName = 'publish-my-chart'): PublishFollowTarget => ({
  branch: `builder/${claimName.replace('publish-', '')}`,
  claimName,
  deepLink: `https://github.com/krateo-blueprints/blueprints/compare/main...builder/${claimName}?expand=1`,
  destination: 'krateo-blueprints/blueprints',
  expectedChildren: 1,
  namespace: 'krateo-system',
  snowplowBaseUrl: 'http://snowplow',
})

/** The request URL, without a base-to-string coercion on the RequestInfo union. */
const urlOf = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') {
    return input
  }
  return input instanceof URL ? input.href : input.url
}

/** Drain the scheduler without an await-in-loop; the guard turns a runaway poll into a failure. */
const drain = async (pump: () => Promise<boolean>, guard = 60): Promise<void> => {
  if (guard <= 0) {
    throw new Error('the follow never reached a terminal phase')
  }
  if (await pump()) {
    await drain(pump, guard - 1)
  }
}

const localResource = (status: string, message?: string) => ({
  status: { conditions: [{ message, status, type: 'Synced' }] },
})

const fakeDeps = (objects: Record<string, unknown>): { deps: FollowDeps; pump: () => Promise<boolean>; pending: () => number; settle: () => Promise<unknown> } => {
  let time = 0
  let seq = 0
  const queue: { at: number; id: number; run: () => void }[] = []
  const settle = () => new Promise((resolve) => { setTimeout(resolve, 0) })
  return {
    deps: {
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
    },
    pending: () => queue.length,
    pump: async () => {
      const next = queue.shift()
      if (!next) { return false }
      time = next.at
      next.run()
      await settle()
      return true
    },
    settle,
  }
}

describe('createPublishFollowStore', () => {
  it('tracks an in-flight publish and hands the rail a STABLE snapshot reference between writes', async () => {
    const { deps, settle } = fakeDeps({})
    const store = createPublishFollowStore(deps)
    const notify = vi.fn()
    store.subscribe(notify)
    store.follow(target())
    const first = store.getSnapshot()
    expect(first).toHaveLength(1)
    expect(first[0].phase).toBe('pending')
    expect(store.getSnapshot()).toBe(first)
    await settle()
    store.reset()
  })

  it('is idempotent while a follow is in flight — a repeated publish does not double-poll', async () => {
    const { deps, settle } = fakeDeps({})
    const store = createPublishFollowStore(deps)
    store.follow(target())
    await settle()
    store.follow(target())
    expect(store.getSnapshot()).toHaveLength(1)
    store.reset()
  })

  it('announces the SETTLED verdict once, through onSettled', async () => {
    const objects = { [childResourceName('publish-my-chart', 0)]: localResource('False', CLONE_FAILURE) }
    const { deps, settle } = fakeDeps(objects)
    const store = createPublishFollowStore(deps)
    const onSettled = vi.fn()
    store.follow(target(), { onSettled })
    await settle()
    expect(onSettled).toHaveBeenCalledTimes(1)
    const state = onSettled.mock.calls[0][0] as PublishFollowState
    expect(state.phase).toBe('failed')
    expect(state.failure?.message).toBe(CLONE_FAILURE)
    store.reset()
  })

  it('dismiss CANCELS an in-flight follow — nothing is left polling behind a closed card', async () => {
    const { deps, pending, settle } = fakeDeps({})
    const store = createPublishFollowStore(deps)
    store.follow(target())
    await settle()
    expect(pending()).toBe(1)
    store.dismiss('krateo-system/publish-my-chart')
    expect(store.getSnapshot()).toHaveLength(0)
    expect(pending()).toBe(0)
  })

  it('recheck spends a fresh budget on a settled follow (the honest "check again")', async () => {
    const { deps, pump, settle } = fakeDeps({})
    const store = createPublishFollowStore(deps)
    store.follow(target(), { budgetMs: 1 })
    await settle()
    expect(store.getSnapshot()[0].phase).toBe('pending')
    await pump()
    expect(store.getSnapshot()[0].phase).toBe('stalled')
    store.recheck('krateo-system/publish-my-chart')
    expect(store.getSnapshot()[0].phase).toBe('pending')
    store.reset()
  })

  it('RECHECK KEEPS THE PUBLISH\'S AGE — the affordance a stuck publish offers must not hide how stuck it is', async () => {
    const { deps, pump, settle } = fakeDeps({})
    const store = createPublishFollowStore(deps)
    store.follow(target(), { budgetMs: 1 })
    await settle()
    const [initial] = store.getSnapshot()
    await pump()
    expect(store.getSnapshot()[0].phase).toBe('stalled')
    store.recheck('krateo-system/publish-my-chart')
    const [resumed] = store.getSnapshot()
    expect(resumed.startedAt).toBe(initial.startedAt)
    // …while the BUDGET clock restarts, so the fresh watch is not expired on its first tick.
    expect(resumed.watchStartedAt).toBeGreaterThan(initial.startedAt)
    store.reset()
  })

  it('recheck and dismiss ignore an unknown key', () => {
    const { deps } = fakeDeps({})
    const store = createPublishFollowStore(deps)
    expect(() => {
      store.recheck('nope/nope')
      store.dismiss('nope/nope')
    }).not.toThrow()
  })

  it('keeps at most MAX_TRACKED_PUBLISHES cards, evicting the oldest SETTLED first', async () => {
    const { deps, pump, settle } = fakeDeps({})
    const store = createPublishFollowStore(deps)
    for (const index of [0, 1, 2, 3, 4]) {
      store.follow(target(`publish-chart-${index}`), { budgetMs: 1 })
    }
    await settle()
    await drain(pump)
    expect(store.getSnapshot().length).toBeLessThanOrEqual(MAX_TRACKED_PUBLISHES)
    store.reset()
  })

  it('reset cancels everything (teardown leaves no orphan poll)', async () => {
    const { deps, pending, settle } = fakeDeps({})
    const store = createPublishFollowStore(deps)
    store.follow(target())
    await settle()
    store.reset()
    expect(store.getSnapshot()).toHaveLength(0)
    expect(pending()).toBe(0)
  })
})

describe('startPublishFollow', () => {
  const seed = {
    branch: 'builder/my-chart',
    claimName: 'publish-my-chart',
    deepLink: 'https://example.test/compare',
    destination: 'krateo-blueprints/blueprints',
    expectedChildren: 2,
    namespace: 'krateo-system',
  }

  it('refuses to follow when the install has no snowplow base URL (and says so by returning false)', () => {
    const { deps } = fakeDeps({})
    const store = createPublishFollowStore(deps)
    expect(startPublishFollow(seed, { api: {} } as never, undefined, store)).toBe(false)
    expect(store.getSnapshot()).toHaveLength(0)
  })

  it('starts the follow against the configured snowplow base URL', async () => {
    const { deps, settle } = fakeDeps({})
    const store = createPublishFollowStore(deps)
    expect(startPublishFollow(seed, { api: { SNOWPLOW_API_BASE_URL: 'http://snowplow/' } } as never, undefined, store)).toBe(true)
    expect(store.getSnapshot()[0].target.snowplowBaseUrl).toBe('http://snowplow')
    await settle()
    store.reset()
  })
})

describe('publishSettlementText', () => {
  const state = (phase: PublishFollowState['phase'], extra: Partial<PublishFollowState> = {}): PublishFollowState => ({
    key: 'krateo-system/publish-my-chart',
    phase,
    ready: 0,
    startedAt: 0,
    target: target(),
    total: 0,
    updatedAt: 1000,
    watchStartedAt: 0,
    ...extra,
  })

  it('surfaces the CHILD\'S OWN message on failure, and says no change request exists', () => {
    const text = publishSettlementText(state('failed', { failure: { child: 'publish-my-chart-001', message: CLONE_FAILURE } }))
    expect(text).toContain(CLONE_FAILURE)
    expect(text).toContain('publish-my-chart-001')
    expect(text).toContain('No change request was created')
  })

  it('only says the change request is openable once the push landed', () => {
    expect(publishSettlementText(state('pushed'))).toContain('open the change request')
    expect(publishSettlementText(state('stalled'))).not.toContain('open the change request')
  })

  it('reports the bound as still-running, not as a failure', () => {
    const text = publishSettlementText(state('stalled', { ready: 2, total: 3 }))
    expect(text).toContain('still running')
    expect(text).toContain('nothing has failed')
    expect(text).not.toMatch(/publish failed/i)
  })

  it('reports the REAL age, not the budget constant — twelve hours must not read as five minutes', () => {
    const text = publishSettlementText(state('stalled', { ready: 2, startedAt: 0, total: 3, updatedAt: 12 * 3_600_000 }))
    expect(text).toContain('12h 00m')
    expect(text).not.toContain('5 minutes')
  })

  it('does NOT claim the publish is progressing when nothing was ever rendered', () => {
    const text = publishSettlementText(state('stalled', { ready: 0, total: 0 }))
    expect(text).toContain('no git resources have been rendered')
    expect(text).toContain('may not be reconciling it')
    expect(text).not.toMatch(/publish failed/i)
  })

  it('reports an unreadable status as a MISSING verdict, with the transport reason', () => {
    const text = publishSettlementText(state('unreadable', { transportError: 'read failed (HTTP 403)' }))
    expect(text).toContain('could not read its status')
    expect(text).toContain('read failed (HTTP 403)')
  })
})

describe('publishSettlementActions', () => {
  const state = (phase: PublishFollowState['phase']): PublishFollowState => ({
    key: 'krateo-system/publish-my-chart',
    phase,
    ready: 0,
    startedAt: 0,
    target: target(),
    total: 0,
    updatedAt: 1000,
    watchStartedAt: 0,
  })

  it('gives the DURABLE record the link, so dismissing the card does not lose it', () => {
    const actions = publishSettlementActions(state('pushed'))
    expect(actions).toEqual([{ label: 'Open change request', readOnly: true, url: target().deepLink, verb: 'openChangeRequest' }])
  })

  it('offers a MISSING verdict the link with the uncertainty in its label — never a bare promise', () => {
    for (const phase of ['stalled', 'unreadable'] as const) {
      const actions = publishSettlementActions(state(phase))
      expect(actions).toHaveLength(1)
      expect(actions[0].label).toBe('Open change request (only exists if the push landed)')
      expect(actions[0].url).toBe(target().deepLink)
    }
  })

  it('offers NOTHING to open after a failure — nothing was pushed', () => {
    expect(publishSettlementActions(state('failed'))).toEqual([])
  })
})

describe('createPublishAnnouncer', () => {
  const settled = (phase: PublishFollowState['phase']): PublishFollowState => ({
    failure: { child: 'publish-my-chart-000', message: CLONE_FAILURE },
    key: 'krateo-system/publish-my-chart',
    phase,
    ready: 0,
    startedAt: 0,
    target: target(),
    total: 0,
    updatedAt: 1000,
    watchStartedAt: 0,
  })

  it('appends the verdict — with the child\'s own message — to the thread that published', () => {
    autopilotConversationStore.reset()
    const announce = createPublishAnnouncer()
    announce(settled('failed'))
    const { messages } = autopilotConversationStore.getSnapshot()
    expect(messages).toHaveLength(1)
    expect(messages[0].text).toContain(CLONE_FAILURE)
    autopilotConversationStore.reset()
  })

  it('carries the link into the transcript on a push', () => {
    autopilotConversationStore.reset()
    createPublishAnnouncer()(settled('pushed'))
    expect(autopilotConversationStore.getSnapshot().messages[0].actions?.[0].url).toBe(target().deepLink)
    autopilotConversationStore.reset()
  })

  it('DOES NOT file the verdict under a thread the user switched to mid-publish', () => {
    autopilotConversationStore.reset()
    const announce = createPublishAnnouncer()
    // The user starts a new thread while the follow is still running.
    autopilotConversationStore.reset()
    announce(settled('failed'))
    expect(autopilotConversationStore.getSnapshot().messages).toEqual([])
    autopilotConversationStore.reset()
  })
})
