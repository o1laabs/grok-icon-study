<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '@/i18n'
import { mountReplica, type ReplicaMount } from '@/replica/host'

const props = withDefaults(
  defineProps<{
    size?: number
    shape?: string
    color?: string
    state?: string
    follow?: boolean
    paper?: string
    autoTricks?: boolean
  }>(),
  {
    size: 440,
    shape: 'blob',
    color: 'black',
    state: 'idle',
    follow: false,
    paper: '#f9f9f9',
    autoTricks: true
  }
)

const emit = defineEmits<{ ready: [ok: boolean] }>()

const svg = ref<SVGSVGElement | null>(null)
const live = ref(false)
const tried = ref(false)
let replica: ReplicaMount | null = null
let alive = true

function input() {
  return {
    state: props.state,
    shape: props.shape,
    color: props.color,
    follow: props.follow,
    paper: props.paper,
    size: props.size,
    autoTricks: props.autoTricks
  }
}

async function attach() {
  const node = svg.value
  if (!node) return
  const mount = await mountReplica(node, input(), true)
  if (!alive) {
    mount?.destroy()
    return
  }
  replica = mount
  live.value = !!replica
  tried.value = true
  replica?.apply(input())
  emit('ready', live.value)
}

onMounted(() => {
  void attach()
})
onBeforeUnmount(() => {
  alive = false
  replica?.destroy()
  replica = null
})

watch(
  () => [props.state, props.shape, props.color, props.follow, props.paper, props.size, props.autoTricks],
  () => replica?.apply(input())
)

defineExpose({
  spin: () => replica?.spin(),
  orbitGaze: (ms?: number) => replica?.orbitGaze(ms),
  svg: () => svg.value,
  setPose: (pose: { turn?: number; tilt?: number; roll?: number }) => replica?.setPose(pose),
  setManualOffset: (offset: { tx?: number; ty?: number; spin?: number }) =>
    replica?.setManualOffset(offset),
  setEyeTune: (tune: unknown) => replica?.setEyeTune(tune),
  setManualHold: (on: boolean) => replica?.setManualHold(on),
  flushPerformance: () => replica?.flushPerformance(),
  seekEye: (index: number, opts?: { snap?: boolean }) => replica?.seekEye(index, opts),
  setPlaylistHold: (on: boolean) => replica?.setPlaylistHold(on),
  setPaused: (on: boolean | 'hold-pose') => replica?.setPaused(on),
  holdFrame: (at?: number) => replica?.holdFrame(at),
  freezeNow: (opts?: { settle?: boolean }) => replica?.freezeNow(opts) ?? null,
  playback: () => replica?.playback() ?? null,
  parts: () => replica?.parts() ?? null
})
</script>

<template>
  <div class="relative inline-block aspect-square max-w-full" :style="{ width: `${props.size}px` }">
    <svg
      ref="svg"
      class="absolute inset-0 h-full w-full max-w-full max-h-full overflow-visible"
      :width="props.size"
      :height="props.size"
      role="img"
      :aria-label="t('app.botAria')"
    />
    <p
      v-if="tried && !live"
      class="absolute inset-6 flex items-center justify-center text-center text-xs text-[var(--muted)]"
    >
      {{ t('app.missingGeo') }}
    </p>
  </div>
</template>
