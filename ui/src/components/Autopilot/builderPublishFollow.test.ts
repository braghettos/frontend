/**
 * The polling engine, driven on a fake clock with a fake scheduler and a fake fetch — no timers, no
 * cluster. Every scenario in the customer report is here: the push that lands, the push that fails
 * with the children's own message, the one still in flight, the one that outlives its budget, and
 * the one the user walks away from mid-poll.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  CHILD_PROBE_SLACK,
  FOLLOW_BUDGET_MS,
  MAX_CHILD_PROBE_SLACK,
  followConfig,
  followKey,
  followPublish,
  maxProbeWindow,
  sweepPublishChildren,
  type FollowDeps,
  type PublishFollowState,
  type PublishFollowTarget,
} from './builderPublishFollow'
import { childResourceName } from './builderPublishStatus'

const CLONE_FAILURE = 'observe failed: failed to clone repository: authentication required: invalid credentials'

const TARGET: PublishFollowTarget = {
  branch: 'builder/my-chart',
  claimName: 'publish-my-chart',
  deepLink: 'https://github.com/krateo-blueprints/blueprints/compare/main...builder/my-chart?expand=1',
  destination: 'krateo-blueprints/blueprints',
  expectedChildren: 3,
  namespace: 'krateo-system',
  snowplowBaseUrl: 'http://snowplow',
}

/** A LocalResource with one `Synced` condition. */
const localResource = (status: string, message?: string) => ({
  apiVersion: 'git.krateo.io/v1alpha1',
  kind: 'LocalResource',
  status: { conditions: [{ message, reason: 'ReconcileError', status, type: 'Synced' }] },
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

/** A fake snowplow: a name→object map. Anything absent 404s (= "not rendered yet"). */
const fakeFetch = (objects: Record<string, unknown>, override?: (name: string) => Response | null) =>
  vi.fn((input: RequestInfo | URL) => {
    const name = new URL(urlOf(input)).searchParams.get('name') ?? ''
    const forced = override?.(name)
    if (forced) {
      return Promise.resolve(forced)
    }
    if (!(name in objects)) {
      return Promise.resolve({ ok: false, status: 404 } as Response)
    }
    return Promise.resolve({ json: () => Promise.resolve(objects[name]), ok: true, status: 200 } as Response)
  })

/** A hand-cranked clock + scheduler: `pump()` runs the next scheduled sweep and advances time to it. */
const fakeClock = (fetchImpl: ReturnType<typeof fakeFetch>) => {
  let time = 1_000_000
  let seq = 0
  const queue: { at: number; id: number; run: () => void }[] = []
  const deps: FollowDeps = {
    authHeaders: () => ({}),
    fetch: fetchImpl,
    now: () => time,
    schedule: (ms, run) => {
      seq += 1
      const id = seq
      queue.push({ at: time + ms, id, run })
      return () => {
        const index = queue.findIndex((entry) => entry.id === id)
        if (index >= 0) {
          queue.splice(index, 1)
        }
      }
    },
  }
  const settle = () => new Promise((resolve) => { setTimeout(resolve, 0) })
  return {
    deps,
    pending: () => queue.length,
    pump: async () => {
      const next = queue.shift()
      if (!next) {
        return false
      }
      time = next.at
      next.run()
      await settle()
      return true
    },
    settle,
  }
}

/** Names of the children a claim of `n` files should have. */
const children = (count: number, status: string, message?: string) => Object.fromEntries(
  Array.from({ length: count }, (_unused, index) => [childResourceName(TARGET.claimName, index), localResource(status, message)]),
)

describe('followConfig', () => {
  it('trims the snowplow base URL and refuses to follow without one', () => {
    expect(followConfig({ api: { SNOWPLOW_API_BASE_URL: 'http://snowplow//' } } as never)).toEqual({ snowplowBaseUrl: 'http://snowplow' })
    expect(followConfig({ api: {} } as never)).toBeNull()
    expect(followConfig(undefined)).toBeNull()
  })
})

describe('sweepPublishChildren', () => {
  it('reads through snowplow /call with the SAME query shape applyResourceSet writes through', async () => {
    const fetchImpl = fakeFetch(children(1, 'True'))
    const { deps } = fakeClock(fetchImpl)
    await sweepPublishChildren(TARGET, deps)
    const url = new URL(urlOf(fetchImpl.mock.calls[0][0]))
    expect(url.pathname).toBe('/call')
    expect(url.searchParams.get('apiVersion')).toBe('git.krateo.io/v1alpha1')
    expect(url.searchParams.get('resource')).toBe('localresources')
    expect(url.searchParams.get('namespace')).toBe('krateo-system')
    expect(url.searchParams.get('name')).toBe('publish-my-chart-000')
  })

  it('probes past the expected count (so an extra rendered object is seen) and stops at the first 404', async () => {
    const fetchImpl = fakeFetch(children(4, 'True'))
    const { deps } = fakeClock(fetchImpl)
    const sweep = await sweepPublishChildren(TARGET, deps)
    expect(fetchImpl).toHaveBeenCalledTimes(TARGET.expectedChildren + CHILD_PROBE_SLACK)
    expect(sweep.children).toHaveLength(4)
    expect(sweep.transportError).toBeUndefined()
  })

  it('records a non-404 read failure instead of pretending the child is absent', async () => {
    const fetchImpl = fakeFetch({}, (name) => (name.endsWith('-000') ? { ok: false, status: 403 } as Response : null))
    const { deps } = fakeClock(fetchImpl)
    const sweep = await sweepPublishChildren(TARGET, deps)
    expect(sweep.children).toHaveLength(0)
    expect(sweep.transportError).toBe('read failed (HTTP 403)')
  })

  it('A BLIP ON -000 DOES NOT BURY -001: the failure it already read is still reported', async () => {
    const objects = { ...children(3, 'True'), 'publish-my-chart-001': localResource('False', CLONE_FAILURE) }
    const fetchImpl = fakeFetch(objects, (name) => (name.endsWith('-000') ? { ok: false, status: 502 } as Response : null))
    const { deps } = fakeClock(fetchImpl)
    const sweep = await sweepPublishChildren(TARGET, deps)
    // The contiguous prefix is empty (we could not read -000) — but the evidence is not discarded.
    expect(sweep.children).toHaveLength(0)
    expect(sweep.transportError).toBe('read failed (HTTP 502)')
    expect(sweep.brokenChild?.name).toBe('publish-my-chart-001')
    expect(sweep.brokenChild?.message).toBe(CLONE_FAILURE)
  })

  it('flags a SATURATED window rather than treating it as the end of the series', async () => {
    // Every probed name exists: the series may continue past the window, so the sweep says so.
    const fetchImpl = fakeFetch(children(TARGET.expectedChildren + CHILD_PROBE_SLACK, 'True'))
    const { deps } = fakeClock(fetchImpl)
    const sweep = await sweepPublishChildren(TARGET, deps)
    expect(sweep.truncated).toBe(true)
  })
})

describe('followPublish', () => {
  it('emits an in-flight state SYNCHRONOUSLY, before any read', () => {
    const clock = fakeClock(fakeFetch({}))
    const states: PublishFollowState[] = []
    const handle = followPublish(TARGET, (state) => states.push(state), clock.deps)
    expect(states).toHaveLength(1)
    expect(states[0].phase).toBe('pending')
    expect(states[0].key).toBe(followKey('krateo-system', 'publish-my-chart'))
    handle.cancel()
  })

  it('ALL CHILDREN READY → pushed, and only then is the link earned', async () => {
    const clock = fakeClock(fakeFetch(children(3, 'True')))
    const states: PublishFollowState[] = []
    const handle = followPublish(TARGET, (state) => states.push(state), clock.deps)
    await clock.settle()
    // Sweep 1 sees a complete set but has not yet SETTLED on the count — still pending, by design.
    expect(states[states.length - 1].phase).toBe('pending')
    await clock.pump()
    const final = states[states.length - 1]
    expect(final.phase).toBe('pushed')
    expect(final.ready).toBe(3)
    expect(final.target.deepLink).toContain('compare/main...builder/my-chart')
    expect(clock.pending()).toBe(0)
    handle.cancel()
  })

  it('ONE CHILD Synced: False → failed, carrying that child\'s OWN message verbatim', async () => {
    const objects = { ...children(3, 'True'), 'publish-my-chart-001': localResource('False', CLONE_FAILURE) }
    const clock = fakeClock(fakeFetch(objects))
    const states: PublishFollowState[] = []
    followPublish(TARGET, (state) => states.push(state), clock.deps)
    await clock.settle()
    const final = states[states.length - 1]
    expect(final.phase).toBe('failed')
    expect(final.failure).toEqual({ child: 'publish-my-chart-001', message: CLONE_FAILURE, reason: 'ReconcileError' })
    // Terminal: it stops polling rather than nagging the cluster about a settled verdict.
    expect(clock.pending()).toBe(0)
  })

  it('STILL PENDING is its own state — a slow publish is not a failed one', async () => {
    const clock = fakeClock(fakeFetch(children(2, 'True')))
    const states: PublishFollowState[] = []
    followPublish(TARGET, (state) => states.push(state), clock.deps)
    await clock.settle()
    await clock.pump()
    const final = states[states.length - 1]
    // 2 of the 3 expected children exist and are Synced — NOT a success, and NOT a failure.
    expect(final.phase).toBe('pending')
    expect(final.ready).toBe(2)
    expect(clock.pending()).toBe(1)
  })

  it('THE BOUND: an unfinished publish becomes `stalled` — honest, never a fabricated failure', async () => {
    const clock = fakeClock(fakeFetch(children(3, 'Unknown')))
    const states: PublishFollowState[] = []
    followPublish(TARGET, (state) => states.push(state), clock.deps, 20000)
    await clock.settle()
    await drain(clock.pump)
    const final = states[states.length - 1]
    expect(final.phase).toBe('stalled')
    expect(final.failure).toBeUndefined()
    expect(final.updatedAt - final.startedAt).toBeGreaterThanOrEqual(20000)
  })

  it('THE BOUND with nothing readable → `unreadable`, which says we could not see, not that it broke', async () => {
    const clock = fakeClock(fakeFetch({}, () => ({ ok: false, status: 403 } as Response)))
    const states: PublishFollowState[] = []
    followPublish(TARGET, (state) => states.push(state), clock.deps, 9000)
    await clock.settle()
    await drain(clock.pump)
    const final = states[states.length - 1]
    expect(final.phase).toBe('unreadable')
    expect(final.transportError).toBe('read failed (HTTP 403)')
  })

  it('CANCEL MID-POLL leaves nothing running and lands no late state', async () => {
    const fetchImpl = fakeFetch(children(1, 'True'))
    const clock = fakeClock(fetchImpl)
    const states: PublishFollowState[] = []
    const handle = followPublish(TARGET, (state) => states.push(state), clock.deps)
    await clock.settle()
    const beforeCancel = states.length
    const readsBeforeCancel = fetchImpl.mock.calls.length
    handle.cancel()
    expect(clock.pending()).toBe(0)
    // Nothing left to pump; and even a stray pump would emit nothing.
    expect(await clock.pump()).toBe(false)
    await clock.settle()
    expect(states).toHaveLength(beforeCancel)
    expect(fetchImpl.mock.calls).toHaveLength(readsBeforeCancel)
  })

  it('cancel is idempotent and safe after a terminal verdict', async () => {
    const clock = fakeClock(fakeFetch({ 'publish-my-chart-000': localResource('False', 'nope') }))
    const handle = followPublish(TARGET, () => undefined, clock.deps)
    await clock.settle()
    expect(() => {
      handle.cancel()
      handle.cancel()
    }).not.toThrow()
  })

  it('MORE CHILDREN THAN FILES: it widens the window instead of declaring success from a full one', async () => {
    // A 3-file claim whose composition rendered SIX objects, the sixth broken. The first window is
    // 3 + slack = 5 names, and all five are healthy — the exact shape that reports "Pushed" if a
    // saturated window is read as the end of the series, while `-005` sits on the clone error.
    const objects = { ...children(6, 'True'), 'publish-my-chart-005': localResource('False', CLONE_FAILURE) }
    const clock = fakeClock(fakeFetch(objects))
    const states: PublishFollowState[] = []
    followPublish(TARGET, (state) => states.push(state), clock.deps)
    await clock.settle()
    // Sweep 1: five for five, all Synced, count settled — and still NOT pushed, because the window
    // was saturated and we do not know it is the whole series.
    expect(states[states.length - 1].phase).toBe('pending')
    // Sweep 2 looks further and finds the child that was there all along.
    await drain(clock.pump)
    const final = states[states.length - 1]
    expect(final.phase).toBe('failed')
    expect(final.failure?.child).toBe('publish-my-chart-005')
    expect(final.failure?.message).toBe(CLONE_FAILURE)
  })

  it('the window stops growing at the cap', () => {
    expect(maxProbeWindow(3)).toBe(3 + MAX_CHILD_PROBE_SLACK)
    expect(maxProbeWindow(0)).toBe(1 + MAX_CHILD_PROBE_SLACK)
  })

  it('CANCEL WHILE A READ IS IN FLIGHT emits nothing after the response lands', async () => {
    // An object property, not a `let`: TS does not track an assignment made inside the executor.
    const gate: { open: () => void } = { open: () => undefined }
    const blocked = new Promise<void>((resolve) => { gate.open = resolve })
    const fetchImpl = vi.fn(async () => {
      await blocked
      return { json: () => Promise.resolve(localResource('True')), ok: true, status: 200 } as Response
    })
    const clock = fakeClock(fetchImpl)
    const states: PublishFollowState[] = []
    const handle = followPublish(TARGET, (state) => states.push(state), clock.deps)
    expect(states).toHaveLength(1)
    // Cancelled with the sweep's fetches genuinely unresolved, then the responses arrive.
    handle.cancel()
    gate.open()
    await clock.settle()
    await clock.settle()
    expect(states).toHaveLength(1)
    expect(clock.pending()).toBe(0)
  })

  it('CHECK AGAIN keeps the publish\'s own age: a fresh budget, not a fresh clock', async () => {
    const clock = fakeClock(fakeFetch({}))
    const states: PublishFollowState[] = []
    // A publish that started twelve hours before this watch — what `recheck` passes back in.
    const twelveHoursAgo = clock.deps.now() - 12 * 3_600_000
    followPublish(TARGET, (state) => states.push(state), clock.deps, 20000, twelveHoursAgo)
    await clock.settle()
    // The budget is measured from the WATCH (still pending), the age from the PUBLISH (12h).
    expect(states[states.length - 1].phase).toBe('pending')
    expect(states[states.length - 1].startedAt).toBe(twelveHoursAgo)
    await drain(clock.pump)
    const final = states[states.length - 1]
    expect(final.phase).toBe('stalled')
    expect(final.updatedAt - final.startedAt).toBeGreaterThanOrEqual(12 * 3_600_000)
    expect(final.updatedAt - final.watchStartedAt).toBeLessThan(60000)
  })

  it('defaults to a five-minute budget', () => {
    expect(FOLLOW_BUDGET_MS).toBe(300000)
  })
})
