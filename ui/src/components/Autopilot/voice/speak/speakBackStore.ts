/**
 * SPEAK-BACK STORE — a module-level singleton owning everything about speaking an answer
 * aloud: capability, the per-user preference, the live speaking state, the autoplay
 * refusal, the first-use notice, and the FR 31 live region's text.
 *
 * WHY MODULE-LEVEL (the same reason conversationStore.ts is). The rail and the provider
 * both hang under `<RouterProvider key={routerVersion}>`; a routes-as-data reload remounts
 * that whole subtree and resets every `useState`. A remount mid-answer must not leave the
 * synthesiser talking with no UI able to stop it, and the preference must not blink back
 * to its default. So the state lives outside React and is read through
 * `useSyncExternalStore`.
 *
 * THE TRIGGER, AND THE ONLY TRIGGER (owner's decision, overriding voice spec FR 67's
 * second clause). An answer is spoken when — and only when — the question that produced it
 * was composed PURELY OF DICTATED SEGMENTS with no manual typing mixed in. One typed
 * character makes the turn a typed turn. There is NO per-message "Read aloud" control, no
 * replay of an arbitrary message, and no other way to make Autopilot speak. The published
 * spec proposed such a control as a second trigger so the feature would not "ship dead"
 * while microphone capture is blocked on HTTPS; that proposal is removed, and the
 * consequence is accepted: SPEAK-BACK IS DORMANT UNTIL DICTATION SHIPS. It is built
 * correct rather than reachable.
 *
 *   The one apparent exception is not one: FR 78's "Play answer" appears only after the
 *   browser REFUSED to speak an already-triggered voice turn for lack of user activation,
 *   and it replays that same refused answer. It cannot reach any other message.
 *
 * WHY THE PREFERENCE LIVES IN THE RAIL HEADER. There is no `prefers-reduced-motion`
 * equivalent for audio — no OS signal a page can read meaning "do not speak to me" — and
 * there is no reliable way to detect a screen reader (every heuristic is a fingerprinting
 * technique with a high error rate). A screen-reader user would otherwise hear the answer
 * twice. That cannot be solved by detection, only by control, and because there is no
 * per-message affordance to hang it on, the off switch has to be discoverable in the rail
 * chrome WITHOUT having to trigger speech first (FR 76/77).
 *
 * PERSISTENCE is the defensive `sessionHistoryStore.ts` idiom: every localStorage access
 * in try/catch, unavailable storage degrades to in-memory, nothing ever throws. Only the
 * preference and the notice flag are stored — never a transcript or a spoken rendering
 * (FR 39).
 */

import type { AutopilotActionChip, TurnModality } from '../../types'

import { speakableForMessage } from './speakable'
import { browserSpeechDeps, createSpeaker, type SpeakBackUnavailableReason, type SpeechDeps, type Speaker } from './speechEngine'

/** FR 79: the one console line, per reason — no local voice is the interesting case, since
 *  it is the machine's voice inventory rather than the browser or the operator saying no. */
const UNAVAILABLE_COPY: Readonly<Record<SpeakBackUnavailableReason, string>> = Object.freeze({
  disabled: 'turned off by AUTOPILOT_VOICE_SPEAK_BACK',
  'no-local-voice': 'no local (on-device) voice is installed — a remote voice is never used, so answers are not spoken',
  'no-synthesis': 'this browser has no speechSynthesis',
})

/** FR 31/78: what the live region says when the browser refuses to start audio — the only
 *  announcement speak-back produces on its own (the dictation strings arrive with capture). */
export const REFUSAL_ANNOUNCEMENT = 'The answer was not read aloud: the browser would not start audio on its own. A Play answer button is available above the message box.'

/** FR 76: the per-user preference key. */
export const SPEAK_BACK_PREF_KEY = 'krateo.autopilot.speakback.v1'
/** FR 77: the first-use line is offered once, then never again. */
export const SPEAK_BACK_NOTICE_KEY = 'krateo.autopilot.speakback.notice.v1'

export interface SpeakBackState {
  /**
   * FR 31's live-region text. EMPTY WHILE SPEAKING, always: a screen reader announcing the
   * answer while the synthesiser is also reading it is the duplication this feature is
   * most likely to be disabled over, and it would be one we authored ourselves.
   */
  announcement: string
  /** FR 79: synthesis exists, at least one LOCAL voice exists, and config does not say off. */
  available: boolean
  /** FR 76: the per-user preference, default on. Persisted. */
  enabled: boolean
  /** FR 77: the one dismissible line offering the off switch, after the first spoken answer. */
  noticeVisible: boolean
  /** Why speak-back is unavailable (null when it is available). */
  reason: SpeakBackUnavailableReason | null
  /** FR 78: the id of the answer the browser refused to speak, awaiting a fresh gesture. */
  refusedMessageId: string | null
  /** True while an answer is being spoken. */
  speaking: boolean
}

/** One finalized assistant turn, as speak-back sees it. */
export interface SpeakAnswerInput {
  /** The turn's action chips — only the chip LABEL is ever spoken (FR 71). */
  actions?: AutopilotActionChip[]
  /** The assistant message id, so a refusal knows what to replay. */
  id: string
  /** How the question was asked. Anything but `voice` is silent. */
  modality: TurnModality
  /** The EXACT finalized `message.text` shown in the chat (FR 68). */
  text: string
}

export interface SpeakBackStore {
  /** FR 31 seam: what the live region should say. Dropped while speaking. */
  announce: (text: string) => void
  /** Stop speaking immediately (typing, Escape, Stop, collapse, new turn, thread switch,
   *  unmount, and the barge-in that dictation must perform BEFORE opening the microphone). */
  cancel: () => void
  /** FR 77: hide the first-use line for good. */
  dismissNotice: () => void
  getSnapshot: () => SpeakBackState
  /** Replace the platform seam. Production passes the browser deps; tests pass a fake. */
  installSpeechDeps: (deps: SpeechDeps | null) => void
  /** FR 79: one console line naming why speak-back is unavailable, at most once. */
  logUnavailableOnce: () => void
  /** FR 78: the fresh user gesture that replays the answer the browser refused. Returns
   *  whether it actually started (false when nothing is pending, or the preference /
   *  kill-switch says no) — the caller uses that to move focus to Stop. */
  replayRefused: () => boolean
  /** FR 46/76: the operator kill-switch, from `config.api.AUTOPILOT_VOICE_SPEAK_BACK`. */
  setConfigValue: (value: string | undefined) => void
  setEnabled: (enabled: boolean) => void
  /**
   * Speak a finalized answer, if and only if the turn was asked by voice, the preference is
   * on and the capability is present. Returns whether anything is being spoken.
   */
  speakAnswer: (input: SpeakAnswerInput) => boolean
  subscribe: (listener: () => void) => () => void
  toggleEnabled: () => void
}

/** Best-effort localStorage handle (sessionHistoryStore idiom): null when unavailable. */
const storage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const readFlag = (key: string, fallback: boolean): boolean => {
  try {
    const raw = storage()?.getItem(key)
    if (raw === 'on' || raw === 'off') {
      return raw === 'on'
    }
    return fallback
  } catch {
    return fallback
  }
}

const writeFlag = (key: string, value: boolean): void => {
  try {
    storage()?.setItem(key, value ? 'on' : 'off')
  } catch {
    // Quota / blocked storage: the preference degrades to this tab only. Never throws.
  }
}

/** The speaker's language. `navigator.language` where readable, else a neutral default. */
const uiLanguage = (): string => {
  try {
    return (globalThis as { navigator?: { language?: string } }).navigator?.language || 'en-US'
  } catch {
    return 'en-US'
  }
}

export const createSpeakBackStore = (initialDeps: SpeechDeps | null = browserSpeechDeps()): SpeakBackStore => {
  const listeners = new Set<() => void>()
  let deps: SpeechDeps | null = initialDeps
  let speaker: Speaker | null = deps ? createSpeaker(deps) : null
  let configAllowed = true
  let logged = false
  let logRequested = false
  let voicesListener: (() => void) | null = null
  // The refused answer's words, kept ONLY so FR 78's replay speaks the same string it was
  // refused for. Never persisted (FR 39).
  let refusedSpoken = ''

  let state: SpeakBackState = {
    announcement: '',
    available: false,
    enabled: readFlag(SPEAK_BACK_PREF_KEY, true),
    noticeVisible: false,
    reason: 'no-synthesis',
    refusedMessageId: null,
    speaking: false,
  }

  const emit = (): void => {
    for (const listener of listeners) {
      listener()
    }
  }

  const set = (patch: Partial<SpeakBackState>): void => {
    const next = { ...state, ...patch }
    const changed = (Object.keys(next) as (keyof SpeakBackState)[]).some((key) => next[key] !== state[key])
    if (!changed) {
      return
    }
    state = next
    emit()
  }

  /**
   * FR 79: the one console line, said as late as it takes to be TRUE. The voice inventory
   * loads asynchronously (measured 0 immediately, 210 after ~800 ms on the deployed portal),
   * so an EMPTY list means "not known yet", not "this machine has none" — logging then would
   * tell an operator their machine has no local voice while its list is still loading, and
   * the once-latch would make that wrong line the only one they ever get. So the request is
   * remembered and the line waits for `voiceschanged` to settle the inventory.
   */
  const logUnavailable = (): void => {
    if (logged || !logRequested || state.available) {
      return
    }
    if (state.reason === 'no-local-voice' && deps && deps.synthesis.getVoices().length === 0) {
      return
    }
    logged = true
    const why = UNAVAILABLE_COPY[state.reason ?? 'no-synthesis']
    // eslint-disable-next-line no-console
    console.info(`[autopilot] speak-back unavailable: ${why}`)
  }

  /** FR 79: available iff synthesis exists AND a LOCAL voice exists AND config is not off. */
  const refreshCapability = (): void => {
    if (!configAllowed) {
      set({ available: false, reason: 'disabled' })
    } else if (!deps) {
      set({ available: false, reason: 'no-synthesis' })
    } else {
      // Re-run on `voiceschanged` rather than trusted once — see logUnavailable above.
      const hasLocal = deps.synthesis.getVoices().some((voice) => voice.localService === true)
      set({ available: hasLocal, reason: hasLocal ? null : 'no-local-voice' })
    }
    logUnavailable()
  }

  const detachVoices = (): void => {
    if (deps && voicesListener) {
      deps.synthesis.removeEventListener?.('voiceschanged', voicesListener)
    }
    voicesListener = null
  }

  const attachVoices = (): void => {
    detachVoices()
    if (!deps?.synthesis.addEventListener) {
      return
    }
    voicesListener = () => refreshCapability()
    deps.synthesis.addEventListener('voiceschanged', voicesListener)
  }

  /**
   * Stop, and DROP ANY PENDING REPLAY with it. The refusal is an offer to finish speaking
   * ONE specific answer; every caller of cancel() — a new turn, a thread switch, the off
   * switch, the operator kill-switch, collapse, unmount — is an event after which that
   * offer is no longer true. Left standing, "Play answer" would outlive its own thread and
   * read an answer that is no longer written anywhere on screen: the exact
   * heard-but-not-recorded failure the single-trigger rule exists to prevent.
   */
  const cancel = (): void => {
    speaker?.cancel()
    refusedSpoken = ''
    set({ announcement: '', refusedMessageId: null, speaking: false })
  }

  const startSpeaking = (spoken: string, messageId: string): boolean => {
    if (!speaker) {
      return false
    }
    const started = speaker.speak(spoken, uiLanguage(), {
      onFinished: () => set({ speaking: false }),
      onRefused: () => {
        refusedSpoken = spoken
        // ANNOUNCE THE REFUSAL (FR 31/78). This is the one moment where a user who cannot see
        // the composer learns NOTHING otherwise: no audio plays, the answer bubble updates
        // with no announcement (deliberately — the transcript is in no live region), and the
        // recovery is a button that just appeared. Safe to announce here and nowhere else on
        // this path: speech is not playing, so the region cannot talk over it.
        set({ announcement: REFUSAL_ANNOUNCEMENT, refusedMessageId: messageId, speaking: false })
      },
    })
    if (!started) {
      // No local voice at the moment of speaking (the inventory can change) — treat it as
      // unavailability, never as a reason to reach for a remote voice.
      refreshCapability()
      return false
    }
    // FR 77: the first answer ever spoken offers the off switch inline, once.
    const firstTime = !readFlag(SPEAK_BACK_NOTICE_KEY, false)
    if (firstTime) {
      writeFlag(SPEAK_BACK_NOTICE_KEY, true)
    }
    // The live region falls silent for the duration (FR 31).
    set({ announcement: '', noticeVisible: firstTime || state.noticeVisible, refusedMessageId: null, speaking: true })
    return true
  }

  attachVoices()
  refreshCapability()

  return {
    announce: (text) => {
      if (state.speaking) {
        return
      }
      set({ announcement: text })
    },
    cancel,
    dismissNotice: () => set({ noticeVisible: false }),
    getSnapshot: () => state,
    installSpeechDeps: (next) => {
      cancel()
      detachVoices()
      deps = next
      speaker = next ? createSpeaker(next) : null
      logged = false
      refusedSpoken = ''
      set({ refusedMessageId: null })
      attachVoices()
      refreshCapability()
    },
    logUnavailableOnce: () => {
      logRequested = true
      logUnavailable()
    },
    replayRefused: () => {
      const messageId = state.refusedMessageId
      // The SAME predicate speakAnswer applies. The replay is a second attempt at one
      // already-triggered answer, not a second trigger — so the preference and the operator
      // kill-switch decide it exactly as they decided the first attempt. Without this, turning
      // speak-back off (or an operator removing it entirely) would leave one working button
      // that still speaks.
      if (!messageId || !refusedSpoken || !state.enabled || !state.available) {
        return false
      }
      return startSpeaking(refusedSpoken, messageId)
    },
    setConfigValue: (value) => {
      configAllowed = value !== 'off'
      if (!configAllowed) {
        cancel()
      }
      refreshCapability()
    },
    setEnabled: (enabled) => {
      if (!enabled) {
        cancel()
      }
      writeFlag(SPEAK_BACK_PREF_KEY, enabled)
      set({ enabled })
    },
    speakAnswer: (input) => {
      // A new turn always silences the previous one, spoken or not (FR 45/75).
      cancel()
      if (input.modality !== 'voice' || !state.enabled || !state.available) {
        return false
      }
      const spoken = speakableForMessage({ actions: input.actions, text: input.text })
      if (!spoken) {
        return false
      }
      return startSpeaking(spoken, input.id)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    toggleEnabled: () => {
      const enabled = !state.enabled
      if (!enabled) {
        cancel()
      }
      writeFlag(SPEAK_BACK_PREF_KEY, enabled)
      set({ enabled })
    },
  }
}

/**
 * The app-wide singleton. Module scope, so it outlives every rail/provider remount and a
 * remount mid-answer cannot orphan a talking synthesiser. One rail per app → one voice.
 */
export const autopilotSpeakBackStore = createSpeakBackStore()
