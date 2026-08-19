/** Playlist, holds and blinks of a single replica state. Reads live tables. */

export type HoldRange = [number, number]

const FALLBACK_HOLD: HoldRange = [2000, 3600]

export const FIRST_BLINK_MS: HoldRange = [1500, 7000]
export const BLINK_DUR_MS = 300

export function playlistOf(state: string): number[] {
  const list = window.GROK_TABLES?.EYE_PLAYLIST?.[state]
  return list?.length ? [...list] : [0]
}

export function holdRangeOf(state: string): HoldRange {
  const range = window.GROK_TABLES?.EYE_HOLD_MS?.[state]
  if (!range || range.length < 2) return FALLBACK_HOLD
  return [range[0]!, range[1]!]
}

export function blinkRangeOf(state: string): HoldRange | null {
  const range = window.GROK_TABLES?.BLINK_MS?.[state]
  if (!range || range.length < 2) return null
  return [range[0]!, range[1]!]
}

export function holdMid(range: HoldRange): number {
  return (range[0] + range[1]) / 2
}
