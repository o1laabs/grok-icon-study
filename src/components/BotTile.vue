<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { paintTile } from '@/replica/host'

const props = withDefaults(
  defineProps<{
    label: string
    selected: boolean
    state?: string
    shape?: string
    color?: string
    size?: number
    interactive?: boolean
    showLabel?: boolean
  }>(),
  { interactive: true, showLabel: true }
)

const svg = ref<SVGSVGElement | null>(null)
const painted = ref(false)

async function paint() {
  const node = svg.value
  if (!node) return
  node.innerHTML = ''
  const mount = await paintTile(node, {
    state: props.state ?? 'idle',
    shape: props.shape ?? 'blob',
    color: props.color ?? 'black',
    follow: false,
    paper: '#f9f9f9',
    size: props.size ?? 60
  })
  painted.value = !!mount
}

onMounted(() => {
  void paint()
})
watch(() => [props.state, props.shape, props.color], () => {
  void paint()
})
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    :type="interactive ? 'button' : undefined"
    class="flex flex-col items-center rounded-xl border-2 p-1 transition"
    :class="[
      interactive ? 'cursor-pointer' : '',
      selected ? 'border-[var(--ink)]' : 'border-transparent',
      interactive && !selected ? 'hover:border-[var(--line)]' : ''
    ]"
    :aria-label="interactive ? label : undefined"
    :aria-pressed="interactive ? selected : undefined"
  >
    <svg
      ref="svg"
      class="shrink-0 overflow-visible"
      :width="size ?? 60"
      :height="size ?? 60"
      aria-hidden="true"
    />
    <span
      v-if="showLabel"
      class="text-center text-xs leading-tight text-[var(--muted)]"
      >{{ label }}</span
    >
  </component>
</template>
