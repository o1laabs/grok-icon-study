<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Hero from '@/components/Hero.vue'
import ManualCanvas, { type HeroHandle } from '@/components/ManualCanvas.vue'
import {
  DEFAULT_EYE,
  DEFAULT_EYES,
  type EyeSide,
  type EyeTune,
  type ManualPart,
  type ManualState
} from '@/ui/pose/model'
import type { HeadPose } from '@/ui/pose/math'

const props = withDefaults(
  defineProps<{
    size?: number
    shape?: string
    color?: string
    state?: string
    follow?: boolean
    paper?: string
    manual?: ManualState | null
    tools?: boolean
  }>(),
  {
    size: 440,
    shape: 'blob',
    color: 'black',
    state: 'idle',
    follow: false,
    paper: '#f9f9f9',
    manual: null,
    tools: false
  }
)

const emit = defineEmits<{
  ready: [ok: boolean]
  'update:manual': [ManualState]
}>()

const hero = ref<InstanceType<typeof Hero> | null>(null)
const liveHero = computed<HeroHandle | null>(() => hero.value)
const active = computed(() => !!props.manual?.on && props.tools)

function patch(next: Partial<ManualState>) {
  if (!props.manual) return
  emit('update:manual', { ...props.manual, ...next })
}

function applyEngine() {
  const bot = hero.value
  const manual = props.manual
  if (!bot) return
  if (!manual?.on || !props.tools) {
    bot.setManualHold(false)
    return
  }
  bot.setManualHold(true)
  bot.setPose(manual.pose)
  bot.setManualOffset(manual.offset)
  bot.setEyeTune(engineEyes(manual.eyes))
}

function near(a: number, b: number) {
  return Math.abs(a - b) < 1e-6
}

function sameSide(a: EyeSide, b: EyeSide) {
  return (
    near(a.width, b.width) &&
    near(a.height, b.height) &&
    near(a.size, b.size) &&
    near(a.angle, b.angle) &&
    near(a.x, b.x) &&
    near(a.y, b.y)
  )
}

function sameEyes(a: EyeTune, b: EyeTune) {
  return sameSide(a.left, b.left) && sameSide(a.right, b.right) && near(a.spacing, b.spacing)
}

function engineSide(side: EyeSide): EyeSide {
  return { ...side, x: side.x - DEFAULT_EYE.x, y: side.y - DEFAULT_EYE.y }
}

function engineEyes(eyes: EyeTune): EyeTune | null {
  if (sameEyes(eyes, DEFAULT_EYES)) return null
  return { left: engineSide(eyes.left), right: engineSide(eyes.right), spacing: eyes.spacing }
}

function clearSelection() {
  if (props.manual?.selected != null) emit('update:manual', { ...props.manual, selected: null })
}

watch(
  () => [props.tools, props.shape],
  () => clearSelection()
)

watch(
  () => [
    props.manual?.on,
    props.manual?.pose,
    props.manual?.offset,
    props.manual?.eyes,
    props.tools,
    hero.value
  ],
  () => applyEngine(),
  { deep: true }
)

function onReady(ok: boolean) {
  emit('ready', ok)
  if (ok) void nextTick(applyEngine)
}

onBeforeUnmount(() => {
  clearSelection()
  hero.value?.setManualHold(false)
})

defineExpose({
  spin: () => hero.value?.spin(),
  orbitGaze: (ms?: number) => hero.value?.orbitGaze(ms),
  svg: () => hero.value?.svg() ?? null,
  seekEye: (index: number, opts?: { snap?: boolean }) => hero.value?.seekEye(index, opts),
  flushPerformance: () => hero.value?.flushPerformance(),
  setPlaylistHold: (on: boolean) => hero.value?.setPlaylistHold(on),
  setPaused: (on: boolean | 'hold-pose') => hero.value?.setPaused(on),
  holdFrame: (at?: number) => hero.value?.holdFrame(at),
  freezeNow: (opts?: { settle?: boolean }) => hero.value?.freezeNow(opts) ?? null,
  playback: () => hero.value?.playback() ?? null
})
</script>

<template>
  <div
    class="avatar-stage relative inline-block aspect-square max-w-full"
    :style="{ width: `${props.size}px` }"
  >
    <Hero
      ref="hero"
      class="h-auto max-w-full"
      :size="size"
      :shape="shape"
      :color="color"
      :state="state"
      :follow="follow && !active"
      :paper="paper"
      @ready="onReady"
    />
    <ManualCanvas
      v-if="active && manual"
      :manual="manual"
      :hero="liveHero"
      @update:pose="(pose: HeadPose) => patch({ pose })"
      @update:selected="(selected: ManualPart | null) => patch({ selected })"
      @update:eyes="(eyes: EyeTune) => patch({ eyes })"
    />
  </div>
</template>
