/**
 * What the rail says after a publish is compiled — factored out of AutopilotProvider.finalize (which
 * is at its 500-line cap) so the honesty rules live somewhere they can be read and tested.
 *
 * THE RULE THIS FILE ENFORCES: the "Open change request" link is a claim about the world, and it may
 * only be made once the world agrees. Four gates, in order:
 *   1. a denial never dispatches and never links;
 *   2. a DECLINED blast-radius confirm wrote nothing, so it never links either (the old code linked
 *      here regardless — a smaller version of the same lie);
 *   3. a REJECTED write (403 on `builderpublishes`, 409 AlreadyExists on a re-publish, a webhook
 *      refusal, a snowplow 5xx) created no claim, so there is nothing to watch and nothing to open.
 *      A dispatched set is not an accepted one: `runRestSet` returns its results array either way,
 *      so "the chip is non-null" says only that the human confirmed. Watching a claim the apiserver
 *      refused would spin for five minutes and then tell the user, in the transcript, that a
 *      publish that never existed is "still running on the cluster" — a fresh false reassurance on
 *      top of a real error, which is the same defect this file exists to close;
 *   4. an ACCEPTED claim starts a FOLLOW and the link is withheld from the transcript entirely; the
 *      rail's publish card offers it only when the git-provider children report the push landed.
 * The legacy github path (and any install with no snowplow base URL to watch through) keeps the old
 * immediate link, because there is nothing there to follow — an unwatched publish is a known,
 * declared limitation rather than a silent one.
 */

import type { Config } from '../../context/ConfigContext'
import type { WriteOrigin } from '../../hooks/provenance'

import type { PortalActionProposal } from './actionBridge'
import { createPublishAnnouncer, startPublishFollow, type PublishFollowSeed } from './builderPublishStore'
import type { PublishCompileResult } from './publishCompile'
import type { AutopilotActionChip } from './types'

export interface PublishOutcomeArgs {
  /** The turn's chip list — appended to in place, exactly as finalize's other branches do. */
  chips: AutopilotActionChip[]
  compiled: PublishCompileResult
  label: string | undefined
  deepLink: string | null
  /** The claim's follow coordinates (SCM-agnostic path only; null on the github path). */
  follow: PublishFollowSeed | null
  config: Config | undefined
  apply: (proposal: PortalActionProposal, origin?: WriteOrigin) => Promise<AutopilotActionChip | null>
  origin: WriteOrigin
}

export const pushPublishOutcome = async (args: PublishOutcomeArgs): Promise<void> => {
  const { apply, chips, compiled, config, deepLink, follow, label, origin } = args
  if (compiled.denial !== null) {
    chips.push({ label: compiled.denial, readOnly: true, verb: 'applyResourceSet' })
    return
  }
  if (!compiled.ops) {
    return
  }
  const applied = await apply({ label, ops: compiled.ops, verb: 'applyResourceSet' }, origin)
  if (applied) {
    chips.push(applied)
  }
  // Gate 2: declined at the confirm ⇒ nothing was written. No branch, no change request, no follow.
  if (!applied) {
    return
  }
  // Gate 3: dispatched but REFUSED ⇒ no claim was created. The chip already carries the server's
  // own message; adding a follow or a link on top of it would contradict it.
  if (applied.ok === false) {
    return
  }
  // Gate 4: the claim exists; the push does NOT yet. Start watching its git-provider children and
  // say only what is true — "publishing". The link moves to the rail's card, which earns it later.
  if (follow && startPublishFollow(follow, config, createPublishAnnouncer())) {
    chips.push({ label: `publishing to ${follow.destination} · ${follow.branch}`, readOnly: true, verb: 'publishBranch' })
    return
  }
  if (deepLink) {
    // Unwatched path (legacy github ops, or no snowplow base URL): the human opens the PR/MR.
    chips.push({ label: 'Open change request', readOnly: true, url: deepLink, verb: 'openChangeRequest' })
  }
}
