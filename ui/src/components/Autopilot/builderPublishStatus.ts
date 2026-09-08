/**
 * BuilderPublish FOLLOW-UP — the pure half: what a publish's git-provider children say, and what
 * that means for the human watching the rail.
 *
 * THE DEFECT THIS CLOSES (real customer report). The rail POSTed a `BuilderPublish` claim, handed
 * back an "Open change request" deep link, and never looked again. Twelve hours later the change
 * request did not exist, because all six rendered `localresources.git.krateo.io` children sat
 *
 *     Synced: False — observe failed: failed to clone repository: authentication required:
 *     invalid credentials
 *
 * …while the PARENT BuilderPublish happily reported `Ready: True — Composition is up-to-date`.
 * The product said nothing; the user had to hand-write a diagnosis request to find out.
 *
 * SO: WE READ THE CHILDREN, NEVER THE PARENT. That is the load-bearing decision in this file. A
 * Krateo composition claim reports its OWN reconciliation (the chart rendered, the objects were
 * created) — not whether the objects it rendered subsequently did their job. Trusting the parent's
 * `Ready` is exactly the bug being fixed, so nothing here reads the parent's conditions; the claim
 * name is used only to DERIVE the children's names.
 *
 * The children are named deterministically by the composition: `<claim-name>-000`, `-001`, … — and
 * snowplow's `/call` transport has no LIST route (it requires a `name` on every verb), so the
 * follower probes that name series. See builderPublishFollow.ts for the sweep; this module is the
 * pure reducer over what it read, with no network, no clock and no React.
 */

import type { ApplyResourceSetGvr } from './applyResourceSet'

/**
 * The git-provider CRD the composition renders per committed file. Its group/version is
 * git-provider's OWN (installed by the provider chart), NOT chart-derived like the BuilderPublish
 * claim's — so unlike builderPublishGvr.ts there is nothing live to resolve. If a future
 * git-provider serves a different version every probe 404s, which reads as "no children yet" and
 * ends at the honest `stalled` verdict below — never as a fabricated failure.
 */
export const LOCAL_RESOURCE_GVR: ApplyResourceSetGvr = { group: 'git.krateo.io', resource: 'localresources', version: 'v1alpha1' }

/**
 * The composition's child naming: `<claim-name>-000`, `-001`, … (zero-padded to three).
 *
 * A DECLARED RESIDUAL, because the names are deterministic and so is the claim name
 * (`publish-<slug>`): if a claim were deleted and immediately re-POSTed, its predecessor's children
 * could still exist for the moment before garbage collection, and a sweep would read them as this
 * publish's. What closes the realistic path is the dispatch gate in publishOutcome.ts — a POST onto
 * an existing claim is a 409 and no longer starts a follow at all, so stale children cannot
 * accompany an accepted publish of the same name. The two remedies reviewed for the remaining
 * window were both worse than it: a randomised claim name changes the composition's identity (a
 * behaviour change well outside a visibility fix, and it would strand the existing claim per slug),
 * and a `creationTimestamp` watermark compares the BROWSER's clock to the apiserver's, so a few
 * seconds of skew would turn every healthy publish into a permanent non-success.
 */
export const childResourceName = (claimName: string, index: number): string =>
  `${claimName}-${String(index).padStart(3, '0')}`

/**
 * The condition types that carry a git-provider LocalResource's verdict, in priority order. The
 * FIRST present one is authoritative: git-provider sets `Synced` from the observe/apply it actually
 * performed (that is the condition the incident's message rode on), while `Ready` is the
 * crossplane-style availability flag, which is legitimately `False` for a beat after creation.
 */
const VERDICT_CONDITIONS = ['Synced', 'Ready']

/** One child's verdict, reduced from its `status.conditions[]`. */
export interface ChildSyncState {
  name: string
  /** True once the child's Synced (else Ready) condition is `"True"`. */
  ready: boolean
  /** True when a verdict condition is explicitly `"False"` — the failing case. */
  failed: boolean
  /** The child's OWN message, verbatim. It is already a good user-facing sentence; the rail shows
   *  it rather than a generic "publish failed", because the generic sentence is what left the
   *  original user with nothing to act on. */
  message?: string
  reason?: string
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null)

const conditionsOf = (child: unknown): Record<string, unknown>[] => {
  const conditions = asRecord(asRecord(child)?.status)?.conditions
  return Array.isArray(conditions) ? conditions.map(asRecord).filter((entry): entry is Record<string, unknown> => entry !== null) : []
}

const str = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined)

/**
 * Reduce ONE fetched LocalResource to its verdict. An absent or `Unknown` condition is neither
 * ready nor failed — it is still working, which is the whole point of distinguishing "ninety
 * seconds pending" from "twelve hours stuck".
 *
 * THE TWO CONDITIONS ARE READ ASYMMETRICALLY, ON PURPOSE:
 *   • FAILURE comes only from the AUTHORITATIVE condition (`Synced` when present, else `Ready`).
 *     A secondary `Ready: False` is routinely just "not available yet" one reconcile after create,
 *     and calling that a failed publish would fabricate exactly the kind of lie this change exists
 *     to remove — only in the other direction.
 *   • SUCCESS requires EVERY present verdict condition to say `True`. Taking the first condition and
 *     discarding the rest is how a resource asserting health on one condition and failure on
 *     another gets scored healthy — which is the parent-`Ready`-over-failing-children bug reproduced
 *     one level down. When the conditions disagree we refuse to pick the cheerful one: the child
 *     stays "still working", the publish stays pending, and the bound reports it honestly.
 */
export const readChildSync = (name: string, child: unknown): ChildSyncState => {
  const conditions = conditionsOf(child)
  const present = VERDICT_CONDITIONS
    .map((type) => conditions.find((condition) => condition.type === type))
    .filter((condition): condition is Record<string, unknown> => condition !== undefined)
  const [verdict] = present
  if (!verdict) {
    return { failed: false, name, ready: false }
  }
  return {
    failed: str(verdict.status) === 'False',
    message: str(verdict.message),
    name,
    ready: present.every((condition) => str(condition.status) === 'True'),
    reason: str(verdict.reason),
  }
}

/** What one sweep of the child name series found. */
export interface ChildSweep {
  /** The contiguous children that exist right now (a 404 or an unreadable name ends the series). */
  children: ChildSyncState[]
  /**
   * A failing child seen ANYWHERE in the probed window, including past the end of the contiguous
   * prefix. A flaky read on `-000` must not bury an already-fetched `-001` that is carrying the
   * sentence the user needs: evidence we have read is never thrown away for being out of order.
   */
  brokenChild?: ChildSyncState
  /**
   * True when the prefix consumed the WHOLE probe window — the series may continue past what we
   * looked at, so the set is not known to be complete and success must not be declared from it.
   */
  truncated?: boolean
  /** A NON-404 read failure (snowplow down, RBAC 403, network) from the last sweep. Never a
   *  failure verdict on its own — we could not see, which is not the same as a broken publish. */
  transportError?: string
}

/**
 * The phases the rail renders. Deliberately five, because collapsing any two of them is how the
 * original bug shipped:
 *   pending    — the push is under way. Shown WITH its elapsed time, so 90s and 12h differ on screen.
 *   pushed     — every rendered child is Synced. ONLY here is the change-request link offered.
 *   failed     — a child said `False`. Its own message is surfaced verbatim.
 *   stalled    — the follow budget ran out with nothing failed. Honest "still running", never a
 *                fabricated failure: a slow-but-healthy publish must not read as a broken one.
 *   unreadable — we never managed to read a single child (RBAC/snowplow). Also not a failure.
 */
export type PublishFollowPhase = 'pending' | 'pushed' | 'failed' | 'stalled' | 'unreadable'

/** The failing child, as the rail shows it. */
export interface PublishFailure {
  child: string
  message: string
  reason?: string
}

export interface PublishVerdict {
  phase: PublishFollowPhase
  ready: number
  total: number
  failure?: PublishFailure
}

/**
 * How many consecutive sweeps must agree on the child count before a publish may be called
 * `pushed`. WHY THIS EXISTS: the composition renders its children one at a time, so a sweep taken
 * mid-render can legitimately see three of six, all of them Synced — and calling that success is
 * precisely the lying-success this whole change exists to prevent. Two agreeing sweeps (≥2s apart)
 * plus the `expectedMin` floor below make a premature success cost an extra poll instead of a lie.
 */
export const STABLE_SWEEPS_REQUIRED = 2

/**
 * Reduce a sweep to the phase shown in the rail.
 *
 * `expectedMin` is the number of files the claim carried: the composition commits each held file
 * through its own LocalResource, so it renders AT LEAST that many children (it may render more —
 * hence the probe slack in builderPublishFollow.ts). Fewer than that on screen means the render is
 * not finished, whatever the children present happen to say.
 *
 * Order matters: a failing child beats everything (report it the instant it appears, even mid
 * render), then success, then the budget. A budget that expires while children are still merely
 * pending yields `stalled` — NOT `failed`.
 */
export const reducePublishVerdict = (args: {
  sweep: ChildSweep
  expectedMin: number
  stableSweeps: number
  elapsedMs: number
  budgetMs: number
}): PublishVerdict => {
  const { budgetMs, elapsedMs, expectedMin, stableSweeps, sweep } = args
  const { children, transportError, truncated } = sweep
  const ready = children.filter((child) => child.ready).length
  // A child that failed anywhere in the probed window wins, even if it sits past the contiguous
  // prefix: a read blip on an earlier name is no reason to withhold a failure we already have.
  const broken = sweep.brokenChild ?? children.find((child) => child.failed)
  if (broken) {
    return {
      failure: {
        child: broken.name,
        // The child's own sentence, verbatim. The fallback fires only when git-provider set the
        // condition False with no message at all — then we say exactly that, and no more.
        message: broken.message ?? `${broken.name} reported a failure with no message`,
        ...(broken.reason ? { reason: broken.reason } : {}),
      },
      phase: 'failed',
      ready,
      total: children.length,
    }
  }
  const complete = children.length >= Math.max(1, expectedMin) && ready === children.length && children.length > 0
  // SUCCESS IS ONLY DECLARED FROM A COMPLETE READ. `transportError` means a name in the window came
  // back 403/500 — the child behind it may be the failing one. `truncated` means every probed name
  // existed, so the series may run past the window we looked at. Either way we do not know the set
  // is whole, and "we did not see a failure in the part we could read" is not a push.
  if (complete && stableSweeps >= STABLE_SWEEPS_REQUIRED && !transportError && !truncated) {
    return { phase: 'pushed', ready, total: children.length }
  }
  if (elapsedMs >= budgetMs) {
    return { phase: children.length === 0 && transportError ? 'unreadable' : 'stalled', ready, total: children.length }
  }
  return { phase: 'pending', ready, total: children.length }
}

/** True once the phase will not change on its own — the follower stops and the rail stops spinning. */
export const isTerminalPhase = (phase: PublishFollowPhase): boolean => phase !== 'pending'

/**
 * "8s" · "2m 14s" · "1h 03m" — coarse on purpose; this is a duration, not a stopwatch. It lives in
 * the pure module because BOTH surfaces that must tell ninety seconds from twelve hours use it: the
 * card's live clock and the transcript sentence the card's dismissal leaves behind.
 */
export const formatElapsed = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  }
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}
