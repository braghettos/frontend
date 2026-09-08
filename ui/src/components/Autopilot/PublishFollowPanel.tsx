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
 * The two amber states carry the link too — labelled with their own uncertainty — because a MISSING
 * verdict must not cost a publish that actually landed its only route to the change request.
 *
 * Lives outside AutopilotRail.tsx for the reason VoiceControl.tsx does — the rail's 500-line budget.
 * Raw elements + the rail's CSS module + the inline stroke SVGs from icons.tsx; antd `Tooltip` for
 * the two controls that need explaining.
 */

import { Tooltip } from 'antd'
import { useEffect, useState, useSyncExternalStore } from 'react'

import styles from './AutopilotRail.module.css'
import type { PublishFollowState } from './builderPublishFollow'
import { formatElapsed, type PublishFollowPhase } from './builderPublishStatus'
import { autopilotPublishStore } from './builderPublishStore'
import { AlertIcon, CheckIcon, ClockIcon, SpinnerIcon } from './icons'

// The duration formatter lives in the pure module (builderPublishStatus.ts) because the transcript
// sentence needs it too; re-exported here so the card and its test read it from one place.
export { formatElapsed }

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
const AGE_HINT = 'How long ago this publish was submitted — not how long the portal has been watching it. Check again resumes the watch; it does not restart the clock.'
const HEDGED_LINK_HINT = 'We could not confirm the push landed, so this change request may not exist yet — the page 404s if the branch was never pushed. It is offered because a publish that DID land should not cost you the link.'

/** The elapsed clock is shown while a publish is in flight and on the two states that mean "we do
 *  not know yet" — those are exactly the cards where the age is the deciding fact. */
const SHOWS_AGE: PublishFollowPhase[] = ['pending', 'stalled', 'unreadable']

const PublishCard = ({ state }: { state: PublishFollowState }) => {
  const { branch, destination } = state.target
  const settled = state.phase !== 'pending'
  // While the publish is live the clock reads from the WALL, not from `updatedAt`: the state only
  // changes on a sweep (2–10s apart), and an elapsed time that jumps in poll-sized steps is exactly
  // the "is this thing even alive?" ambiguity the card is here to remove. On a settled card it
  // freezes at the last sweep. Either way it measures from the PUBLISH's start, not this watch's,
  // so a re-checked publish keeps reading its true age.
  const elapsed = formatElapsed((settled ? state.updatedAt : Date.now()) - state.startedAt)

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
        {SHOWS_AGE.includes(state.phase) ? (
          <Tooltip title={state.phase === 'pending' ? PENDING_HINT : AGE_HINT}>
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

      {/* TWO stalls, deliberately worded apart. "3 of 6 committed" is progress we watched happen;
          "nothing rendered at all" is NOT — asserting the publish keeps going there would claim
          something we never saw, and the likelier truth is that the composition is not reconciling
          the claim. Neither sentence is allowed to read as a failure. */}
      {state.phase === 'stalled' ? (
        <div className={styles.apPubNote}>
          {state.total === 0
            ? 'No git resources have been rendered for this claim yet — the builder-publish composition may not be reconciling it. Nothing has failed, and nothing has been pushed.'
            : `${progressLabel(state)} and nothing has failed. The publish keeps going on the cluster — the portal stopped watching.`}
        </div>
      ) : null}

      {state.phase === 'unreadable' ? (
        <div className={styles.apPubNote}>
          The claim was accepted, but the portal could not read its git resources{state.transportError ? ` — ${state.transportError}` : ''}. This is not a failure verdict: it is a missing one.
        </div>
      ) : null}

      <div className={styles.apPubActions}>
        {/* THE PLAIN LINK, AND ONLY HERE: `pushed` is the one state where the change request is
            known to be openable. `pending` and `failed` get nothing at all — in flight it does not
            exist yet, and after a failure it never will, which is the original bug verbatim. */}
        {state.phase === 'pushed' ? (
          <a className={styles.apPubLink} href={state.target.deepLink} rel='noreferrer' target='_blank'>Open change request</a>
        ) : null}
        {/* A MISSING verdict is not a failure, and it must not silently cost a working publish its
            link — on an install where the caller cannot read `localresources`, `unreadable` is the
            only verdict this card will ever reach. So the link is offered with the uncertainty in
            its own label, which is the opposite of presenting it as a change request that exists. */}
        {state.phase === 'stalled' || state.phase === 'unreadable' ? (
          <Tooltip title={HEDGED_LINK_HINT}>
            <a className={styles.apPubLinkHedged} href={state.target.deepLink} rel='noreferrer' target='_blank'>Open change request (only exists if the push landed)</a>
          </Tooltip>
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

  // The live region is mounted UNCONDITIONALLY (and collapsed by `:empty` in CSS). A screen reader
  // announces changes INSIDE an existing live region; one that appears already holding its first
  // card is typically not read out — and the entire failure mode being fixed is a state change
  // nobody was told about, so the first card is the one that must be announced.
  return (
    <div aria-live='polite' className={styles.apPubPanel} data-testid='autopilot-publish-panel' role='status'>
      {follows.map((state) => <PublishCard key={state.key} state={state} />)}
    </div>
  )
}

export default PublishFollowPanel
