/**
 * BuilderPublish FOLLOW-UP — the polling engine. Given a claim that was just POSTed, it watches the
 * git-provider LocalResources the composition renders from it and reports, honestly, what they say.
 *
 * WHY POLLING AT ALL. The publish path was fire-and-forget: `buildClaimPublish` returned a
 * change-request deep link the moment the POST compiled, and nothing ever looked at the result. A
 * publish that could never land looked exactly like one that had.
 *
 * WHY BY NAME AND NOT BY LIST. snowplow's `/call` is the portal's only read route to arbitrary
 * cluster objects and it requires a `name` on every verb (see hooks/callPath.ts) — there is no LIST.
 * The composition names its children deterministically (`<claim>-000`, `-001`, …), so a sweep probes
 * that series in parallel and takes the contiguous prefix that exists; the first 404 ends it. The
 * path itself comes from the SAME builder `applyResourceSet` writes through — no second read path.
 *
 * EVERYTHING INJECTABLE. `fetch`, the clock and the scheduler are dependencies, so the unit tests
 * drive a whole five-minute follow deterministically with no timers and no cluster.
 */

import type { Config } from '../../context/ConfigContext'
import { buildCallWritePath } from '../../hooks/callPath'
import { getAccessToken } from '../../utils/getAccessToken'

import {
  LOCAL_RESOURCE_GVR,
  childResourceName,
  isTerminalPhase,
  readChildSync,
  reducePublishVerdict,
  type ChildSweep,
  type ChildSyncState,
  type PublishVerdict,
} from './builderPublishStatus'

/**
 * HOW LONG TO FOLLOW — a deliberate judgement, not a round number picked for looks.
 *
 * A healthy publish of ≤10 small files is a clone, N commits and a push: seconds, occasionally a
 * minute or two when the composition is still rendering behind a busy core-provider. The failure
 * this change exists for was visible in the children's conditions WITHIN the first reconcile — it
 * did not need twelve hours to become knowable, it needed someone to look once.
 *
 * So five minutes: comfortably longer than any healthy publish observed, short enough that the rail
 * is never a background process nobody asked for. AT THE BOUND WE DO NOT GUESS. The phase becomes
 * `stalled` — "still running, nothing has failed, check again" — because calling a slow-but-healthy
 * publish "failed" would replace one lie with another. The user gets a Check again control that
 * spends a fresh budget; the cluster keeps going regardless of whether anyone is watching.
 */
export const FOLLOW_BUDGET_MS = 5 * 60 * 1000

/**
 * Poll spacing, backing off 2s → 10s. Tight at the start (most publishes settle inside the first
 * three sweeps, and a fast success should feel instant), relaxed afterwards so a stuck publish
 * costs snowplow well under one request per second for the rest of its budget.
 */
export const POLL_BACKOFF_MS = [2000, 3000, 5000, 8000]
const STEADY_POLL_MS = 10000

/**
 * How far PAST the claim's file count to probe each sweep. The composition renders at least one
 * LocalResource per held file; the slack catches a chart that renders an extra object (a branch
 * ref, a marker) without which the child set would look complete one object early.
 */
export const CHILD_PROBE_SLACK = 2

/** Where a publish is going and what to watch — everything the follower needs, nothing more. */
export interface PublishFollowTarget {
  /** metadata.name of the BuilderPublish claim (the children are named after it). */
  claimName: string
  namespace: string
  branch: string
  /** `owner/repo`, for the rail's copy. */
  destination: string
  /** The host-aware change-request URL — HELD, and offered only once the push actually lands. */
  deepLink: string
  /** Files the claim carried = the minimum number of children the composition must render. */
  expectedChildren: number
  snowplowBaseUrl: string
}

/** One follow's live state, as the rail renders it. */
export interface PublishFollowState extends PublishVerdict {
  key: string
  target: PublishFollowTarget
  startedAt: number
  updatedAt: number
  /** The last non-404 read failure, kept so `unreadable` can say WHY rather than just shrug. */
  transportError?: string
}

/** The injectable seams: network, clock, scheduler, auth. */
export interface FollowDeps {
  fetch: typeof globalThis.fetch
  now: () => number
  /** Run `run` after `ms`; the returned function cancels it. Tests substitute a manual pump. */
  schedule: (ms: number, run: () => void) => () => void
  authHeaders: () => Record<string, string>
}

/** The real dependencies. Kept out of module scope so tests never accidentally get them. */
export const defaultFollowDeps = (): FollowDeps => ({
  authHeaders: (): Record<string, string> => {
    try {
      return { Authorization: `Bearer ${getAccessToken()}` }
    } catch {
      // No stored token (tests, a torn-down session): send unauthenticated and let the server decide.
      return {}
    }
  },
  fetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
  now: () => Date.now(),
  schedule: (ms, run) => {
    const handle = setTimeout(run, ms)
    return () => clearTimeout(handle)
  },
})

/** The stable identity of one follow (one claim in one namespace). */
export const followKey = (namespace: string, claimName: string): string => `${namespace}/${claimName}`

/** snowplow base URL + the namespace the portal reads in — absent config means no follow is possible. */
export const followConfig = (config: Config | undefined): { snowplowBaseUrl: string } | null => {
  const snowplowBaseUrl = config?.api.SNOWPLOW_API_BASE_URL
  return snowplowBaseUrl ? { snowplowBaseUrl: snowplowBaseUrl.replace(/\/+$/, '') } : null
}

type ChildRead =
  | { found: true; name: string; object: unknown }
  | { found: false; name: string }
  | { error: string; name: string }

/**
 * GET one LocalResource over snowplow `/call`. A 404 is a first-class, non-error answer: it means
 * the composition has not rendered that child yet (or there is no such child), which is how the
 * sweep discovers where the series ends.
 */
const readChild = async (name: string, target: PublishFollowTarget, deps: FollowDeps): Promise<ChildRead> => {
  const path = buildCallWritePath({
    group: LOCAL_RESOURCE_GVR.group,
    name,
    namespace: target.namespace,
    resource: LOCAL_RESOURCE_GVR.resource,
    version: LOCAL_RESOURCE_GVR.version,
  })
  try {
    const response = await deps.fetch(`${target.snowplowBaseUrl}${path}`, { headers: deps.authHeaders() })
    if (response.status === 404) {
      return { found: false, name }
    }
    if (!response.ok) {
      return { error: `read failed (HTTP ${response.status})`, name }
    }
    return { found: true, name, object: await response.json() }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'read failed', name }
  }
}

/**
 * One sweep: probe `expectedChildren + CHILD_PROBE_SLACK` names in parallel and keep the contiguous
 * prefix that exists. A non-404 read failure ENDS the prefix and is recorded — we do not pretend a
 * child we could not read is absent, and we never turn "could not read" into "failed".
 */
export const sweepPublishChildren = async (target: PublishFollowTarget, deps: FollowDeps): Promise<ChildSweep> => {
  const probes = Math.max(1, target.expectedChildren) + CHILD_PROBE_SLACK
  const names = Array.from({ length: probes }, (_unused, index) => childResourceName(target.claimName, index))
  const reads = await Promise.all(names.map((name) => readChild(name, target, deps)))
  const children: ChildSyncState[] = []
  let transportError: string | undefined
  for (const read of reads) {
    if ('error' in read) {
      transportError = read.error
      break
    }
    if (!read.found) {
      break
    }
    children.push(readChildSync(read.name, read.object))
  }
  return { children, ...(transportError ? { transportError } : {}) }
}

/**
 * Follow one publish to a terminal phase, emitting every state change through `onState`.
 *
 * The loop is a SELF-SCHEDULING tick rather than a `while (await …)`: cancellation is then a single
 * cleared timer with no in-flight iteration to unwind, which is what makes "the user navigated away
 * mid-poll" leave nothing behind. `cancel()` is idempotent and stops emissions immediately — a
 * cancelled follow never lands a late success on a surface nobody is watching.
 */
export const followPublish = (
  target: PublishFollowTarget,
  onState: (state: PublishFollowState) => void,
  deps: FollowDeps,
  budgetMs: number = FOLLOW_BUDGET_MS,
): { cancel: () => void } => {
  const key = followKey(target.namespace, target.claimName)
  const startedAt = deps.now()
  let cancelled = false
  let cancelTimer: (() => void) | null = null
  let sweeps = 0
  let lastCount = -1
  let stableSweeps = 0

  const emit = (verdict: PublishVerdict, transportError: string | undefined): void => {
    onState({ ...verdict, key, startedAt, target, updatedAt: deps.now(), ...(transportError ? { transportError } : {}) })
  }

  const tick = async (): Promise<void> => {
    if (cancelled) {
      return
    }
    const sweep = await sweepPublishChildren(target, deps)
    if (cancelled) {
      return
    }
    // Child-count stability (see STABLE_SWEEPS_REQUIRED): a mid-render sweep that happens to see
    // "3 of 6, all Synced" must not be reported as a completed push.
    stableSweeps = sweep.children.length === lastCount ? stableSweeps + 1 : 1
    lastCount = sweep.children.length
    const elapsedMs = deps.now() - startedAt
    const verdict = reducePublishVerdict({ budgetMs, elapsedMs, expectedMin: target.expectedChildren, stableSweeps, sweep })
    emit(verdict, sweep.transportError)
    if (isTerminalPhase(verdict.phase)) {
      return
    }
    const interval = POLL_BACKOFF_MS[sweeps] ?? STEADY_POLL_MS
    sweeps += 1
    cancelTimer = deps.schedule(interval, () => { void tick() })
  }

  // Emit the in-flight state SYNCHRONOUSLY, before the first read: the rail must say "pushing…"
  // from the instant the claim is accepted, never show a blank gap that reads as "nothing happened".
  emit({ phase: 'pending', ready: 0, total: 0 }, undefined)
  void tick()

  return {
    cancel: () => {
      cancelled = true
      cancelTimer?.()
      cancelTimer = null
    },
  }
}
