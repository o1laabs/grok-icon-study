/** Load local geometry, then the replica IIFE engine. Missing geometry keeps the chrome. */

export type ReplicaParts = {
  svg: SVGSVGElement
  body: SVGPathElement
  eyes: SVGPathElement[]
  group: SVGGElement
}

export type ReplicaBot = {
  setState: (name: string, opts?: { resetEyes?: boolean }) => void
  setShape: (name: string) => void
  setColor: (id: string, scheme?: string) => void
  setInk: (flat: string | null) => void
  setInkGrad: (grad: { from: string; to: string; angle: number; radial?: boolean } | null) => void
  setFollowPointer: (on: boolean) => void
  setEyeColor: (color: string | null) => void
  setPaused: (on: boolean | 'hold-pose') => void
  setPose: (pose: { turn?: number; tilt?: number; roll?: number }) => void
  setManualOffset: (offset: { tx?: number; ty?: number; spin?: number }) => void
  setEyeTune: (tune: unknown) => void
  setManualHold: (on: boolean) => void
  flushPerformance: () => void
  parts: () => ReplicaParts
  spinOnce: (turns?: number) => void
  bounceOnce: () => void
  burstOnce: () => void
  orbitGaze: (ms?: number) => void
  holdFrame: (at?: number) => void
  freezeNow: (opts?: { settle?: boolean }) => ReplicaPlayback
  step: (dt: number) => void
  setSize: (px: number) => void
  seekEye: (index: number, opts?: { snap?: boolean }) => void
  setPlaylistHold: (on: boolean) => void
  playback: () => ReplicaPlayback
  destroy: () => void
}

export type ReplicaPlayback = {
  state: string
  eyeIdx: number
  holdMs: number
  remainMs: number
  held: boolean
  frozen: boolean
  manualMix: number
}

declare global {
  interface Window {
    GROK_GEO?: {
      Re?: number
      shapes?: Record<string, unknown>
      palette?: Record<string, { light: string; dark: string }>
    }
    GROK_TABLES?: {
      GROUPS: Array<{ label: string; states: string[] }>
      EYE_PLAYLIST?: Record<string, number[]>
      EYE_HOLD_MS?: Record<string, [number, number]>
      BLINK_MS?: Record<string, [number, number] | null>
      INK: Record<string, { lightFrom?: string; lightTo: string; darkFrom?: string; darkTo?: string }>
    }
    GrokCharacter?: new (svg: SVGSVGElement, opts: Record<string, unknown>) => ReplicaBot
  }
}

let pending: Promise<boolean> | null = null

export function replicaReady(): boolean {
  return typeof window !== 'undefined' && !!window.GROK_GEO?.shapes && typeof window.GrokCharacter === 'function'
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-replica="${src}"]`)
    if (existing) {
      // IIFE already evaluated. replica/src/*.js changes need a full page refresh.
      resolve()
      return
    }
    const el = document.createElement('script')
    el.src = src
    el.dataset.replica = src
    el.onload = () => resolve()
    el.onerror = () => reject(new Error(`replica: failed to load ${src}`))
    document.head.appendChild(el)
  })
}

async function loadOptional(src: string): Promise<boolean> {
  try {
    const res = await fetch(src)
    if (!res.ok) return false
    if (document.querySelector(`script[data-replica="${src}"]`)) return true
    const el = document.createElement('script')
    el.dataset.replica = src
    el.textContent = await res.text()
    document.head.appendChild(el)
    return true
  } catch {
    return false
  }
}

export function loadReplica(): Promise<boolean> {
  if (replicaReady()) return Promise.resolve(true)
  if (pending) return pending
  pending = (async () => {
    try {
      const geo = await loadOptional('/replica/geometry-data.js')
      if (!geo || !window.GROK_GEO) return false
      for (const name of ['math', 'tables', 'pose', 'tricks', 'fx', 'eyes', 'character']) {
        await loadScript(`/replica/src/${name}.js`)
      }
      return replicaReady()
    } catch {
      return false
    }
  })()
  return pending
}
