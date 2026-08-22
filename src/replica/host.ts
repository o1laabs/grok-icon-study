import {
  loadReplica,
  replicaReady,
  type ReplicaBot,
  type ReplicaParts,
  type ReplicaPlayback
} from './boot'
import { parseInk } from './catalog'

export type ReplicaMount = {
  apply: (input: ReplicaInput) => void
  spin: () => void
  orbitGaze: (ms?: number) => void
  step: (dt: number) => void
  setState: (name: string) => void
  setPose: (pose: { turn?: number; tilt?: number; roll?: number }) => void
  setManualOffset: (offset: { tx?: number; ty?: number; spin?: number }) => void
  setEyeTune: (tune: unknown) => void
  setManualHold: (on: boolean) => void
  flushPerformance: () => void
  seekEye: (index: number, opts?: { snap?: boolean }) => void
  setPlaylistHold: (on: boolean) => void
  setPaused: (on: boolean | 'hold-pose') => void
  holdFrame: (at?: number) => void
  freezeNow: (opts?: { settle?: boolean }) => ReplicaPlayback | null
  playback: () => ReplicaPlayback | null
  parts: () => ReplicaParts | null
  destroy: () => void
}

export type ReplicaInput = {
  state: string
  shape: string
  color: string
  follow: boolean
  paper: string
  size: number
  eye?: number
}

const TILE_MAX = 6
let tileActive = 0
const tileWait: Array<() => void> = []

function appliqueEncre(bot: ReplicaBot, v: string) {
  const spec = parseInk(v)
  if (spec.kind === 'preset') {
    bot.setInk(null)
    bot.setColor(spec.id)
  } else if (spec.kind === 'flat') {
    bot.setInk(spec.hex)
  } else if (spec.kind === 'radial') {
    bot.setInkGrad({ from: spec.from, to: spec.to, angle: 0, radial: true })
  } else {
    bot.setInkGrad({ from: spec.from, to: spec.to, angle: spec.angle })
  }
}

function lockTile(): Promise<void> {
  if (tileActive < TILE_MAX) {
    tileActive++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    tileWait.push(() => {
      tileActive++
      resolve()
    })
  })
}

function unlockTile() {
  tileActive--
  tileWait.shift()?.()
}

export async function paintTile(
  svg: SVGSVGElement,
  input: ReplicaInput
): Promise<ReplicaMount | null> {
  await lockTile()
  try {
    svg.innerHTML = ''
    return await mountReplica(svg, input, false)
  } finally {
    unlockTile()
  }
}

export async function mountReplica(
  svg: SVGSVGElement,
  input: ReplicaInput,
  live: boolean,
  extra?: { driven?: boolean }
): Promise<ReplicaMount | null> {
  const ok = await loadReplica()
  if (!ok || !window.GrokCharacter) return null
  const Re = window.GROK_GEO?.Re ?? 114.27
  const driven = !!extra?.driven
  const spec = parseInk(input.color)
  const bot: ReplicaBot = new window.GrokCharacter(svg, {
    state: input.state,
    shape: input.shape,
    color: spec.kind === 'preset' ? spec.id : 'black',
    inkFlat: spec.kind === 'flat' ? spec.hex : undefined,
    inkGrad:
      spec.kind === 'grad'
        ? { from: spec.from, to: spec.to, angle: spec.angle }
        : spec.kind === 'radial'
          ? { from: spec.from, to: spec.to, angle: 0, radial: true }
          : undefined,
    sizePx: input.size,
    mode: 'hold',
    loginWrap: true,
    fitBox: true,
    frameHalf: Re * 1.58,
    followPointer: live && input.follow && !driven,
    eyeColor: input.paper,
    paused: driven ? false : live ? false : 'hold-pose',
    driven,
    eyeIndex: input.eye
  })
  const noop = {
    apply: () => {},
    spin: () => {},
    orbitGaze: () => {},
    step: () => {},
    setState: () => {},
    setPose: () => {},
    setManualOffset: () => {},
    setEyeTune: () => {},
    setManualHold: () => {},
    flushPerformance: () => {},
    seekEye: () => {},
    setPlaylistHold: () => {},
    setPaused: () => {},
    holdFrame: () => {},
    freezeNow: () => null,
    playback: () => null,
    parts: () => null,
    destroy: () => {}
  }
  if (!live && !driven) {
    bot.destroy()
    return noop
  }

  let last = { ...input }
  return {
    apply(next) {
      if (next.state !== last.state) bot.setState(next.state, { resetEyes: false })
      if (next.shape !== last.shape) bot.setShape(next.shape)
      if (next.color !== last.color) appliqueEncre(bot, next.color)
      if (next.follow !== last.follow) bot.setFollowPointer(next.follow)
      if (next.paper !== last.paper) bot.setEyeColor(next.paper)
      if (next.size !== last.size) bot.setSize(next.size)
      last = { ...next }
    },
    spin: () => bot.spinOnce(1),
    orbitGaze: (ms) => bot.orbitGaze(ms),
    step: (dt) => bot.step(dt),
    setState: (name) => {
      if (name === last.state) return
      bot.setState(name, { resetEyes: true })
      last = { ...last, state: name }
    },
    setPose: (pose) => bot.setPose(pose),
    setManualOffset: (offset) => bot.setManualOffset(offset),
    setEyeTune: (tune) => bot.setEyeTune(tune),
    setManualHold: (on) => bot.setManualHold(on),
    flushPerformance: () => bot.flushPerformance(),
    seekEye: (index, opts) => bot.seekEye(index, opts),
    setPlaylistHold: (on) => bot.setPlaylistHold(on),
    setPaused: (on) => bot.setPaused(on),
    holdFrame: (at) => bot.holdFrame(at),
    freezeNow: (opts) => bot.freezeNow(opts),
    playback: () => bot.playback(),
    parts: () => bot.parts(),
    destroy: () => bot.destroy()
  }
}

export { replicaReady }
