import { clamp, type HeadPose } from './math'

export type EyeSide = {
  width: number
  height: number
  size: number
  angle: number
  x: number
  y: number
}

export type EyeTune = {
  left: EyeSide
  right: EyeSide
  spacing: number
}

export type EyeLinks = { width: boolean; height: boolean; size: boolean; rotation: boolean }

export type BodyOffset = { tx: number; ty: number; spin: number }

export type ManualPart = 'body' | 'left' | 'right'

export type ManualState = {
  on: boolean
  pose: HeadPose
  offset: BodyOffset
  eyes: EyeTune
  links: EyeLinks
  selected: ManualPart | null
}

export const DEFAULT_POSE: HeadPose = { turn: 17, tilt: -14, roll: 29 }

export const DEFAULT_OFFSET: BodyOffset = { tx: 0, ty: 0, spin: 0 }

export const DEFAULT_EYE: EyeSide = { width: 20, height: 50, size: 1, angle: 0, x: 0, y: -7 }

export const DEFAULT_EYES: EyeTune = {
  left: { ...DEFAULT_EYE },
  right: { ...DEFAULT_EYE },
  spacing: 35
}

export const DEFAULT_LINKS: EyeLinks = { width: true, height: true, size: true, rotation: true }

export const defaultManual = (): ManualState => ({
  on: false,
  pose: { ...DEFAULT_POSE },
  offset: { ...DEFAULT_OFFSET },
  eyes: {
    left: { ...DEFAULT_EYE },
    right: { ...DEFAULT_EYE },
    spacing: 35
  },
  links: { ...DEFAULT_LINKS },
  selected: null
})

const num = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const arrondi = (value: number, decimales = 1) => Number(value.toFixed(decimales))

const eyeOf = (value: unknown, fallback: EyeSide): EyeSide => {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const width = num(raw.width, fallback.width)
  const height = num(raw.height, fallback.height)
  return {
    width: arrondi(clamp(width <= 5 ? width * 20 : width, 10, 110)),
    height: arrondi(clamp(height <= 5 ? height * 50 : height, 10, 110)),
    size: arrondi(clamp(num(raw.size, fallback.size), 0.35, 2.2), 2),
    angle: arrondi(num(raw.angle, fallback.angle)),
    x: arrondi(clamp(num(raw.x, fallback.x), -48, 48)),
    y: arrondi(clamp(num(raw.y, fallback.y), -48, 48))
  }
}

export const clampPose = (pose: HeadPose): HeadPose => ({
  turn: arrondi(clamp(pose.turn, -365, 365)),
  tilt: arrondi(clamp(pose.tilt, -365, 365)),
  roll: arrondi(clamp(pose.roll, -365, 365))
})

export const clampOffset = (offset: BodyOffset): BodyOffset => ({
  tx: arrondi(clamp(offset.tx, -90, 90)),
  ty: arrondi(clamp(offset.ty, -90, 90)),
  spin: arrondi(clamp(offset.spin, -180, 180))
})

export const clampEyes = (eyes: EyeTune): EyeTune => ({
  left: eyeOf(eyes.left, DEFAULT_EYE),
  right: eyeOf(eyes.right, DEFAULT_EYE),
  spacing: arrondi(
    clamp(
      (() => {
        const value = num(eyes.spacing, 35)
        return value <= 5 ? value * 35 : value
      })(),
      0,
      150
    )
  )
})

export const parseManual = (raw: string | null): ManualState => {
  const base = defaultManual()
  if (!raw) return base
  try {
    const data = JSON.parse(raw) as Record<string, unknown>
    const pose = data.pose && typeof data.pose === 'object' ? (data.pose as HeadPose) : base.pose
    const offset =
      data.offset && typeof data.offset === 'object' ? (data.offset as BodyOffset) : base.offset
    const eyes = data.eyes && typeof data.eyes === 'object' ? (data.eyes as EyeTune) : base.eyes
    const links = data.links && typeof data.links === 'object' ? (data.links as EyeLinks) : base.links
    const selected =
      data.selected === 'body' || data.selected === 'left' || data.selected === 'right'
        ? data.selected
        : null
    return {
      on: !!data.on,
      pose: clampPose({
        turn: num(pose.turn, DEFAULT_POSE.turn),
        tilt: num(pose.tilt, DEFAULT_POSE.tilt),
        roll: num(pose.roll, DEFAULT_POSE.roll)
      }),
      offset: clampOffset({
        tx: num(offset.tx, 0),
        ty: num(offset.ty, 0),
        spin: num(offset.spin, 0)
      }),
      eyes: clampEyes(eyes),
      links: {
        width: links.width !== false,
        height: links.height !== false,
        size: links.size !== false,
        rotation: links.rotation !== false
      },
      selected
    }
  } catch {
    return base
  }
}

export const persistable = (state: ManualState) => ({
  on: state.on,
  pose: state.pose,
  offset: state.offset,
  eyes: state.eyes,
  links: state.links
})

export const updateEye = (
  eyes: EyeTune,
  side: 'left' | 'right',
  patch: Partial<EyeSide>,
  links: EyeLinks
): EyeTune => {
  const next = {
    left: { ...eyes.left },
    right: { ...eyes.right },
    spacing: eyes.spacing
  }
  next[side] = { ...next[side], ...patch }
  const other = side === 'left' ? 'right' : 'left'
  ;(['width', 'height', 'size'] as const).forEach((key) => {
    if (patch[key] != null && links[key]) next[other][key] = patch[key]!
  })
  return clampEyes(next)
}

export const scaleEye = (
  eyes: EyeTune,
  side: 'left' | 'right',
  factor: number,
  linked: boolean
): EyeTune => {
  const apply = (eye: EyeSide): EyeSide => ({
    ...eye,
    width: clamp(eye.width * factor, 10, 110),
    height: clamp(eye.height * factor, 10, 110)
  })
  const next = {
    left: { ...eyes.left },
    right: { ...eyes.right },
    spacing: eyes.spacing
  }
  next[side] = apply(next[side])
  if (linked) {
    const other = side === 'left' ? 'right' : 'left'
    next[other] = apply(next[other])
  }
  return clampEyes(next)
}

export const resetHead = (state: ManualState): ManualState => ({
  ...state,
  pose: { ...DEFAULT_POSE }
})

export const resetBody = (state: ManualState): ManualState => ({
  ...state,
  offset: { ...DEFAULT_OFFSET }
})

export const resetEyes = (state: ManualState): ManualState => ({
  ...state,
  eyes: {
    left: { ...DEFAULT_EYE },
    right: { ...DEFAULT_EYE },
    spacing: 35
  }
})

export const resetAll = (state: ManualState): ManualState => ({
  ...state,
  pose: { ...DEFAULT_POSE },
  offset: { ...DEFAULT_OFFSET },
  eyes: {
    left: { ...DEFAULT_EYE },
    right: { ...DEFAULT_EYE },
    spacing: 35
  },
  selected: null
})
