import { defaultCycle as seedBlocks, stateGroups } from '@/replica/catalog'

export type StateId = string

export interface Block {
  state: StateId
  duration: number
}

export interface Cycle {
  id: string
  name: string
  blocks: Block[]
}

export const MIN_BLOCK = 0.6
export const MAX_BLOCK = 10
export const MAX_BLOCS = 200
export const MAX_CYCLES = 50
export const STEP = 0.1

const DEFAULT_CYCLE_ID = 'defaut'

export function catalogue(): StateId[] {
  return stateGroups().flatMap((g) => g.states)
}

const KNOWN = new Set(catalogue())

export function isState(id: string): id is StateId {
  return KNOWN.has(id)
}

export function minDurationOf(_state: StateId): number {
  return MIN_BLOCK
}

export function clampDuration(state: StateId, seconds: number): number {
  const snapped = Math.round(seconds / STEP) * STEP
  const bounded = Math.min(MAX_BLOCK, Math.max(minDurationOf(state), snapped))
  return Math.round(bounded * 100) / 100
}

export function makeBlock(state: StateId): Block {
  const seed = seedBlocks().find((b) => b.state === state)
  return { state, duration: clampDuration(state, seed?.duration ?? 2.4) }
}

export function defaultCycle(): Cycle {
  return {
    name: '',
    id: DEFAULT_CYCLE_ID,
    blocks: seedBlocks().map((b) => ({
      state: b.state,
      duration: clampDuration(b.state, b.duration)
    }))
  }
}

export function totalDuration(blocks: Block[]): number {
  return blocks.reduce((sum, b) => sum + b.duration, 0)
}

export function offsetOf(blocks: Block[], index: number): number {
  let acc = 0
  for (let i = 0; i < index && i < blocks.length; i++) acc += blocks[i]!.duration
  return acc
}

export function blockAt(blocks: Block[], t: number): { index: number; elapsed: number } {
  const total = totalDuration(blocks)
  if (!blocks.length || total <= 0) return { index: 0, elapsed: 0 }
  const wrapped = t >= 0 && t < total ? t : ((t % total) + total) % total
  let acc = 0
  for (let i = 0; i < blocks.length; i++) {
    const end = acc + blocks[i]!.duration
    if (wrapped < end) return { index: i, elapsed: wrapped - acc }
    acc = end
  }
  return { index: blocks.length - 1, elapsed: 0 }
}

export function blocksWith(blocks: Block[], state: StateId): Block[] {
  if (blocks.length >= MAX_BLOCS) return blocks
  return [...blocks, makeBlock(state)]
}

export function moveBlock(blocks: Block[], from: number, to: number): Block[] {
  const next = blocks.slice()
  const [moved] = next.splice(from, 1)
  if (!moved) return blocks
  next.splice(Math.min(Math.max(to, 0), next.length), 0, moved)
  return next
}

/** Index of the clip that was current, after `moveBlock(from, to)`. */
export function followMove(current: number, from: number, to: number): number {
  if (current === from) return to
  if (from < to && current > from && current <= to) return current - 1
  if (from > to && current >= to && current < from) return current + 1
  return current
}

export function uniqueName(base: string, cycles: Cycle[]): string {
  const taken = new Set(cycles.map((c) => c.name))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

export function nextCycleId(cycles: Cycle[]): string {
  const taken = new Set(cycles.map((c) => c.id))
  let n = 1
  while (taken.has(`c${n}`)) n++
  return `c${n}`
}

function parseBlock(raw: unknown): Block | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { state, duration } = raw as { state?: unknown; duration?: unknown }
  if (typeof state !== 'string' || !isState(state)) return null
  if (typeof duration !== 'number' || !Number.isFinite(duration)) return null
  return { state, duration: clampDuration(state, duration) }
}

function parseCycle(raw: unknown, seen: Cycle[]): Cycle | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { id, name, blocks } = raw as { id?: unknown; name?: unknown; blocks?: unknown }
  if (typeof id !== 'string' || !id) return null
  if (typeof name !== 'string') return null
  if (!Array.isArray(blocks)) return null
  const kept = blocks
    .slice(0, MAX_BLOCS)
    .map(parseBlock)
    .filter((b): b is Block => b !== null)
  if (!kept.length) return null
  if (seen.some((c) => c.id === id)) return null
  return { id, name, blocks: kept }
}

export function parseCycles(raw: string | null): Cycle[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const out: Cycle[] = []
  for (const item of data.slice(0, MAX_CYCLES)) {
    const cycle = parseCycle(item, out)
    if (cycle) out.push(cycle)
  }
  return out
}
