import { loadReplica, replicaReady, type ReplicaBot } from './boot'

export type ReplicaMount = {
  apply: (input: ReplicaInput) => void
  spin: () => void
  orbitGaze: (ms?: number) => void
  step: (dt: number) => void
  setState: (name: string) => void
  destroy: () => void
}

export type ReplicaInput = {
  state: string
  shape: string
  color: string
  follow: boolean
  paper: string
  size: number
}

let tileQueue: Promise<unknown> = Promise.resolve()

/** One-frame tiles share a queue so first paint does not spawn 30 engines at once. */
export function paintTile(svg: SVGSVGElement, input: ReplicaInput): Promise<ReplicaMount | null> {
  const job = tileQueue.then(() => mountReplica(svg, input, false))
  tileQueue = job.then(
    () => undefined,
    () => undefined
  )
  return job
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
  const bot: ReplicaBot = new window.GrokCharacter(svg, {
    state: input.state,
    shape: input.shape,
    color: input.color,
    sizePx: input.size,
    mode: 'hold',
    loginWrap: true,
    fitBox: true,
    frameHalf: Re * 1.58,
    followPointer: live && input.follow && !driven,
    eyeColor: input.paper,
    paused: driven ? false : live ? false : 'hold-pose',
    driven
  })
  const noop = {
    apply: () => {},
    spin: () => {},
    orbitGaze: () => {},
    step: () => {},
    setState: () => {},
    destroy: () => {}
  }
  if (!live && !driven) {
    bot.destroy()
    return noop
  }

  let last = { ...input }
  return {
    apply(next) {
      if (next.state !== last.state) bot.setState(next.state, { resetEyes: true })
      if (next.shape !== last.shape) bot.setShape(next.shape)
      if (next.color !== last.color) bot.setColor(next.color)
      if (next.follow !== last.follow) bot.setFollowPointer(next.follow)
      if (next.paper !== last.paper) bot.setEyeColor(next.paper)
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
    destroy: () => bot.destroy()
  }
}

export { replicaReady }
