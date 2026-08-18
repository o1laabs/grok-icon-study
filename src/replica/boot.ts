/** Load local geometry, then the replica IIFE engine. Missing geometry keeps the chrome. */

export type ReplicaBot = {
  setState: (name: string, opts?: { resetEyes?: boolean }) => void
  setShape: (name: string) => void
  setColor: (id: string, scheme?: string) => void
  setFollowPointer: (on: boolean) => void
  setEyeColor: (color: string | null) => void
  setPaused: (on: boolean | 'hold-pose') => void
  spinOnce: (turns?: number) => void
  bounceOnce: () => void
  burstOnce: () => void
  orbitGaze: (ms?: number) => void
  holdFrame: (at?: number) => void
  step: (dt: number) => void
  destroy: () => void
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
