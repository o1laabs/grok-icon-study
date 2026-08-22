<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '@/i18n'
import {
  openRingPath,
  projectEyePoint,
  projectFacePoint,
  RADIUS,
  roundedRectangle,
  rotatePoseAroundAxis,
  rotatePoseAroundCamera,
  rotatePoseWithArcball,
  rotationRing,
  splitRingArcs,
  unitVector,
  type HeadPose,
  type Point3
} from '@/ui/pose/math'
import { surfaceOf, wirePaths } from '@/ui/pose/surface'
import {
  clampEyes,
  clampPose,
  DEFAULT_EYE,
  DEFAULT_POSE,
  scaleEye,
  updateEye,
  type EyeSide,
  type EyeTune,
  type ManualPart,
  type ManualState
} from '@/ui/pose/model'
import {
  beginManipulation,
  finishManipulation,
  previewManipulation,
  type ManipulationSession
} from '@/ui/pose/session'
import { localHeadRadius, overlayToHost, toLocal, type LocalPoint } from '@/ui/pose/space'

export type HeroHandle = {
  parts: () => {
    svg: SVGSVGElement
    body: SVGPathElement
    eyes: SVGPathElement[]
    group: SVGGElement
  } | null
}

const props = withDefaults(
  defineProps<{
    manual: ManualState
    hero: HeroHandle | null
    shape?: string
    echelle?: number
  }>(),
  { echelle: 1 }
)

const emit = defineEmits<{
  'update:pose': [HeadPose]
  'update:selected': [ManualPart | null]
  'update:eyes': [EyeTune]
}>()

const gizmoSvg = ref<SVGSVGElement | null>(null)
const manualLayer = ref<HTMLDivElement | null>(null)
const overlayStyle = ref<Record<string, string>>({})
const pose = computed(() => props.manual.pose)
const selected = computed(() => props.manual.selected)
const eyes = computed(() => props.manual.eyes)
const headRadius = ref(95)

const rings = computed(() => {
  const split = (axis: 'x' | 'y' | 'z') => {
    const { front, back } = splitRingArcs(rotationRing(pose.value, axis))
    return {
      front: front.map(openRingPath).filter(Boolean),
      back: back.map(openRingPath).filter(Boolean)
    }
  }
  return { x: split('x'), y: split('y'), z: split('z') }
})

const activeAxis = ref<'x' | 'y' | 'z' | 'view' | null>(null)
let wireGroup: SVGGElement | null = null
const eyeShown: Record<'left' | 'right', boolean | null> = { left: null, right: null }

type EyeHandle = 'width' | 'height' | 'size' | 'spacing' | 'rotate'

type Drag =
  | { kind: 'arcball'; start: LocalPoint; pose: HeadPose; radius: number }
  | {
      kind: 'axis'
      axis: 'x' | 'y' | 'z'
      start: LocalPoint
      tangent: LocalPoint
      pose: HeadPose
    }
  | { kind: 'view'; startAngle: number; pose: HeadPose }
  | {
      kind: 'eye'
      handle: EyeHandle
      side: 'left' | 'right'
      start: LocalPoint
      eyes: EyeTune
      center: LocalPoint
      widthAxis: LocalPoint
      heightAxis: LocalPoint
      spacingAxis: LocalPoint
      startAngle: number
      startDistance: number
      scaleX: number
      scaleY: number
    }

const drag = ref<Drag | null>(null)
let poseSession: ManipulationSession<HeadPose> | null = null
let eyeSession: ManipulationSession<EyeTune> | null = null

type EyeFrame = {
  visible: boolean
  available: boolean
  center: LocalPoint
  widthAxis: LocalPoint
  heightAxis: LocalPoint
  widthHandle: LocalPoint
  heightHandle: LocalPoint
  rotateHandle: LocalPoint
  sizeHandle: LocalPoint
  outline: string
  width: number
  height: number
  scaleX: number
  scaleY: number
  plusX: number
  plusY: number
  minusY: number
  faceX: number
  faceY: number
}

const emptyFrame = (): EyeFrame => ({
  visible: false,
  available: false,
  center: [0, 0],
  widthAxis: [1, 0],
  heightAxis: [0, 1],
  widthHandle: [0, 0],
  heightHandle: [0, 0],
  rotateHandle: [0, 0],
  sizeHandle: [0, 0],
  outline: '',
  width: DEFAULT_EYE.width,
  height: DEFAULT_EYE.height,
  scaleX: 1,
  scaleY: 1,
  plusX: DEFAULT_EYE.width / 2,
  plusY: DEFAULT_EYE.height / 2,
  minusY: -DEFAULT_EYE.height / 2,
  faceX: 0,
  faceY: 0
})

const leftFrame = ref<EyeFrame>(emptyFrame())
const rightFrame = ref<EyeFrame>(emptyFrame())

const sceneSvg = () => props.hero?.parts()?.svg ?? null

const syncOverlay = () => {
  const host = sceneSvg()
  const layer = manualLayer.value
  if (!host || !layer) return
  /*
   * Les rects ecran incluent l'echelle photo du sujet ; l'overlay vit
   * lui-meme dans le sujet mis a l'echelle — diviser par `echelle` rend
   * sa boite CSS pre-transform, sinon la geometry serait comptee deux fois.
   */
  const hostBox = host.getBoundingClientRect()
  const layerBox = layer.getBoundingClientRect()
  overlayStyle.value = {
    left: `${((hostBox.left - layerBox.left) / props.echelle).toFixed(2)}px`,
    top: `${((hostBox.top - layerBox.top) / props.echelle).toFixed(2)}px`,
    right: 'auto',
    bottom: 'auto',
    width: `${(hostBox.width / props.echelle).toFixed(2)}px`,
    height: `${(hostBox.height / props.echelle).toFixed(2)}px`
  }
}

const localOf = (event: PointerEvent): LocalPoint | null =>
  toLocal(sceneSvg(), event.clientX, event.clientY)

const gizmoOf = (event: PointerEvent): LocalPoint | null => {
  const svg = gizmoSvg.value
  if (!svg) return null
  const rectangle = svg.getBoundingClientRect()
  if (rectangle.width < 1) return null
  return [
    ((event.clientX - rectangle.left) / rectangle.width) * 86 - 43,
    ((event.clientY - rectangle.top) / rectangle.height) * 86 - 43
  ]
}

const line = (from: LocalPoint, to: LocalPoint) =>
  `M${from[0].toFixed(2)} ${from[1].toFixed(2)}L${to[0].toFixed(2)} ${to[1].toFixed(2)}`

const commitPose = (next: HeadPose) => emit('update:pose', clampPose(next))
const commitEyes = (next: EyeTune) => emit('update:eyes', clampEyes(next))

const xy = (point: Point3): LocalPoint => [point[0], point[1]]

const overlayPath = (points: Point3[]) => {
  if (points.length < 2) return ''
  return `M${points.map((point) => `${point[0].toFixed(2)} ${point[1].toFixed(2)}`).join('L')}Z`
}

const hostPath = (host: SVGSVGElement | null, points: Point3[]) => {
  const mapped = points
    .map((point) => overlayToHost(host, point[0], point[1]))
    .filter((point): point is LocalPoint => !!point)
  if (mapped.length < 2) return ''
  return `M${mapped.map((point) => `${point[0].toFixed(2)} ${point[1].toFixed(2)}`).join('L')}Z`
}

const offsetAlong = (origin: LocalPoint, axis: LocalPoint, distance: number): LocalPoint => [
  origin[0] + axis[0] * distance,
  origin[1] + axis[1] * distance
]

const readEye = (tune: EyeSide, side: 'left' | 'right'): EyeFrame => {
  const faceX = (side === 'left' ? -1 : 1) * eyes.value.spacing / 2 + tune.x
  const faceY = tune.y
  const width = Math.max(tune.width, 1)
  const height = Math.max(tune.height, 1)
  const project = (localX: number, localY: number) =>
    projectEyePoint(pose.value, faceX, faceY, localX, localY, tune.angle, DEFAULT_POSE)
  const outline = roundedRectangle(width, height).map(([localX, localY]) =>
    project(localX, localY)
  )
  const center = xy(project(0, 0))
  // Same visibility hysteresis as the engine eyes: drag jitter around the
  // silhouette boundary must not pop the editor handles in and out.
  const zAvg = outline.reduce((sum, point) => sum + point[2], 0) / Math.max(outline.length, 1)
  let shown = eyeShown[side] ?? zAvg > 0
  if (shown && zAvg < -0.006) shown = false
  if (!shown && zAvg > 0.004) shown = true
  eyeShown[side] = shown
  const widthHandle = xy(project(width / 2 + 9, 0))
  const heightHandle = xy(project(0, -height / 2 - 9))
  const rotateHandle = xy(project(0, -height / 2 - 30))
  const sizeHandle = xy(project(width / 2 + 11, height / 2 + 11))
  const plusX = Math.hypot(widthHandle[0] - center[0], widthHandle[1] - center[1])
  const minusY = -Math.hypot(heightHandle[0] - center[0], heightHandle[1] - center[1])
  return {
    visible: shown,
    available: true,
    center,
    widthAxis: unitVector(center, widthHandle),
    heightAxis: unitVector(center, [
      center[0] - (heightHandle[0] - center[0]),
      center[1] - (heightHandle[1] - center[1])
    ]),
    widthHandle,
    heightHandle,
    rotateHandle,
    sizeHandle,
    outline: overlayPath(outline),
    width,
    height,
    scaleX: (2 * Math.max(plusX - 9, 0.001)) / width,
    scaleY: (2 * Math.max(-minusY - 9, 0.001)) / height,
    plusX,
    plusY: Math.abs(minusY),
    minusY,
    faceX,
    faceY
  }
}

const paintStadiums = () => {
  const parts = props.hero?.parts()
  const host = sceneSvg()
  if (!parts || !host) return
  ;(['left', 'right'] as const).forEach((side, index) => {
    const el = parts.eyes[index]
    const frame = side === 'left' ? leftFrame.value : rightFrame.value
    if (!el) return
    const tune = eyes.value[side]
    const outline = roundedRectangle(frame.width, frame.height).map(([localX, localY]) =>
      projectEyePoint(
        pose.value,
        frame.faceX,
        frame.faceY,
        localX,
        localY,
        tune.angle,
        DEFAULT_POSE
      )
    )
    el.setAttribute('d', hostPath(host, outline))
    el.removeAttribute('transform')
    el.style.display = frame.visible ? '' : 'none'
  })
}

const sampleEyes = () => {
  const host = sceneSvg()
  leftFrame.value = readEye(eyes.value.left, 'left')
  rightFrame.value = readEye(eyes.value.right, 'right')
  paintStadiums()
  headRadius.value = localHeadRadius(host, engineRadius())
}

const downOf = (frame: EyeFrame): LocalPoint => unitVector(frame.heightHandle, frame.center)

const spacingPoint = (left: EyeFrame, right: EyeFrame, selected: EyeFrame): LocalPoint => {
  const midX = (eyes.value.left.x + eyes.value.right.x) / 2
  const midY = (eyes.value.left.y + eyes.value.right.y) / 2
  const point = projectFacePoint(
    pose.value,
    midX,
    midY + selected.height / 2 + 34,
    RADIUS,
    [0, 0],
    DEFAULT_POSE
  )
  if (Number.isFinite(point[0]) && Number.isFinite(point[1])) return [point[0], point[1]]
  return offsetAlong(
    [(left.center[0] + right.center[0]) / 2, (left.center[1] + right.center[1]) / 2],
    downOf(selected),
    selected.height / 2 + 34
  )
}

const editor = computed(() => {
  const side: 'left' | 'right' | null =
    selected.value === 'left' ? 'left' : selected.value === 'right' ? 'right' : null
  if (!side) return null
  const frame = side === 'left' ? leftFrame.value : rightFrame.value
  if (!frame.visible) return null
  const other = side === 'left' ? rightFrame.value : leftFrame.value
  const both = other.available
  const mid: LocalPoint = both
    ? [(frame.center[0] + other.center[0]) / 2, (frame.center[1] + other.center[1]) / 2]
    : frame.center
  const spacingHandle = both
    ? spacingPoint(frame, other, frame)
    : offsetAlong(frame.center, downOf(frame), frame.plusY + 34)
  return {
    side,
    frame,
    other,
    both,
    mid,
    spacingHandle,
    widthGuide: line(frame.center, frame.widthHandle),
    heightGuide: line(frame.center, frame.heightHandle),
    rotationGuide: line(frame.heightHandle, frame.rotateHandle),
    spacingGuide: both
      ? `${line(frame.center, other.center)}${line(mid, spacingHandle)}`
      : line(frame.center, spacingHandle)
  }
})

const draggingHead = computed(() => !!drag.value && drag.value.kind !== 'eye')
const draggingHandle = computed(() => drag.value?.kind === 'eye')
const showWire = draggingHead

const engineRadius = () => window.GROK_GEO?.Re ?? 114.27

const ensureWires = () => {
  const parts = props.hero?.parts()
  if (!parts) return null
  if (wireGroup?.isConnected) return wireGroup
  const ns = 'http://www.w3.org/2000/svg'
  const group = document.createElementNS(ns, 'g')
  group.setAttribute('class', 'manual-wires')
  group.setAttribute('aria-hidden', 'true')
  const clip = parts.svg.querySelector('clipPath')
  if (clip?.id) group.setAttribute('clip-path', `url(#${clip.id})`)
  parts.body.insertAdjacentElement('afterend', group)
  wireGroup = group
  return group
}

const paintWires = () => {
  const group = ensureWires()
  if (!group) return
  const radius = engineRadius()
  const paths = showWire.value
    ? wirePaths(pose.value, surfaceOf(props.shape || 'blob'), [radius, radius])
    : []
  const ns = 'http://www.w3.org/2000/svg'
  while (group.childNodes.length > paths.length) group.lastChild?.remove()
  paths.forEach((d, index) => {
    let path = group.childNodes[index] as SVGPathElement | undefined
    if (!path) {
      path = document.createElementNS(ns, 'path')
      path.setAttribute('class', 'wire')
      group.appendChild(path)
    }
    path.setAttribute('d', d)
  })
}

const paintFocus = () => {
  const parts = props.hero?.parts()
  if (!parts) return
  const ns = 'http://www.w3.org/2000/svg'
  let ring = parts.group.querySelector('.manual-head-outline') as SVGPathElement | null
  if (draggingHead.value) {
    if (!ring) {
      ring = document.createElementNS(ns, 'path')
      ring.setAttribute('class', 'manual-head-outline')
      parts.group.appendChild(ring)
    }
    ring.setAttribute('d', parts.body.getAttribute('d') || '')
  } else {
    ring?.remove()
  }
  const left = parts.eyes[0]
  const right = parts.eyes[1]
  left?.classList.toggle('cyan-outline', selected.value === 'left')
  right?.classList.toggle('cyan-outline', selected.value === 'right')
}

const clearDecor = () => {
  wireGroup?.remove()
  wireGroup = null
  const parts = props.hero?.parts()
  if (parts) parts.body.style.cursor = ''
  parts?.group.querySelector('.manual-head-outline')?.remove()
  parts?.eyes.forEach((el) => {
    el.classList.remove('cyan-outline')
    el.style.cursor = ''
    el.style.display = ''
    el.removeAttribute('transform')
  })
}

const detachDrag = () => {
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointerup', stop)
  window.removeEventListener('pointercancel', cancel)
}

const attachDrag = (event: PointerEvent) => {
  event.preventDefault()
  ;(event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', cancel)
}

const setBodyCursor = (cursor: string) => {
  const parts = props.hero?.parts()
  if (!parts) return
  parts.body.style.cursor = cursor
}

const selectBody = () => {
  if (selected.value !== 'body') emit('update:selected', 'body')
}

const isEyeTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false
  if (target.closest('.editor-control')) return true
  const eyes = props.hero?.parts()?.eyes
  return !!eyes?.some((el) => el === target || el.contains(target))
}

const startArcball = (event: PointerEvent) => {
  const point = localOf(event)
  if (!point) return
  selectBody()
  poseSession = beginManipulation(pose.value)
  drag.value = {
    kind: 'arcball',
    start: point,
    pose: pose.value,
    radius: headRadius.value
  }
  setBodyCursor('grabbing')
  attachDrag(event)
}

const startAxis = (axis: 'x' | 'y' | 'z', event: PointerEvent) => {
  event.stopPropagation()
  const point = gizmoOf(event)
  if (!point) return
  const ring = rotationRing(pose.value, axis)
  let closest = 0
  let best = Infinity
  ring.slice(0, -1).forEach((ringPoint, index) => {
    const distance = Math.hypot(ringPoint[0] - point[0], ringPoint[1] - point[1])
    if (distance < best) {
      closest = index
      best = distance
    }
  })
  const previous = ring[(closest - 1 + ring.length - 1) % (ring.length - 1)]!
  const next = ring[(closest + 1) % (ring.length - 1)]!
  poseSession = beginManipulation(pose.value)
  activeAxis.value = axis
  drag.value = {
    kind: 'axis',
    axis,
    start: point,
    tangent: unitVector(previous, next),
    pose: pose.value
  }
  attachDrag(event)
}

const startView = (event: PointerEvent) => {
  event.stopPropagation()
  const point = gizmoOf(event)
  if (!point) return
  poseSession = beginManipulation(pose.value)
  activeAxis.value = 'view'
  drag.value = { kind: 'view', startAngle: Math.atan2(point[1], point[0]), pose: pose.value }
  attachDrag(event)
}

const startHandle = (handle: EyeHandle, event: PointerEvent) => {
  event.stopPropagation()
  const live = editor.value
  if (!live) return
  const point = localOf(event)
  if (!point) return
  eyeSession = beginManipulation(eyes.value)
  const left = leftFrame.value
  const right = rightFrame.value
  const both = left.visible && right.visible
  const spacingFrom = both ? left.center : live.frame.center
  const spacingTo = both ? right.center : live.spacingHandle
  drag.value = {
    kind: 'eye',
    handle,
    side: live.side,
    start: point,
    eyes: eyes.value,
    center: live.frame.center,
    widthAxis: unitVector(live.frame.center, live.frame.widthHandle),
    heightAxis: unitVector(live.frame.center, live.frame.heightHandle),
    spacingAxis: unitVector(spacingFrom, spacingTo),
    startAngle: Math.atan2(point[1] - live.frame.center[1], point[0] - live.frame.center[0]),
    startDistance: Math.max(
      Math.hypot(point[0] - live.frame.center[0], point[1] - live.frame.center[1]),
      1
    ),
    scaleX: live.frame.scaleX,
    scaleY: live.frame.scaleY
  }
  attachDrag(event)
}

const move = (event: PointerEvent) => {
  const interaction = drag.value
  if (!interaction) return
  if (interaction.kind === 'arcball') {
    const point = localOf(event)
    if (!point) return
    const next = rotatePoseWithArcball(
      interaction.pose,
      interaction.start,
      point,
      interaction.radius
    )
    if (poseSession) previewManipulation(poseSession, next, commitPose)
    return
  }
  if (interaction.kind === 'eye') {
    const point = localOf(event)
    if (!point) return
    const deltaX = point[0] - interaction.start[0]
    const deltaY = point[1] - interaction.start[1]
    const along = (axis: LocalPoint) => deltaX * axis[0] + deltaY * axis[1]
    const start = interaction.eyes
    const side = interaction.side
    const current = start[side]
    let next = start
    if (interaction.handle === 'width') {
      next = updateEye(
        start,
        side,
        {
          width: Math.max(10, Math.min(100, current.width + along(interaction.widthAxis) * 2))
        },
        props.manual.links
      )
    } else if (interaction.handle === 'height') {
      next = updateEye(
        start,
        side,
        {
          height: Math.max(10, Math.min(100, current.height + along(interaction.heightAxis) * 2))
        },
        props.manual.links
      )
    } else if (interaction.handle === 'size') {
      const distance = Math.hypot(point[0] - interaction.center[0], point[1] - interaction.center[1])
      next = scaleEye(start, side, distance / interaction.startDistance, props.manual.links.size)
    } else if (interaction.handle === 'spacing') {
      next = clampEyes({
        ...start,
        spacing: start.spacing + along(interaction.spacingAxis)
      })
    } else {
      const currentAngle = Math.atan2(point[1] - interaction.center[1], point[0] - interaction.center[0])
      const delta = Math.atan2(
        Math.sin(currentAngle - interaction.startAngle),
        Math.cos(currentAngle - interaction.startAngle)
      )
      next = updateEye(
        start,
        side,
        { angle: current.angle + (delta * 180) / Math.PI },
        props.manual.links
      )
    }
    if (eyeSession) previewManipulation(eyeSession, next, commitEyes)
    return
  }
  const gizmoPoint = gizmoOf(event)
  if (!gizmoPoint) return
  if (interaction.kind === 'view') {
    const currentAngle = Math.atan2(gizmoPoint[1], gizmoPoint[0])
    const delta = Math.atan2(
      Math.sin(currentAngle - interaction.startAngle),
      Math.cos(currentAngle - interaction.startAngle)
    )
    const next = rotatePoseAroundCamera(interaction.pose, delta)
    if (poseSession) previewManipulation(poseSession, next, commitPose)
    return
  }
  const signed =
    (gizmoPoint[0] - interaction.start[0]) * interaction.tangent[0] +
    (gizmoPoint[1] - interaction.start[1]) * interaction.tangent[1]
  const next = rotatePoseAroundAxis(interaction.pose, interaction.axis, signed * 1.5)
  if (poseSession) previewManipulation(poseSession, next, commitPose)
}

const finishPose = (outcome: 'commit' | 'cancel') => {
  if (poseSession)
    finishManipulation(poseSession, outcome, { preview: commitPose, commit: commitPose })
  poseSession = null
}

const finishEyes = (outcome: 'commit' | 'cancel') => {
  if (eyeSession)
    finishManipulation(eyeSession, outcome, { preview: commitEyes, commit: commitEyes })
  eyeSession = null
}

const stop = () => {
  if (drag.value?.kind === 'eye') finishEyes('commit')
  else finishPose('commit')
  drag.value = null
  activeAxis.value = null
  setBodyCursor('grab')
  detachDrag()
}

const cancel = () => {
  if (drag.value?.kind === 'eye') finishEyes('cancel')
  else finishPose('cancel')
  drag.value = null
  activeAxis.value = null
  setBodyCursor('grab')
  detachDrag()
}

const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && drag.value) {
    event.stopPropagation()
    cancel()
  }
}

const onBodyDown = (event: PointerEvent) => {
  if (event.button !== 0) return
  event.stopPropagation()
  startArcball(event)
}

const onEyeDown = (side: 'left' | 'right') => (event: PointerEvent) => {
  if (event.button !== 0) return
  event.stopPropagation()
  emit('update:selected', side)
}

const onBlankDown = (event: PointerEvent) => {
  if (event.button !== 0) return
  if (isEyeTarget(event.target)) return
  if (selected.value === 'left' || selected.value === 'right') selectBody()
}

const bindParts = () => {
  const parts = props.hero?.parts()
  if (!parts) return () => {}
  const left = parts.eyes[0]
  const right = parts.eyes[1]
  parts.body.style.cursor = 'grab'
  if (left) left.style.cursor = 'pointer'
  if (right) right.style.cursor = 'pointer'
  const onLeft = onEyeDown('left')
  const onRight = onEyeDown('right')
  parts.body.addEventListener('pointerdown', onBodyDown)
  left?.addEventListener('pointerdown', onLeft)
  right?.addEventListener('pointerdown', onRight)
  return () => {
    parts.body.style.cursor = ''
    if (left) left.style.cursor = ''
    if (right) right.style.cursor = ''
    parts.body.removeEventListener('pointerdown', onBodyDown)
    left?.removeEventListener('pointerdown', onLeft)
    right?.removeEventListener('pointerdown', onRight)
  }
}

let unbind = () => {}
let bound = false
let raf = 0
const tick = () => {
  raf = requestAnimationFrame(tick)
  syncOverlay()
  sampleEyes()
  paintWires()
  paintFocus()
  if (!bound && props.hero?.parts()) {
    unbind()
    unbind = bindParts()
    bound = true
  }
}

watch(
  () => props.hero,
  () => {
    unbind()
    bound = false
    unbind = bindParts()
    bound = !!props.hero?.parts()
    sampleEyes()
  }
)

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('pointerdown', onBlankDown, true)
  raf = requestAnimationFrame(tick)
  syncOverlay()
  unbind = bindParts()
  bound = !!props.hero?.parts()
  sampleEyes()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('pointerdown', onBlankDown, true)
  cancelAnimationFrame(raf)
  stop()
  unbind()
  clearDecor()
})

const resetHead = () => emit('update:pose', { ...DEFAULT_POSE })
</script>

<template>
  <div ref="manualLayer" class="manual-layer">
    <svg
      class="manual-overlay"
      :style="overlayStyle"
      viewBox="-150 -150 300 300"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <g v-if="editor" class="eye-editor">
        <path v-if="draggingHandle" class="selection-outline" :d="editor.frame.outline" />
        <path class="editor-guide" :d="editor.widthGuide" />
        <path class="editor-guide" :d="editor.heightGuide" />
        <path class="editor-guide" :d="editor.rotationGuide" />
        <path class="editor-guide" :d="editor.spacingGuide" />
        <g class="editor-control" data-eye-handle="width" @pointerdown="startHandle('width', $event)">
          <circle class="editor-handle" :cx="editor.frame.widthHandle[0]" :cy="editor.frame.widthHandle[1]" r="5.5" />
          <text class="editor-label" :x="editor.frame.widthHandle[0]" :y="editor.frame.widthHandle[1] + 2.6">L</text>
        </g>
        <g class="editor-control" data-eye-handle="height" @pointerdown="startHandle('height', $event)">
          <circle class="editor-handle" :cx="editor.frame.heightHandle[0]" :cy="editor.frame.heightHandle[1]" r="5.5" />
          <text class="editor-label" :x="editor.frame.heightHandle[0]" :y="editor.frame.heightHandle[1] + 2.6">H</text>
        </g>
        <g class="editor-control" data-eye-handle="rotate" @pointerdown="startHandle('rotate', $event)">
          <circle class="editor-handle" :cx="editor.frame.rotateHandle[0]" :cy="editor.frame.rotateHandle[1]" r="5.5" />
          <text class="editor-label" :x="editor.frame.rotateHandle[0]" :y="editor.frame.rotateHandle[1] + 2.6">R</text>
        </g>
        <g class="editor-control" data-eye-handle="size" @pointerdown="startHandle('size', $event)">
          <rect
            class="editor-handle"
            :x="editor.frame.sizeHandle[0] - 5"
            :y="editor.frame.sizeHandle[1] - 5"
            width="10"
            height="10"
            rx="2"
          />
          <text class="editor-label" :x="editor.frame.sizeHandle[0]" :y="editor.frame.sizeHandle[1] + 2.6">S</text>
        </g>
        <g class="editor-control" data-eye-handle="spacing" @pointerdown="startHandle('spacing', $event)">
          <rect
            class="editor-handle"
            :x="editor.spacingHandle[0] - 5"
            :y="editor.spacingHandle[1] - 5"
            width="10"
            height="10"
            rx="2"
          />
          <text class="editor-label" :x="editor.spacingHandle[0]" :y="editor.spacingHandle[1] + 2.6">E</text>
        </g>
      </g>
    </svg>
    <div class="gizmo-cluster">
      <svg ref="gizmoSvg" class="gizmo" viewBox="-43 -43 86 86" :aria-label="t('manual.gizmo')">
        <g class="gizmo-back" aria-hidden="true">
          <path v-for="(d, i) in rings.y.back" :key="'yb' + i" class="gizmo-orbit gizmo-y" :d="d" />
          <path v-for="(d, i) in rings.x.back" :key="'xb' + i" class="gizmo-orbit gizmo-x" :d="d" />
          <path v-for="(d, i) in rings.z.back" :key="'zb' + i" class="gizmo-orbit gizmo-z" :d="d" />
        </g>
        <circle class="gizmo-hit gizmo-camera-hit" cx="0" cy="0" r="38" @pointerdown="startView" />
        <circle
          class="gizmo-orbit gizmo-camera"
          :class="{ 'is-active': activeAxis === 'view' }"
          cx="0"
          cy="0"
          r="38"
        />
        <g class="gizmo-front">
          <g v-for="(d, i) in rings.y.front" :key="'yf' + i" class="gizmo-arc">
            <path class="gizmo-hit" :d="d" @pointerdown="startAxis('y', $event)" />
            <path class="gizmo-orbit gizmo-y" :class="{ 'is-active': activeAxis === 'y' }" :d="d" />
          </g>
          <g v-for="(d, i) in rings.x.front" :key="'xf' + i" class="gizmo-arc">
            <path class="gizmo-hit" :d="d" @pointerdown="startAxis('x', $event)" />
            <path class="gizmo-orbit gizmo-x" :class="{ 'is-active': activeAxis === 'x' }" :d="d" />
          </g>
          <g v-for="(d, i) in rings.z.front" :key="'zf' + i" class="gizmo-arc">
            <path class="gizmo-hit" :d="d" @pointerdown="startAxis('z', $event)" />
            <path class="gizmo-orbit gizmo-z" :class="{ 'is-active': activeAxis === 'z' }" :d="d" />
          </g>
        </g>
      </svg>
      <button type="button" class="gizmo-reset" :aria-label="t('manual.reset')" @click="resetHead">
        ↺
      </button>
    </div>
    <div class="axis-key" aria-hidden="true">
      <i class="x" />X <i class="y" />Y <i class="z" />Z
    </div>
  </div>
</template>
