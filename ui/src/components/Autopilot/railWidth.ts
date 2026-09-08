/**
 * The rail's resizable width — its bounds and its localStorage persistence, kept out of
 * `AutopilotRail.tsx` for the reason `VoiceControl.tsx` is: the rail sits at a 500-line budget and
 * this is self-contained, testable arithmetic with no React in it.
 *
 * Persisted the way ThemeModeContext persists its mode: read once at mount, written on drag-END
 * only (never on every pointermove, which would hammer localStorage for the length of a drag).
 */

const RAIL_WIDTH_STORAGE_KEY = 'krateo-autopilot-rail-width'
const RAIL_MIN_WIDTH = 320
const RAIL_MAX_WIDTH = 720
export const RAIL_DEFAULT_WIDTH = 384

/** Kept equal to 640 - 384, the pre-resize `.apRail.open.split` delta, so a never-resized rail is
 *  byte-identical to the old fixed-width behavior. */
export const HISTORY_EXTRA_WIDTH = 256

export const clampRailWidth = (value: number): number => Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, value))

/** The stored width, clamped; the default when nothing (or nonsense) is stored. */
export const getStoredRailWidth = (): number => {
  const stored = Number(localStorage.getItem(RAIL_WIDTH_STORAGE_KEY))
  return Number.isFinite(stored) && stored > 0 ? clampRailWidth(stored) : RAIL_DEFAULT_WIDTH
}

/** Persist the drag's final width (best-effort — a blocked storage must not break a resize). */
export const storeRailWidth = (width: number): void => {
  try {
    localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, String(width))
  } catch {
    /* storage disabled/full — the rail keeps the width for this session and forgets it later */
  }
}
