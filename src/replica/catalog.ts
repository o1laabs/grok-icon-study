/** Replica catalogues. Ids stay English; the chrome never uses Bloub's 14-state set. */

export const SHAPE_IDS = [
  'blob',
  'bean',
  'egg',
  'teardrop',
  'cloud',
  'leaf',
  'squircle',
  'capsule'
] as const

export const COLOR_IDS = [
  'black',
  'brown',
  'red',
  'orange',
  'yellow',
  'green',
  'cyan',
  'blue',
  'violet',
  'magenta',
  'gray'
] as const

export const EXPRESSION_IDS = [
  'idle',
  'listening',
  'excited',
  'surprised',
  'suspicious',
  'angry',
  'drowsy',
  'happy',
  'curious',
  'confused',
  'bored',
  'proud',
  'shy',
  'sad',
  'laughing',
  'scared',
  'playful'
] as const

export const GROUP_KEYS = ['lifecycle', 'reactions', 'agent', 'product'] as const

export type ShapeId = (typeof SHAPE_IDS)[number]
export type ColorId = (typeof COLOR_IDS)[number]
export type ExpressionId = (typeof EXPRESSION_IDS)[number]

export const DEFAULT_SHAPE: ShapeId = 'blob'
export const DEFAULT_COLOR: ColorId = 'black'
export const DEFAULT_EXPRESSION: ExpressionId = 'curious'

const FALLBACK_HEX: Record<string, string> = {
  black: '#111111',
  brown: '#855C36',
  red: '#E02135',
  orange: '#E05B00',
  yellow: '#E08600',
  green: '#009957',
  cyan: '#1aa8c4',
  blue: '#0E74E0',
  violet: '#804EE0',
  magenta: '#E02A88',
  gray: '#696969'
}

export function colorHex(id: string): string {
  const ink = window.GROK_TABLES?.INK?.[id]
  if (ink?.lightTo) return ink.lightTo
  return FALLBACK_HEX[id] ?? '#111111'
}

export function colorFill(id: string): string {
  const ink = window.GROK_TABLES?.INK?.[id]
  if (ink?.lightFrom && ink?.lightTo) {
    return `linear-gradient(135deg, ${ink.lightFrom}, ${ink.lightTo})`
  }
  return colorHex(id)
}

export type InkSpec =
  | { kind: 'preset'; id: string }
  | { kind: 'flat'; hex: string }
  | { kind: 'grad'; from: string; to: string; angle: number }
  | { kind: 'radial'; from: string; to: string }

export type InkGrad = { from: string; to: string; angle: number; radial?: boolean }

const HEX6 = /^[0-9a-f]{6}$/i

function hex6(v: string | undefined): string | null {
  const s = (v ?? '').trim().replace(/^#/, '')
  return HEX6.test(s) ? `#${s.toLowerCase()}` : null
}

export function parseInk(v: string): InkSpec {
  if (v.startsWith('g:')) {
    const [a, b, d] = v.slice(2).split('-')
    const from = hex6(a)
    const to = hex6(b)
    const angle = Math.round(Number(d))
    if (from && to && Number.isFinite(angle)) {
      return { kind: 'grad', from, to, angle: Math.min(360, Math.max(0, angle)) }
    }
  }
  if (v.startsWith('r:')) {
    const [a, b] = v.slice(2).split('-')
    const from = hex6(a)
    const to = hex6(b)
    if (from && to) return { kind: 'radial', from, to }
  }
  if (v.startsWith('x:')) {
    const hex = hex6(v.slice(2))
    if (hex) return { kind: 'flat', hex }
  }
  return { kind: 'preset', id: v }
}

export function encodeFlat(hex: string): string {
  return `x:${hex6(hex)?.slice(1) ?? '111111'}`
}

export function encodeGrad(from: string, to: string, angle: number): string {
  const a = hex6(from) ?? '#111111'
  const b = hex6(to) ?? '#111111'
  return `g:${a.slice(1)}-${b.slice(1)}-${Math.round(angle)}`
}

export function encodeRadial(from: string, to: string): string {
  const a = hex6(from) ?? '#111111'
  const b = hex6(to) ?? '#111111'
  return `r:${a.slice(1)}-${b.slice(1)}`
}

export function inkSwatch(v: string): string {
  const spec = parseInk(v)
  if (spec.kind === 'flat') return spec.hex
  if (spec.kind === 'grad') return `linear-gradient(${spec.angle}deg, ${spec.from}, ${spec.to})`
  if (spec.kind === 'radial') return `radial-gradient(circle at 50% 42%, ${spec.from}, ${spec.to})`
  return colorFill(spec.id)
}

export function inkHex(v: string): string {
  const spec = parseInk(v)
  if (spec.kind === 'flat') return spec.hex
  if (spec.kind === 'grad' || spec.kind === 'radial') return spec.from
  return colorHex(spec.id)
}

export function estForme(id: string): id is ShapeId {
  return (SHAPE_IDS as readonly string[]).includes(id)
}

export function liveShapes(): string[] {
  const geo = window.GROK_GEO?.shapes
  if (!geo) return [...SHAPE_IDS]
  return SHAPE_IDS.filter((id) => id in geo)
}

export function stateGroups(): Array<{ key: (typeof GROUP_KEYS)[number]; states: string[] }> {
  const groups = window.GROK_TABLES?.GROUPS
  if (groups?.length) {
    return groups.map((g, i) => ({
      key: GROUP_KEYS[i] ?? 'lifecycle',
      states: g.states
    }))
  }
  return [
    { key: 'lifecycle', states: ['sleeping', 'waking', 'idle', 'listening', 'thinking', 'searching', 'working'] },
    {
      key: 'reactions',
      states: [
        'excited',
        'surprised',
        'suspicious',
        'angry',
        'drowsy',
        'happy',
        'curious',
        'confused',
        'bored',
        'proud',
        'shy',
        'sad',
        'laughing',
        'scared',
        'playful',
        'celebrate'
      ]
    },
    { key: 'agent', states: ['orbit', 'radar', 'progress'] },
    {
      key: 'product',
      states: [
        'spawning',
        'humming',
        'loading',
        'dictating',
        'writing',
        'sending',
        'receiving',
        'uploading',
        'notifying',
        'alerting',
        'dragging',
        'bouncing',
        'powering-down'
      ]
    }
  ]
}

export function defaultCycle(): Array<{ state: string; duration: number }> {
  return [
    { state: 'idle', duration: 2.4 },
    { state: 'curious', duration: 2.2 },
    { state: 'thinking', duration: 2.6 },
    { state: 'orbit', duration: 3.2 },
    { state: 'writing', duration: 2.8 },
    { state: 'celebrate', duration: 2.6 },
    { state: 'sending', duration: 2.4 }
  ]
}
