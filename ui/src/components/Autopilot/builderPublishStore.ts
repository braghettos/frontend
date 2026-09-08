/**
 * BuilderPublish FOLLOW-UP — the store. A module-level singleton holding every publish currently
 * being followed, plus the settled ones the user has not dismissed.
 *
 * WHY A STORE AND NOT THE PUBLISH MODULES. The publish modules are pure builders that run once, at
 * finalize, and return; a publish takes longer than the turn that started it. And the rail hangs
 * under `<RouterProvider key={routerVersion}>`, so any routes-as-data reload — including the one the
 * user triggers by NAVIGATING to a page the publish just registered — remounts the whole subtree and
 * resets every `useState`. Held in component state, an in-flight publish would vanish mid-poll and
 * leave either a spinner nobody can stop or, worse, a link that was never earned. So the follow
 * lives out here (the conversationStore.ts pattern) and the rail merely subscribes: a remount
 * re-attaches to the SAME running follow.
 *
 * IT ALSO ANNOUNCES. A terminal verdict is pushed into the transcript through the caller's
 * `onSettled`, so the outcome survives beyond the rail's in-memory card — a page reload wipes this
 * store, but the transcript is persisted, and "the product never said so" is the defect being fixed.
 * The announcement is bound to the THREAD that published (see createPublishAnnouncer) and carries
 * the change-request link itself, so the durable record is not a sentence pointing at a URL the
 * user can only reach from a card they may already have dismissed.
 *
 * DELIBERATELY NOT PERSISTED. Re-hydrating a half-finished poll across a page reload would mean
 * re-deriving elapsed time and re-issuing cluster reads for a claim the user may have long since
 * abandoned. The transcript announcement carries the durable record instead.
 */

import type { Config } from '../../context/ConfigContext'
import { randomId } from '../../utils/utils'

import {
  FOLLOW_BUDGET_MS,
  defaultFollowDeps,
  followConfig,
  followKey,
  followPublish,
  type FollowDeps,
  type PublishFollowState,
  type PublishFollowTarget,
} from './builderPublishFollow'
import { formatElapsed, isTerminalPhase } from './builderPublishStatus'
import { autopilotConversationStore } from './conversationStore'
import type { AutopilotActionChip } from './types'

/** What `buildClaimPublish` hands back so a caller can start following a claim it just compiled. */
export interface PublishFollowSeed {
  claimName: string
  namespace: string
  branch: string
  /** `owner/repo`. */
  destination: string
  deepLink: string
  expectedChildren: number
}

/**
 * How many cards the rail keeps. Small on purpose: this is a live status surface, not a history —
 * the transcript is where a publish's outcome is kept. Oldest SETTLED cards are dropped first; an
 * in-flight follow is never evicted.
 */
export const MAX_TRACKED_PUBLISHES = 4

export interface PublishFollowStore {
  getSnapshot: () => PublishFollowState[]
  subscribe: (listener: () => void) => () => void
  /**
   * Start following a claim. Idempotent while a follow is in flight (a duplicate call is ignored);
   * re-following a SETTLED key restarts it, which is what the rail's "Check again" does.
   */
  follow: (target: PublishFollowTarget, opts?: { onSettled?: (state: PublishFollowState) => void; budgetMs?: number; deps?: FollowDeps }) => void
  /** Spend a fresh budget on an already-settled follow (the `stalled` / `unreadable` affordance). */
  recheck: (key: string) => void
  /** Remove a settled card. Cancels first, so dismissing an in-flight follow also stops it. */
  dismiss: (key: string) => void
  /** Cancel every follow and empty the store (teardown / tests). */
  reset: () => void
}

/** Placeholder cancel for the instant between the first emission and the handle being patched in. */
const noopCancel = (): void => undefined

interface Tracked {
  state: PublishFollowState
  cancel: () => void
  onSettled?: (state: PublishFollowState) => void
  budgetMs: number
  /** The deps this follow runs on — remembered so `recheck` resumes on the same seams (and so a
   *  test can drive one follow on a fake clock without replacing the singleton). */
  deps: FollowDeps
}

export const createPublishFollowStore = (storeDeps: FollowDeps = defaultFollowDeps()): PublishFollowStore => {
  const tracked = new Map<string, Tracked>()
  const listeners = new Set<() => void>()
  // Cached array snapshot: useSyncExternalStore requires a STABLE reference between writes, and a
  // fresh `[...map.values()]` on every getSnapshot would re-render the rail forever.
  let snapshot: PublishFollowState[] = []

  const publish = (): void => {
    snapshot = [...tracked.values()].map((entry) => entry.state)
    for (const listener of listeners) {
      listener()
    }
  }

  /** Evict the oldest SETTLED cards once over the cap; in-flight follows are never dropped. */
  const trim = (): void => {
    const settled = [...tracked.entries()]
      .filter(([, entry]) => isTerminalPhase(entry.state.phase))
      .sort(([, left], [, right]) => left.state.updatedAt - right.state.updatedAt)
    let overflow = tracked.size - MAX_TRACKED_PUBLISHES
    for (const [key] of settled) {
      if (overflow <= 0) {
        break
      }
      tracked.delete(key)
      overflow -= 1
    }
  }

  const start = (target: PublishFollowTarget, onSettled: ((state: PublishFollowState) => void) | undefined, budgetMs: number, deps: FollowDeps, startedAt?: number): void => {
    const key = followKey(target.namespace, target.claimName)
    // `followPublish` emits its first (pending) state synchronously, before this assignment — so the
    // handler writes the map entry itself and `cancel` is patched in immediately afterwards.
    const handle = followPublish(target, (state) => {
      const previous = tracked.get(state.key)
      tracked.set(state.key, {
        budgetMs,
        cancel: previous?.cancel ?? noopCancel,
        deps,
        state,
        ...(onSettled ? { onSettled } : {}),
      })
      trim()
      publish()
      if (isTerminalPhase(state.phase)) {
        onSettled?.(state)
      }
    }, deps, budgetMs, startedAt)
    const entry = tracked.get(key)
    if (entry) {
      entry.cancel = handle.cancel
    } else {
      // Defensive: a follow that somehow emitted nothing still gets a cancel handle to hang on.
      handle.cancel()
    }
  }

  return {
    dismiss: (key) => {
      tracked.get(key)?.cancel()
      tracked.delete(key)
      publish()
    },
    follow: (target, opts) => {
      const key = followKey(target.namespace, target.claimName)
      const existing = tracked.get(key)
      if (existing && !isTerminalPhase(existing.state.phase)) {
        return
      }
      existing?.cancel()
      tracked.delete(key)
      start(target, opts?.onSettled, opts?.budgetMs ?? FOLLOW_BUDGET_MS, opts?.deps ?? storeDeps)
    },
    getSnapshot: () => snapshot,
    recheck: (key) => {
      const entry = tracked.get(key)
      if (!entry || !isTerminalPhase(entry.state.phase)) {
        return
      }
      entry.cancel()
      tracked.delete(key)
      // Carry the ORIGINAL start forward. A re-check buys a fresh budget, not a fresh publish: a
      // publish stuck since last night must keep reading as twelve hours old, or the one control a
      // stuck publish offers is also the one that hides how stuck it is.
      start(entry.state.target, entry.onSettled, entry.budgetMs, entry.deps, entry.state.startedAt)
    },
    reset: () => {
      for (const entry of tracked.values()) {
        entry.cancel()
      }
      tracked.clear()
      publish()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** The app-wide singleton — outlives every AutopilotProvider/rail remount. One rail, one store. */
export const autopilotPublishStore = createPublishFollowStore()

/**
 * Turn the seed a compiled claim publish returns into a live follow. Returns false when the install
 * has no snowplow base URL to read through — the caller then keeps the old behaviour rather than
 * pretending to watch something.
 */
export const startPublishFollow = (
  seed: PublishFollowSeed,
  config: Config | undefined,
  onSettled?: (state: PublishFollowState) => void,
  store: PublishFollowStore = autopilotPublishStore,
): boolean => {
  const resolved = followConfig(config)
  if (!resolved) {
    return false
  }
  store.follow({ ...seed, snowplowBaseUrl: resolved.snowplowBaseUrl }, onSettled ? { onSettled } : undefined)
  return true
}

/**
 * The one-line transcript announcement for a settled publish. It is the DURABLE half of the fix:
 * the card is transient, this sentence is persisted with the thread and browsable in history.
 * `failed` carries the child's own message verbatim — the sentence the original user never saw.
 *
 * The elapsed time is the REAL age of the publish (across every `Check again`), not the budget
 * constant: "still running after 5 minutes" printed twelve hours in would be its own small lie.
 */
export const publishSettlementText = (state: PublishFollowState): string => {
  const { branch, destination } = state.target
  const watched = formatElapsed(Math.max(0, state.updatedAt - state.startedAt))
  switch (state.phase) {
    case 'pushed':
      return `Publish complete — \`${branch}\` is pushed to ${destination}. You can open the change request now.`
    case 'failed':
      return `Publish failed on ${destination} — ${state.failure?.child ?? 'a git-provider resource'} reported:\n\n> ${state.failure?.message ?? 'no message'}\n\nNo change request was created. Nothing was pushed to \`${branch}\`.`
    case 'unreadable':
      return `Publish submitted to ${destination} (\`${branch}\`), but the portal could not read its status here${state.transportError ? ` — ${state.transportError}` : ''}. It may still be running; ask an operator to check the git-provider resources for \`${state.target.claimName}\`.`
    default:
      // NOTHING RENDERED AT ALL is a different sentence from PARTIAL PROGRESS. Claiming "the
      // publish keeps going" when no git resource ever appeared asserts progress we never saw; the
      // likelier truth is that the builder-publish composition is not reconciling the claim.
      return state.total === 0
        ? `Publish to ${destination} (\`${branch}\`) was accepted ${watched} ago, but no git resources have been rendered for \`${state.target.claimName}\` in that time — the builder-publish composition may not be reconciling it. Nothing has failed and nothing has been pushed; use Check again in the rail, or ask an operator to look at the claim.`
        : `Publish to ${destination} (\`${branch}\`) is still running after ${watched} — ${state.ready} of ${state.total || state.target.expectedChildren} files committed and nothing has failed. It keeps going on the cluster; use Check again in the rail for the current state.`
  }
}

/**
 * The link, attached to the DURABLE record rather than only to a card the user can dismiss (or lose
 * to a reload, or to the four-card cap). Two shapes, and the difference is the whole point:
 *   • `pushed` — the change request is real; the link is offered plainly.
 *   • `stalled` / `unreadable` — we do not KNOW whether the branch landed, and on an install where
 *     the caller cannot read `localresources` we never will. Withholding the link entirely there
 *     would be strictly worse than before this change: a publish that worked would leave the user
 *     with nothing. So the link is offered with the uncertainty IN ITS LABEL — which is not the
 *     same as presenting a change request as though it exists.
 *   • `failed` — no link at all. Nothing was pushed; there is nothing to open.
 */
export const publishSettlementActions = (state: PublishFollowState): AutopilotActionChip[] => {
  const { deepLink } = state.target
  // `pending` is listed for completeness — this is only ever called on a terminal verdict, and an
  // in-flight publish must never carry a link anywhere.
  if (!deepLink || state.phase === 'failed' || state.phase === 'pending') {
    return []
  }
  return state.phase === 'pushed'
    ? [{ label: 'Open change request', readOnly: true, url: deepLink, verb: 'openChangeRequest' }]
    : [{ label: 'Open change request (only exists if the push landed)', readOnly: true, url: deepLink, verb: 'openChangeRequest' }]
}

/**
 * Build the `onSettled` that appends the verdict to the transcript as an assistant turn.
 *
 * IT IS A FACTORY, NOT A BARE FUNCTION, because it must remember WHICH THREAD asked for the
 * publish. The conversation store is a module singleton holding one live thread, and a follow
 * routinely outlives the turn that started it — long enough for the user to hit New thread or open
 * a past session. Announcing blind would file "Publish failed — …" under an unrelated conversation
 * (and, on a restored thread, persist it into that thread's archived copy) while the thread that
 * actually published stayed silent. So the session id is captured here, at the start of the follow,
 * and the write is skipped if the user has moved on — the card still carries the verdict.
 *
 * It lives here rather than in AutopilotProvider because it must NOT be a component closure: a
 * publish outlives the provider mount that started it.
 */
export const createPublishAnnouncer = (): ((state: PublishFollowState) => void) => {
  const { sessionId } = autopilotConversationStore.getSnapshot()
  return (state) => {
    if (autopilotConversationStore.getSnapshot().sessionId !== sessionId) {
      return
    }
    const actions = publishSettlementActions(state)
    autopilotConversationStore.setMessages((previous) => [...previous, {
      createdAt: Date.now(),
      id: `pub_${randomId()}`,
      role: 'assistant',
      text: publishSettlementText(state),
      ...(actions.length > 0 ? { actions } : {}),
    }])
  }
}
