<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { t } from '@/i18n'
import {
  fondCss,
  normaliseComposition,
  ANGLE_DEFAUT,
  type CompositionPhoto,
  type FondPhoto
} from '@/ui/photo'

/**
 * Cadre vivant du mode photo. Reste TOUJOURS monte (display:contents quand
 * inactif) : le slot contient l'AvatarStage du heros, qui ne doit jamais etre
 * reparente — un remontage relancerait le moteur replica et perdrait la pose.
 *
 * Math WYSIWYG : le cadre fait 300 unites, donc translate(x/3 %) en CSS egale
 * translate(x) dans le SVG exporte par `svgPhoto`.
 */

const props = withDefaults(
  defineProps<{
    active?: boolean
    fond?: FondPhoto
    couleurDe?: string
    couleurA?: string
    angle?: number
    outil?: 'cadre' | 'pose'
    flash?: number
  }>(),
  {
    active: false,
    fond: 'transparent',
    couleurDe: '#F5F7FC',
    couleurA: '#C9D5FF',
    angle: ANGLE_DEFAUT,
    outil: 'cadre',
    flash: 0
  }
)

const composition = defineModel<CompositionPhoto>('composition', { required: true })

const cadre = ref<HTMLDivElement | null>(null)
const glisse = ref<{ clientX: number; clientY: number; x: number; y: number } | null>(null)

function patch(partiel: Partial<CompositionPhoto>) {
  composition.value = normaliseComposition({ ...composition.value, ...partiel })
}

function zoome(e: WheelEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (glisse.value) return
  patch({ scale: composition.value.scale * Math.exp(-e.deltaY * 0.0015) })
}

watch(
  [() => props.active, () => props.outil],
  ([actif, outil]) => {
    const node = cadre.value
    if (!node) return
    node.removeEventListener('wheel', zoome)
    if (actif && outil === 'cadre') node.addEventListener('wheel', zoome, { passive: false })
  },
  { immediate: true, flush: 'post' }
)
onBeforeUnmount(() => cadre.value?.removeEventListener('wheel', zoome))

function debute(e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  glisse.value = {
    clientX: e.clientX,
    clientY: e.clientY,
    x: composition.value.x,
    y: composition.value.y
  }
  const cible = e.currentTarget as HTMLElement
  cible.dataset.dragging = ''
  cible.setPointerCapture(e.pointerId)
}

function glit(e: PointerEvent) {
  if (!glisse.value) return
  const cible = e.currentTarget as HTMLElement
  if (!cible.hasPointerCapture(e.pointerId)) return
  const boite = cible.getBoundingClientRect()
  const unitesParPixel = 300 / Math.max(boite.width, 1)
  patch({
    x: glisse.value.x + (e.clientX - glisse.value.clientX) * unitesParPixel,
    y: glisse.value.y + (e.clientY - glisse.value.clientY) * unitesParPixel
  })
}

function arrete(e: PointerEvent) {
  if (!glisse.value) return
  glisse.value = null
  delete (e.currentTarget as HTMLElement).dataset.dragging
}

function pousse(e: KeyboardEvent) {
  const pas = e.shiftKey ? 10 : 2
  if (e.key === 'ArrowLeft') patch({ x: composition.value.x - pas })
  else if (e.key === 'ArrowRight') patch({ x: composition.value.x + pas })
  else if (e.key === 'ArrowUp') patch({ y: composition.value.y - pas })
  else if (e.key === 'ArrowDown') patch({ y: composition.value.y + pas })
  else if (e.key === '+' || e.key === '=') patch({ scale: composition.value.scale + 0.05 })
  else if (e.key === '-') patch({ scale: composition.value.scale - 0.05 })
  else return
  e.preventDefault()
}
</script>

<template>
  <div
    ref="cadre"
    class="photo-cadre-hote"
    :class="[
      active && 'photo-cadre',
      active && fond === 'transparent' && 'est-transparent',
      active && outil === 'cadre' && 'est-cadre'
    ]"
    :style="
      active && {
        '--photo-coins': `${composition.cornerRadius}%`,
        '--photo-echelle': composition.scale,
        background: fondCss(fond, couleurDe, couleurA, angle)
      }
    "
  >
    <div
      class="photo-sujet"
      :style="
        active && {
          transform: `translate(${composition.x / 3}%, ${composition.y / 3}%) scale(${composition.scale})`
        }
      "
    >
      <slot />
    </div>
    <div
      v-if="active && outil === 'cadre'"
      class="photo-interaction"
      role="application"
      tabindex="0"
      :aria-label="t('photo.frameAria')"
      @pointerdown="debute"
      @pointermove="glit"
      @pointerup="arrete"
      @pointercancel="arrete"
      @keydown="pousse"
    />
    <div v-if="active && flash > 0" :key="flash" class="photo-flash" aria-hidden="true" />
  </div>
</template>
