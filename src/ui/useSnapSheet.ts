import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { clampSheet, snapExpanded } from '@/ui/playback'

const TAP = 6

export function useSnapSheet(details: Ref<HTMLElement | null>) {
  const y = ref(0)
  const expanded = ref(false)
  const dragging = ref(false)
  const collapsed = ref(0)
  const ready = ref(false)

  const opacity = computed(() => {
    const max = collapsed.value
    if (max <= 0) return expanded.value ? 1 : 0
    return 1 - Math.min(1, Math.max(0, y.value / max))
  })

  let originY = 0
  let originOffset = 0
  let lastT = 0
  let lastClientY = 0
  let velocity = 0
  let observer: ResizeObserver | null = null

  function measure() {
    const h = details.value?.getBoundingClientRect().height ?? 0
    if (h <= 0) return
    const first = !ready.value
    collapsed.value = h
    if (first) {
      y.value = expanded.value ? 0 : h
      ready.value = true
      return
    }
    if (!dragging.value) y.value = expanded.value ? 0 : h
  }

  function snap(open: boolean) {
    expanded.value = open
    y.value = open ? 0 : collapsed.value
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return
    dragging.value = true
    originY = e.clientY
    originOffset = y.value
    lastT = e.timeStamp
    lastClientY = e.clientY
    velocity = 0
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging.value) return
    const dt = e.timeStamp - lastT
    if (dt > 0) velocity = ((e.clientY - lastClientY) / dt) * 1000
    lastT = e.timeStamp
    lastClientY = e.clientY
    y.value = clampSheet(originOffset + (e.clientY - originY), collapsed.value)
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging.value) return
    dragging.value = false
    if (Math.abs(e.clientY - originY) < TAP) {
      snap(!expanded.value)
      return
    }
    snap(snapExpanded(y.value, velocity, collapsed.value))
  }

  onMounted(async () => {
    await nextTick()
    measure()
    if (!details.value) return
    observer = new ResizeObserver(measure)
    observer.observe(details.value)
  })

  watch(details, (el, prev) => {
    if (prev) observer?.unobserve(prev)
    if (!el) return
    observer ??= new ResizeObserver(measure)
    observer.observe(el)
    measure()
  })

  onBeforeUnmount(() => observer?.disconnect())

  return {
    y,
    expanded,
    dragging,
    collapsed,
    opacity,
    ready,
    snap,
    onPointerDown,
    onPointerMove,
    onPointerUp
  }
}
