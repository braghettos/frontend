/**
 * THE PUBLISH CARD — what the rail shows while a BuilderPublish claim is actually landing, and what
 * it says when it does not.
 *
 * The defect it answers: a publish returned an "Open change request" link the instant the claim
 * compiled, and the product then said nothing for twelve hours while every git-provider child sat
 * `Synced: False — observe failed: failed to clone repository: authentication required: invalid
 * credentials`. So this card exists to make each of those states LOOK different:
 *
 *   pending     a spinner, the destination, files committed so far, AND AN ELAPSED CLOCK. The clock
 *               is the whole point: ninety seconds and twelve hours must not render identically.
 *   pushed      quiet, neutral chrome (the house rule: no status marker for the healthy state) and
 *               the change-request link — which appears HERE FOR THE FIRST TIME, once the push is real.
 *   failed      red, and THE CHILD'S OWN MESSAGE VERBATIM. It is already a good user-facing sentence;
 *               replacing it with "publish failed" is what left the original user with nothing.
 *   stalled     amber, honest: still running, nothing failed, here is Check again. Never "failed".
 *   unreadable  amber: we could not read the status, and we say so instead of guessing either way.
 *
 * Lives outside AutopilotRail.tsx for the reason VoiceControl.tsx does — the rail's 500-line budget.
 * Raw elements + the rail's CSS module + the inline stroke SVGs from icons.tsx; antd `Tooltip` for
 * the two controls that need explaining.
 */

import { Tooltip } from 'antd'
import { useEffect, useState, useSyncExternalStore } from 'react'

import styles from './AutopilotRail.module.css'
import type { PublishFollowState } from './builderPublishFollow'
import type { PublishFollowPhase } from './builderPublishStatus'
import { autopilotPublishStore } from './builderPublishStore'
import { AlertIcon, CheckIcon, ClockIcon, SpinnerIcon } from './icons'

/** Per-phase accent. `pushed` deliberately borrows nothing loud: the house rule forbids a status
 *  marker for the healthy state, so success is quiet chrome carrying a link, not a green banner. */
const PHASE_CLASS: Record<PublishFollowPhase, string> = {
  failed: styles.apPubFailed,
  pending: styles.apPubPending,
  pushed: styles.apPubPushed,
  stalled: styles.apPubWaiting,
  unreadable: styles.apPubWaiting,
}

/** Phase → the card's headline. One word each; the detail lines carry the rest. */
const PHASE_TITLE: Record<PublishFollowPhase, string> = {
  failed: 'Publish failed',
  pending: 'Publishing',
  pushed: 'Pushed',
  stalled: 'Still running',
  unreadable: 'Status unavailable',
}

/** "8s" · "2m 14s" · "1h 03m" — coarse on purpose; this is a duration, not a stopwatch. */
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

/**
 * Re-render once a second while a publish is in flight, so the elapsed clock actually moves. It
 * ticks ONLY while something is pending — a settled card is static and must not keep the tab busy.
 */
const useSecondsTick = (active: boolean): void => {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) {
      return
    }
    const handle = setInterval(() => { setTick((value) => value + 1) }, 1000)
    return () => { clearInterval(handle) }
  }, [active])
}

/** "3 of 6 files" — the concrete progress, or the honest "waiting for the composition to render". */
const progressLabel = (state: PublishFollowState): string => {
  const expected = Math.max(state.total, state.target.expectedChildren)
  return state.total === 0 ? 'waiting for the composition to render its git resources' : `${state.ready} of ${expected} files committed`
}

const PENDING_HINT = 'Watching the git-provider resources this publish rendered. The change-request link appears once the push has actually landed — never before.'
const RECHECK_HINT = 'Watch this publish for another five minutes. It keeps running on the cluster either way; this only resumes the portal looking at it.'

const PublishCard = ({ state }: { state: PublishFollowState }) => {
  const { branch, destination } = state.target
  const settled = state.phase !== 'pending'
  // The clock reads from the WALL, not from `updatedAt`: the state only changes on a sweep (2–10s
  // apart), and an elapsed time that jumps in poll-sized steps is exactly the "is this thing even
  // alive?" ambiguity the card is here to remove.
  const elapsed = formatElapsed(Date.now() - state.startedAt)

  return (
    <div className={`${styles.apPub} ${PHASE_CLASS[state.phase]}`} data-phase={state.phase} data-testid='autopilot-publish-card'>
      <div className={styles.apPubHead}>
        {state.phase === 'pending' ? <SpinnerIcon className={styles.apPubSpin} /> : null}
        {state.phase === 'pushed' ? <CheckIcon className={styles.apPubOk} size={13} /> : null}
        {state.phase === 'failed' ? <AlertIcon className={styles.apPubBad} /> : null}
        {state.phase === 'stalled' || state.phase === 'unreadable' ? <ClockIcon className={styles.apPubWarn} /> : null}
        <span className={styles.apPubTitle}>{PHASE_TITLE[state.phase]}</span>
        <span className={styles.apPubDest}>{destination}</span>
        <span className={styles.apSpacer} />
        {state.phase === 'pending' ? (
          <Tooltip title={PENDING_HINT}>
            <span className={styles.apPubElapsed}>{elapsed}</span>
          </Tooltip>
        ) : null}
        {settled ? (
          <button
            aria-label='Dismiss this publish'
            className={styles.apIc}
            onClick={() => { autopilotPublishStore.dismiss(state.key) }}
            title='Dismiss'
            type='button'
          >×</button>
        ) : null}
      </div>

      <div className={styles.apPubBranch}>{branch}</div>

      {state.phase === 'pending' ? <div className={styles.apPubNote}>{progressLabel(state)} · nothing is pushed until every one succeeds</div> : null}

      {/* The failing child's OWN sentence — verbatim, unwrapped, not paraphrased. Selectable, and
          in the mono block the rail already uses for cluster text, because this is the line the
          user will paste to whoever owns the destination repo. */}
      {state.phase === 'failed' && state.failure ? (
        <>
          <div className={styles.apPubMsg}>{state.failure.message}</div>
          <div className={styles.apPubNote}>
            reported by <code className={styles.apPubChild}>{state.failure.child}</code>{state.failure.reason ? ` · ${state.failure.reason}` : ''} · no change request was created
          </div>
        </>
      ) : null}

      {state.phase === 'stalled' ? (
        <div className={styles.apPubNote}>
          {progressLabel(state)} and nothing has failed. The publish keeps going on the cluster — the portal stopped watching after five minutes.
        </div>
      ) : null}

      {state.phase === 'unreadable' ? (
        <div className={styles.apPubNote}>
          The claim was accepted, but the portal could not read its git resources{state.transportError ? ` — ${state.transportError}` : ''}. This is not a failure verdict: it is a missing one.
        </div>
      ) : null}

      <div className={styles.apPubActions}>
        {/* THE LINK, AND ONLY HERE. Every other phase withholds it, because outside `pushed` the
            change request it points at does not exist yet — which is the original bug verbatim. */}
        {state.phase === 'pushed' ? (
          <a className={styles.apPubLink} href={state.target.deepLink} rel='noreferrer' target='_blank'>Open change request</a>
        ) : null}
        {settled && state.phase !== 'pushed' ? (
          <Tooltip title={RECHECK_HINT}>
            <button className={styles.apPubBtn} onClick={() => { autopilotPublishStore.recheck(state.key) }} type='button'>Check again</button>
          </Tooltip>
        ) : null}
      </div>
    </div>
  )
}

/**
 * The panel: every followed publish, newest last, docked in the transcript flow under the messages.
 * `aria-live='polite'` because the verdict arrives without the user doing anything — the entire
 * failure mode being fixed is a state change nobody was told about.
 */
const PublishFollowPanel = () => {
  const follows = useSyncExternalStore(autopilotPublishStore.subscribe, autopilotPublishStore.getSnapshot)
  useSecondsTick(follows.some((state) => state.phase === 'pending'))
  if (follows.length === 0) {
    return null
  }

  return (
    <div aria-live='polite' className={styles.apPubPanel} data-testid='autopilot-publish-panel'>
      {follows.map((state) => <PublishCard key={state.key} state={state} />)}
    </div>
  )
}

export default PublishFollowPanel
