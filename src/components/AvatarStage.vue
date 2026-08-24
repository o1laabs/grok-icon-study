<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Hero from '@/components/Hero.vue'
import ManualCanvas, { type HeroHandle } from '@/components/ManualCanvas.vue'
import { type EyeTune, type ManualPart, type ManualState } from '@/ui/pose/model'
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
    playing?: boolean
    mix?: number
    echelle?: number
    autoTricks?: boolean
  }>(),
  {
    size: 440,
    shape: 'blob',
    color: 'black',
    state: 'idle',
    follow: false,
    paper: '#f9f9f9',
    manual: null,
    tools: false,
    playing: false,
    mix: 0,
    echelle: 1,
    autoTricks: true
  }
)

const emit = defineEmits<{
  ready: [ok: boolean]
  'update:manual': [ManualState]
}>()

const hero = ref<InstanceType<typeof Hero> | null>(null)
const liveHero = computed<HeroHandle | null>(() => hero.value)
const active = computed(
  () => !!props.manual?.on && props.tools && !props.playing && props.mix > 0.985
)

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
  bot.setPose(manual.pose)
  bot.setManualOffset(manual.offset)
  bot.setEyeTune(manual.eyes)
  bot.setManualHold(!props.playing)
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
    props.playing,
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
      :auto-tricks="autoTricks"
      @ready="onReady"
    />
    <ManualCanvas
      v-if="active && manual"
      :manual="manual"
      :hero="liveHero"
      :shape="shape"
      :echelle="echelle"
      @update:pose="(pose: HeadPose) => patch({ pose })"
      @update:selected="(selected: ManualPart | null) => patch({ selected })"
      @update:eyes="(eyes: EyeTune) => patch({ eyes })"
    />
  </div>
</template>
