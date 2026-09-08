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
import { isTerminalPhase } from './builderPublishStatus'
import { autopilotConversationStore } from './conversationStore'

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

  const start = (target: PublishFollowTarget, onSettled: ((state: PublishFollowState) => void) | undefined, budgetMs: number, deps: FollowDeps): void => {
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
    }, deps, budgetMs)
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
      start(entry.state.target, entry.onSettled, entry.budgetMs, entry.deps)
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
 */
export const publishSettlementText = (state: PublishFollowState): string => {
  const { branch, destination } = state.target
  switch (state.phase) {
    case 'pushed':
      return `Publish complete — \`${branch}\` is pushed to ${destination}. You can open the change request now.`
    case 'failed':
      return `Publish failed on ${destination} — ${state.failure?.child ?? 'a git-provider resource'} reported:\n\n> ${state.failure?.message ?? 'no message'}\n\nNo change request was created. Nothing was pushed to \`${branch}\`.`
    case 'unreadable':
      return `Publish submitted to ${destination} (\`${branch}\`), but the portal could not read its status here${state.transportError ? ` — ${state.transportError}` : ''}. It may still be running; ask an operator to check the git-provider resources for \`${state.target.claimName}\`.`
    default:
      return `Publish to ${destination} (\`${branch}\`) is still running after ${Math.round(FOLLOW_BUDGET_MS / 60000)} minutes — ${state.ready} of ${state.total || state.target.expectedChildren} files committed and nothing has failed. It keeps going on the cluster; use Check again in the rail for the current state.`
  }
}

/**
 * The default `onSettled`: append the verdict to the transcript as an assistant turn.
 *
 * It lives here rather than in AutopilotProvider because it must NOT be a component closure — a
 * publish routinely outlives the provider mount that started it, and the conversation store is a
 * module singleton precisely so a write like this still lands after a routerVersion remount.
 */
export const announcePublishSettlement = (state: PublishFollowState): void => {
  autopilotConversationStore.setMessages((previous) => [...previous, {
    createdAt: Date.now(),
    id: `pub_${randomId()}`,
    role: 'assistant',
    text: publishSettlementText(state),
  }])
}
