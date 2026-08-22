<script setup lang="ts">
import { computed, ref } from 'vue'
import BotTile from '@/components/BotTile.vue'
import { shapeName, stateName, t } from '@/i18n'
import {
  COLOR_IDS,
  EXPRESSION_IDS,
  colorFill,
  colorHex,
  encodeFlat,
  encodeGrad,
  encodeRadial,
  liveShapes,
  parseInk
} from '@/replica/catalog'
import { angleDepuisPointeur, PAS_CADRAN, tourAngle } from '@/ui/cadran'
import { type ManualState } from '@/ui/pose/model'

const props = defineProps<{ ready?: boolean; active?: boolean }>()
const shape = defineModel<string>('shape', { required: true })
const color = defineModel<string>('color', { required: true })
const oeil = defineModel<string>('oeil', { required: true })
const expression = defineModel<string>('expression', { required: true })
const manual = defineModel<ManualState>('manual', { required: true })
const shapes = computed(() => {
  void props.ready
  return liveShapes()
})

const flatHex = ref('#e02135')
const gradFrom = ref('#ff8838')
const gradTo = ref('#0e74e0')
const gradAngle = ref(135)
{
  const spec = parseInk(color.value)
  if (spec.kind === 'flat') flatHex.value = spec.hex
  else if (spec.kind === 'grad') {
    gradFrom.value = spec.from
    gradTo.value = spec.to
    gradAngle.value = spec.angle
  } else if (spec.kind === 'radial') {
    gradFrom.value = spec.from
    gradTo.value = spec.to
  }
}

const OEIL_DEFAUT = '#f9f9f9'
const oeilHex = ref(oeil.value || OEIL_DEFAUT)
const PERSO_FOND =
  'conic-gradient(from 0.5turn, #e02135, #e08600, #009957, #1aa8c4, #0e74e0, #804ee0, #e02a88, #e02135)'

const activeSpec = computed(() => parseInk(color.value))
const estPerso = computed(() => {
  const spec = activeSpec.value
  if (spec.kind !== 'flat') return false
  return COLOR_IDS.every((id) => colorHex(id).toLowerCase() !== spec.hex.toLowerCase())
})
const apercu = computed(() =>
  activeSpec.value.kind === 'radial'
    ? `radial-gradient(circle at 50% 42%, ${gradFrom.value}, ${gradTo.value})`
    : `linear-gradient(${gradAngle.value}deg, ${gradFrom.value}, ${gradTo.value})`
)

function appliqueUni() {
  color.value = encodeFlat(flatHex.value)
}

function appliqueDegrade() {
  color.value = encodeGrad(gradFrom.value, gradTo.value, gradAngle.value)
}

function appliqueRadial() {
  color.value = encodeRadial(gradFrom.value, gradTo.value)
}

function appliqueCourant() {
  if (activeSpec.value.kind === 'radial') appliqueRadial()
  else appliqueDegrade()
}

function ensemenceSiPresent() {
  const spec = activeSpec.value
  if (spec.kind !== 'preset') return
  const ink = window.GROK_TABLES?.INK?.[spec.id]
  if (ink?.lightFrom && ink?.lightTo) {
    gradFrom.value = ink.lightFrom
    gradTo.value = ink.lightTo
    gradAngle.value = 135
  } else {
    const hex = colorHex(spec.id)
    gradFrom.value = hex
    gradTo.value = hex
  }
}

function choisitUni() {
  const spec = activeSpec.value
  if (spec.kind === 'preset') flatHex.value = colorHex(spec.id)
  else if (spec.kind === 'grad' || spec.kind === 'radial') flatHex.value = gradFrom.value
  appliqueUni()
}

function choisitNuancier(id: string) {
  flatHex.value = colorHex(id)
  appliqueUni()
}

function saisitPerso(e: Event) {
  flatHex.value = (e.target as HTMLInputElement).value
  appliqueUni()
}

function estNuancier(id: string) {
  const spec = activeSpec.value
  if (spec.kind === 'preset') return spec.id === id
  if (spec.kind === 'flat') return colorHex(id).toLowerCase() === spec.hex.toLowerCase()
  return false
}

function choisitDegrade() {
  ensemenceSiPresent()
  appliqueDegrade()
}

function choisitRadial() {
  ensemenceSiPresent()
  appliqueRadial()
}

function choisitAngle(a: number) {
  gradAngle.value = tourAngle(a)
  appliqueDegrade()
}

function cadranPointe(e: PointerEvent) {
  e.preventDefault()
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  choisitAngle(angleDepuisPointeur(el, e))
}

function cadranGlisse(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  if (!el.hasPointerCapture(e.pointerId)) return
  choisitAngle(angleDepuisPointeur(el, e))
}

function cadranClavier(e: KeyboardEvent) {
  const pas = PAS_CADRAN[e.key]
  if (pas == null) return
  e.preventDefault()
  choisitAngle(gradAngle.value + pas)
}

function echangeDegrade() {
  ;[gradFrom.value, gradTo.value] = [gradTo.value, gradFrom.value]
  appliqueCourant()
}

function saisit(cible: 'from' | 'to' | 'oeil', e: Event) {
  const v = (e.target as HTMLInputElement).value
  if (cible === 'from') {
    gradFrom.value = v
    appliqueCourant()
  } else if (cible === 'to') {
    gradTo.value = v
    appliqueCourant()
  } else {
    oeilHex.value = v
    oeil.value = v
  }
}

function reinitialiseOeil() {
  oeil.value = ''
  oeilHex.value = OEIL_DEFAUT
}

function patch(next: Partial<ManualState>) {
  manual.value = { ...manual.value, ...next }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between">
      <h2
        class="text-sm font-semibold transition"
        :class="!manual.on && 'text-[var(--muted)]'"
      >
        {{ t('manual.title') }}
      </h2>
      <button
        type="button"
        class="relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition"
        :class="manual.on ? 'bg-[var(--ink)]' : 'bg-[var(--line)] hover:bg-[var(--muted)]'"
        :aria-label="t('manual.title')"
        :aria-pressed="manual.on"
        @click="patch({ on: !manual.on, selected: !manual.on ? 'body' : null })"
      >
        <span
          class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition"
          :class="manual.on && 'translate-x-4'"
        />
      </button>
    </div>

    <h2 class="mt-5 text-sm font-semibold">{{ t('panel.shape') }}</h2>
    <div class="mt-2 grid grid-cols-4 gap-1.5">
      <BotTile
        v-for="id in shapes"
        :key="id"
        :label="shapeName(id)"
        :selected="id === shape"
        :shape="id"
        :color="color"
        :paper="oeil || '#f9f9f9'"
        :state="expression"
        :active="active"
        @click="shape = id"
      />
    </div>

    <h2 class="mt-5 text-sm font-semibold">{{ t('panel.expression') }}</h2>
    <div class="mt-2 grid grid-cols-4 gap-1.5">
      <BotTile
        v-for="id in EXPRESSION_IDS"
        :key="id"
        :label="stateName(id)"
        :selected="id === expression"
        :shape="shape"
        :color="color"
        :paper="oeil || '#f9f9f9'"
        :state="id"
        :active="active"
        @click="expression = id"
      />
    </div>

    <h2 class="mt-5 text-sm font-semibold">{{ t('panel.color') }}</h2>
    <div class="mt-2 grid grid-cols-6 gap-1.5">
      <button
        v-for="id in COLOR_IDS"
        :key="id"
        type="button"
        class="flex aspect-square cursor-pointer items-center justify-center rounded-full border-2 transition"
        :class="
          estNuancier(id) ? 'border-[var(--ink)]' : 'border-transparent hover:border-[var(--line)]'
        "
        :aria-label="id"
        :aria-pressed="estNuancier(id)"
        :title="id"
        @click="choisitNuancier(id)"
      >
        <span
          class="block h-[78%] w-[78%] rounded-full ring-1 ring-black/10 ring-inset"
          :style="{ background: colorFill(id) }"
        />
      </button>
      <label
        class="relative flex aspect-square cursor-pointer items-center justify-center rounded-full border-2 transition"
        :class="
          estPerso ? 'border-[var(--ink)]' : 'border-transparent hover:border-[var(--line)]'
        "
        :title="t('panel.custom')"
      >
        <span
          class="block h-[78%] w-[78%] rounded-full ring-1 ring-black/10 ring-inset"
          :style="{ background: estPerso ? flatHex : PERSO_FOND }"
        />
        <input
          type="color"
          class="absolute inset-0 cursor-pointer opacity-0"
          :value="flatHex"
          :aria-label="t('panel.custom')"
          @input="saisitPerso"
        />
      </label>
    </div>

    <div class="mt-2.5 flex rounded-full bg-black/[0.04] p-0.5">
      <button
        type="button"
        class="flex-1 cursor-pointer rounded-full px-1 py-1 text-xs whitespace-nowrap transition"
        :class="
          activeSpec.kind === 'flat'
            ? 'bg-[var(--ink)] font-medium text-[var(--paper)]'
            : 'text-[var(--muted)] hover:text-[var(--ink)]'
        "
        :aria-pressed="activeSpec.kind === 'flat'"
        @click="choisitUni"
      >
        {{ t('panel.flat') }}
      </button>
      <button
        type="button"
        class="flex-1 cursor-pointer rounded-full px-1 py-1 text-xs whitespace-nowrap transition"
        :class="
          activeSpec.kind === 'grad'
            ? 'bg-[var(--ink)] font-medium text-[var(--paper)]'
            : 'text-[var(--muted)] hover:text-[var(--ink)]'
        "
        :aria-pressed="activeSpec.kind === 'grad'"
        @click="choisitDegrade"
      >
        {{ t('panel.linear') }}
      </button>
      <button
        type="button"
        class="flex-1 cursor-pointer rounded-full px-1 py-1 text-xs whitespace-nowrap transition"
        :class="
          activeSpec.kind === 'radial'
            ? 'bg-[var(--ink)] font-medium text-[var(--paper)]'
            : 'text-[var(--muted)] hover:text-[var(--ink)]'
        "
        :aria-pressed="activeSpec.kind === 'radial'"
        @click="choisitRadial"
      >
        {{ t('panel.radial') }}
      </button>
    </div>

    <div
      v-if="activeSpec.kind === 'grad' || activeSpec.kind === 'radial'"
      class="mt-2 flex items-center gap-2"
    >
      <div class="teinte-barre min-w-0 flex-1" :style="{ background: apercu }">
        <label
          v-if="activeSpec.kind === 'grad'"
          class="photo-puce"
          :title="gradFrom.toUpperCase()"
          :style="{ background: gradFrom }"
        >
          <input
            type="color"
            :value="gradFrom"
            :aria-label="t('panel.gradFrom')"
            @input="saisit('from', $event)"
          />
        </label>
        <button
          v-if="activeSpec.kind === 'grad'"
          type="button"
          class="absolute top-1/2 left-1/2 z-10 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[var(--muted)] shadow-sm ring-1 ring-black/10 transition hover:text-[var(--ink)]"
          :aria-label="t('panel.swap')"
          :title="t('panel.swap')"
          @click="echangeDegrade"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M8 3 4 7l4 4" />
            <path d="M4 7h16" />
            <path d="m16 21 4-4-4-4" />
            <path d="M20 17H4" />
          </svg>
        </button>
        <label
          v-if="activeSpec.kind === 'radial'"
          class="photo-puce photo-puce--coeur"
          :title="gradFrom.toUpperCase()"
          :style="{ background: gradFrom }"
        >
          <input
            type="color"
            :value="gradFrom"
            :aria-label="t('panel.gradInner')"
            @input="saisit('from', $event)"
          />
        </label>
        <label
          class="photo-puce photo-puce--fin"
          :title="gradTo.toUpperCase()"
          :style="{ background: gradTo }"
        >
          <input
            type="color"
            :value="gradTo"
            :aria-label="activeSpec.kind === 'radial' ? t('panel.gradOuter') : t('panel.gradTo')"
            @input="saisit('to', $event)"
          />
        </label>
      </div>
      <button
        v-if="activeSpec.kind === 'grad'"
        type="button"
        class="teinte-cadran"
        :style="{ background: apercu }"
        :aria-label="t('panel.angle')"
        :title="`${gradAngle}°`"
        role="slider"
        :aria-valuenow="gradAngle"
        aria-valuemin="0"
        aria-valuemax="359"
        @pointerdown="cadranPointe"
        @pointermove="cadranGlisse"
        @keydown="cadranClavier"
      >
        <span
          class="pointer-events-none absolute inset-0"
          :style="{ transform: `rotate(${gradAngle}deg)` }"
        >
          <i class="teinte-cadran-aiguille" aria-hidden="true" />
        </span>
      </button>
      <button
        v-else
        type="button"
        class="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full bg-white text-[var(--muted)] shadow-sm ring-1 ring-black/10 transition hover:text-[var(--ink)]"
        :aria-label="t('panel.swapRadial')"
        :title="t('panel.swapRadial')"
        @click="echangeDegrade"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M8 3 4 7l4 4" />
          <path d="M4 7h16" />
          <path d="m16 21 4-4-4-4" />
          <path d="M20 17H4" />
        </svg>
      </button>
    </div>

    <div class="mt-5 flex items-center gap-1.5">
      <h2 class="flex-1 text-sm font-semibold">{{ t('panel.eye') }}</h2>
      <button
        v-if="oeil"
        type="button"
        class="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--muted)] transition hover:bg-black/5 hover:text-[var(--ink)]"
        :aria-label="t('panel.eyeReset')"
        :title="t('panel.eyeReset')"
        @click="reinitialiseOeil"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </button>
      <label
        class="teinte-oeil"
        :class="oeil && 'est-teint'"
        :title="oeilHex.toUpperCase()"
      >
        <span class="teinte-oeil-blanc" :style="{ background: oeilHex }" />
        <span class="teinte-oeil-pupille" />
        <input
          type="color"
          :value="oeilHex"
          :aria-label="t('panel.eye')"
          @input="saisit('oeil', $event)"
        />
      </label>
    </div>
  </div>
</template>
