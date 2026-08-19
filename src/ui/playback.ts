export type PlaybackStatus = 'playing' | 'paused' | 'stopped'

export function playbackStatus(playing: boolean, stopped = false): PlaybackStatus {
  if (playing) return 'playing'
  return stopped ? 'stopped' : 'paused'
}

export function clampSheet(y: number, collapsed: number): number {
  return Math.min(collapsed, Math.max(0, y))
}

export function snapExpanded(y: number, velocityY: number, collapsed: number): boolean {
  if (collapsed <= 0) return false
  return y + velocityY * 0.16 < collapsed / 2
}

export function detailsOpacity(y: number, collapsed: number): number {
  if (collapsed <= 0) return 1
  return 1 - Math.min(1, Math.max(0, y / collapsed))
}

export function countdownAngle(elapsed: number, duration: number): number {
  if (duration <= 0) return 0
  return (1 - Math.min(1, Math.max(0, elapsed / duration))) * 360
}
