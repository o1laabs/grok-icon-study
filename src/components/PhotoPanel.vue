<script setup lang="ts">
import BotTile from '@/components/BotTile.vue'
import { stateName, t, type Cle } from '@/i18n'
import { COLOR_IDS, EXPRESSION_IDS, colorFill, colorHex, inkHex } from '@/replica/catalog'
import { angleDepuisPointeur, PAS_CADRAN, tourAngle } from '@/ui/cadran'
import {
  fondCss,
  paletteAleatoire,
  type CompositionPhoto,
  type FondPhoto
} from '@/ui/photo'
import {
  clampEyes,
  clampOffset,
  clampPose,
  resetAll,
  updateEye,
  type BodyOffset,
  type EyeSide,
  type EyeTune,
  type ManualState
} from '@/ui/pose/model'
import type { HeadPose } from '@/ui/pose/math'

/**
 * Reglages du mode photo : pose chiffree, cadrage, fond, expression et
 * export. Meme rythme que le personnalisateur (titre + contenu, pas de
 * cartes). Presentationnelle — la logique vit dans `App.vue` et `ui/photo.ts`.
 */

defineProps<{ active?: boolean; manuel?: boolean }>()

const composition = defineModel<CompositionPhoto>('composition', { required: true })
const fond = defineModel<FondPhoto>('fond', { required: true })
const couleurDe = defineModel<string>('couleurDe', { required: true })
const couleurA = defineModel<string>('couleurA', { required: true })
const angle = defineModel<number>('angle', { required: true })
const expression = defineModel<string>('expression', { required: true })
const format = defineModel<'png' | 'svg'>('format', { required: true })
const taille = defineModel<number>('taille', { required: true })
const shape = defineModel<string>('shape', { required: true })
const color = defineModel<string>('color', { required: true })
const manual = defineModel<ManualState>('manual', { required: true })

type Cote = 'left' | 'right'

const COTES: Cote[] = ['left', 'right']

const DIMENSIONS = [
  { cle: 'width', libelle: 'manual.width', min: 10, max: 110, pas: 1 },
  { cle: 'height', libelle: 'manual.height', min: 10, max: 110, pas: 1 },
  { cle: 'size', libelle: 'manual.size', min: 0.35, max: 2.2, pas: 0.05 }
] as const

const FONDS: FondPhoto[] = ['transparent', 'solid', 'linear', 'radial']
const TAILLES = [512, 1024, 2048]
const PERSO_FOND =
  'conic-gradient(from 0.5turn, #e02135, #e08600, #009957, #1aa8c4, #0e74e0, #804ee0, #e02a88, #e02135)'

const LIBELLES_FONDS: Record<FondPhoto, Cle> = {
  transparent: 'photo.fond_transparent',
  solid: 'photo.fond_solid',
  linear: 'photo.fond_linear',
  radial: 'photo.fond_radial'
}

const num = (v: string) => Number(v)

function estNuancier(id: string) {
  return colorHex(id).toLowerCase() === couleurDe.value.toLowerCase()
}

function estPerso() {
  return COLOR_IDS.every((id) => colorHex(id).toLowerCase() !== couleurDe.value.toLowerCase())
}

function choisitUni(hex: string) {
  couleurDe.value = hex
  couleurA.value = hex
}

function choisitNuancier(id: string) {
  choisitUni(colorHex(id))
}

function saisitPerso(e: Event) {
  choisitUni((e.target as HTMLInputElement).value)
}

/** Apercu vivant du bouton de fond : le vrai degrade aux couleurs courantes. */
function styleFond(id: FondPhoto) {
  const css = fondCss(id, couleurDe.value, couleurA.value, angle.value)
  return css ? { background: css } : undefined
}

function patch(partiel: Partial<CompositionPhoto>) {
  composition.value = { ...composition.value, ...partiel }
}

function recentre() {
  patch({ x: 0, y: 0, scale: 1 })
}

/* ---- pose chiffree : applique le reglage manuel, avec bornes ---- */

function posePatch(partiel: Partial<HeadPose>) {
  manual.value = { ...manual.value, pose: clampPose({ ...manual.value.pose, ...partiel }) }
}

function offsetPatch(partiel: Partial<BodyOffset>) {
  manual.value = { ...manual.value, offset: clampOffset({ ...manual.value.offset, ...partiel }) }
}

function yeuxPatch(yeux: EyeTune) {
  manual.value = { ...manual.value, eyes: clampEyes(yeux) }
}

function oeil(cote: Cote, partiel: Partial<EyeSide>) {
  yeuxPatch(updateEye(manual.value.eyes, cote, partiel, manual.value.links))
}

function angleOeil(cote: Cote, valeur: number) {
  const autre: Cote = cote === 'left' ? 'right' : 'left'
  const yeux = {
    left: { ...manual.value.eyes.left },
    right: { ...manual.value.eyes.right },
    spacing: manual.value.eyes.spacing
  }
  yeux[cote].angle = valeur
  if (manual.value.links.rotation) yeux[autre].angle = -valeur
  yeuxPatch(yeux)
}

function basculeLien(cle: 'width' | 'height' | 'size' | 'rotation') {
  manual.value = {
    ...manual.value,
    links: { ...manual.value.links, [cle]: !manual.value.links[cle] }
  }
}

function reinitialisePose() {
  manual.value = resetAll(manual.value)
}

/** Le champ pris met le feu sur la piece concernee, comme les gizmos. */
function surligne(partie: 'body' | 'left' | 'right' | null) {
  if (partie && manual.value.selected !== partie) {
    manual.value = { ...manual.value, selected: partie }
  } else if (!partie && manual.value.selected) {
    manual.value = { ...manual.value, selected: null }
  }
}

function aleatoire() {
  const style = fond.value === 'transparent' ? 'solid' : fond.value
  const palette = paletteAleatoire(style, inkHex(color.value), {
    couleurDe: couleurDe.value,
    couleurA: couleurA.value
  })
  couleurDe.value = palette.couleurDe
  couleurA.value = palette.couleurA
  if (fond.value === 'transparent') fond.value = 'solid'
}

function echangeCouleurs() {
  ;[couleurDe.value, couleurA.value] = [couleurA.value, couleurDe.value]
}

function cadranPointe(e: PointerEvent) {
  e.preventDefault()
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  angle.value = tourAngle(angleDepuisPointeur(el, e))
}

function cadranGlisse(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  if (!el.hasPointerCapture(e.pointerId)) return
  angle.value = tourAngle(angleDepuisPointeur(el, e))
}

function cadranClavier(e: KeyboardEvent) {
  const pas = PAS_CADRAN[e.key]
  if (pas == null) return
  e.preventDefault()
  angle.value = tourAngle(angle.value + pas)
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <section v-if="manuel">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold">{{ t('photo.poseTitle') }}</h2>
        <button type="button" class="photo-bouton" @click="reinitialisePose">
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
          {{ t('photo.poseReset') }}
        </button>
      </div>

      <h3 class="mt-2.5 text-xs font-medium text-[var(--muted)]">{{ t('manual.head') }}</h3>
      <div class="mt-1 grid grid-cols-3 gap-1.5">
        <label class="photo-champ">
          <span class="photo-etiquette">{{ t('photo.axisTilt') }}</span>
          <input
            type="number"
            class="mt-0.5"
            :value="manual.pose.tilt"
            :step="1"
            @focus="surligne('body')"
            @blur="surligne(null)"
            @change="posePatch({ tilt: num(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="photo-champ">
          <span class="photo-etiquette">{{ t('photo.axisTurn') }}</span>
          <input
            type="number"
            class="mt-0.5"
            :value="manual.pose.turn"
            :step="1"
            @focus="surligne('body')"
            @blur="surligne(null)"
            @change="posePatch({ turn: num(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="photo-champ">
          <span class="photo-etiquette">{{ t('photo.axisRoll') }}</span>
          <input
            type="number"
            class="mt-0.5"
            :value="manual.pose.roll"
            :step="1"
            @focus="surligne('body')"
            @blur="surligne(null)"
            @change="posePatch({ roll: num(($event.target as HTMLInputElement).value) })"
          />
        </label>
      </div>

      <h3 class="mt-2.5 text-xs font-medium text-[var(--muted)]">{{ t('manual.body') }}</h3>
      <div class="mt-1 grid grid-cols-3 gap-1.5">
        <label class="photo-champ">
          <span class="photo-etiquette">{{ t('photo.posH') }}</span>
          <input
            type="number"
            class="mt-0.5"
            :value="manual.offset.tx"
            :min="-90"
            :max="90"
            :step="1"
            @focus="surligne('body')"
            @blur="surligne(null)"
            @change="offsetPatch({ tx: num(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="photo-champ">
          <span class="photo-etiquette">{{ t('photo.posV') }}</span>
          <input
            type="number"
            class="mt-0.5"
            :value="manual.offset.ty"
            :min="-90"
            :max="90"
            :step="1"
            @focus="surligne('body')"
            @blur="surligne(null)"
            @change="offsetPatch({ ty: num(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="photo-champ">
          <span class="photo-etiquette">{{ t('manual.spin') }}</span>
          <input
            type="number"
            class="mt-0.5"
            :value="manual.offset.spin"
            :min="-180"
            :max="180"
            :step="1"
            @focus="surligne('body')"
            @blur="surligne(null)"
            @change="offsetPatch({ spin: num(($event.target as HTMLInputElement).value) })"
          />
        </label>
      </div>
    </section>

    <section v-if="manuel">
      <h2 class="text-sm font-semibold">{{ t('manual.eyes') }}</h2>

      <div class="mt-2 grid grid-cols-[2.75rem_auto_1fr_1fr] items-center gap-x-1.5 gap-y-1">
        <span class="col-span-2" />
        <span class="photo-etiquette text-center">{{ t('photo.eyeLeft') }}</span>
        <span class="photo-etiquette text-center">{{ t('photo.eyeRight') }}</span>
        <template v-for="d in DIMENSIONS" :key="d.cle">
          <span class="photo-etiquette">{{ t(d.libelle) }}</span>
          <button
            type="button"
            class="photo-lien"
            :aria-pressed="manual.links[d.cle]"
            :aria-label="t('photo.link')"
            :title="t('photo.link')"
            @click="basculeLien(d.cle)"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <template v-if="manual.links[d.cle]">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </template>
              <template v-else>
                <path d="m13.5 7.5 1.9-1.9a4.24 4.24 0 0 1 6 6l-1.9 1.9" />
                <path d="m10.5 16.5-1.9 1.9a4.24 4.24 0 0 1-6-6l1.9-1.9" />
              </template>
            </svg>
          </button>
          <input
            type="number"
            :value="manual.eyes.left[d.cle]"
            :min="d.min"
            :max="d.max"
            :step="d.pas"
            :aria-label="`${t('photo.eyeLeft')}·${t(d.libelle)}`"
            @focus="surligne('left')"
            @blur="surligne(null)"
            @change="oeil('left', { [d.cle]: num(($event.target as HTMLInputElement).value) })"
          />
          <input
            type="number"
            :value="manual.eyes.right[d.cle]"
            :min="d.min"
            :max="d.max"
            :step="d.pas"
            :aria-label="`${t('photo.eyeRight')}·${t(d.libelle)}`"
            @focus="surligne('right')"
            @blur="surligne(null)"
            @change="oeil('right', { [d.cle]: num(($event.target as HTMLInputElement).value) })"
          />
        </template>
      </div>

      <h3 class="mt-2.5 text-xs font-medium text-[var(--muted)]">{{ t('photo.position') }}</h3>
      <div class="mt-1 grid grid-cols-[2.75rem_1fr_1fr_1fr] items-center gap-x-1.5 gap-y-1">
        <span />
        <span class="photo-etiquette text-center">{{ t('photo.posH') }}</span>
        <span class="photo-etiquette text-center">{{ t('photo.posV') }}</span>
        <span class="photo-etiquette text-center">{{ t('photo.angle') }}</span>
        <template v-for="cote in COTES" :key="cote">
          <span class="photo-etiquette">{{ t(cote === 'left' ? 'photo.eyeLeft' : 'photo.eyeRight') }}</span>
          <input
            type="number"
            :value="manual.eyes[cote].x"
            :min="-48"
            :max="48"
            :step="1"
            :aria-label="`${t(cote === 'left' ? 'photo.eyeLeft' : 'photo.eyeRight')}·${t('photo.posH')}`"
            @focus="surligne(cote)"
            @blur="surligne(null)"
            @change="oeil(cote, { x: num(($event.target as HTMLInputElement).value) })"
          />
          <input
            type="number"
            :value="manual.eyes[cote].y"
            :min="-48"
            :max="48"
            :step="1"
            :aria-label="`${t(cote === 'left' ? 'photo.eyeLeft' : 'photo.eyeRight')}·${t('photo.posV')}`"
            @focus="surligne(cote)"
            @blur="surligne(null)"
            @change="oeil(cote, { y: num(($event.target as HTMLInputElement).value) })"
          />
          <input
            type="number"
            :value="manual.eyes[cote].angle"
            :min="-180"
            :max="180"
            :step="1"
            :aria-label="`${t(cote === 'left' ? 'photo.eyeLeft' : 'photo.eyeRight')}·${t('photo.angle')}`"
            @focus="surligne(cote)"
            @blur="surligne(null)"
            @change="angleOeil(cote, num(($event.target as HTMLInputElement).value))"
          />
        </template>
        <span class="photo-etiquette">{{ t('manual.spacing') }}</span>
        <input
          type="number"
          class="col-span-3"
          :value="manual.eyes.spacing"
          :min="0"
          :max="150"
          :step="1"
          :aria-label="t('manual.spacing')"
          @change="yeuxPatch({ ...manual.eyes, spacing: num(($event.target as HTMLInputElement).value) })"
        />
      </div>
    </section>

    <section>
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold">{{ t('photo.composition') }}</h2>
        <button type="button" class="photo-bouton" @click="recentre">
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
            <circle cx="12" cy="12" r="8" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
          {{ t('photo.recentre') }}
        </button>
      </div>
      <div class="mt-2 grid grid-cols-2 gap-1.5">
        <label class="photo-champ">
          <span class="photo-etiquette">{{ t('photo.posH') }}</span>
          <input
            type="number"
            class="mt-0.5"
            :value="composition.x"
            :min="-180"
            :max="180"
            :step="1"
            @change="patch({ x: num(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="photo-champ">
          <span class="photo-etiquette">{{ t('photo.posV') }}</span>
          <input
            type="number"
            class="mt-0.5"
            :value="composition.y"
            :min="-180"
            :max="180"
            :step="1"
            @change="patch({ y: num(($event.target as HTMLInputElement).value) })"
          />
        </label>
        <label class="photo-champ">
          <span class="photo-etiquette">{{ t('photo.zoom') }}</span>
          <input
            type="number"
            class="mt-0.5"
            :value="Math.round(composition.scale * 100)"
            :min="40"
            :max="300"
            :step="5"
            @change="patch({ scale: num(($event.target as HTMLInputElement).value) / 100 })"
          />
        </label>
        <label class="photo-champ">
          <span class="photo-etiquette">{{ t('photo.corner') }}</span>
          <input
            type="number"
            class="mt-0.5"
            :value="composition.cornerRadius"
            :min="0"
            :max="50"
            :step="1"
            @change="patch({ cornerRadius: num(($event.target as HTMLInputElement).value) })"
          />
        </label>
      </div>
    </section>

    <section>
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold">{{ t('photo.background') }}</h2>
        <button type="button" class="photo-bouton" @click="aleatoire">
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
            <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22" />
            <path d="m18 2 4 4-4 4" />
            <path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" />
            <path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8" />
            <path d="m18 14 4 4-4 4" />
          </svg>
          {{ t('photo.random') }}
        </button>
      </div>
      <div class="mt-2 flex rounded-full bg-black/[0.04] p-0.5">
        <button
          v-for="id in FONDS"
          :key="id"
          type="button"
          class="flex-1 cursor-pointer rounded-full px-1 py-1 text-xs whitespace-nowrap transition"
          :class="
            fond === id
              ? 'bg-[var(--ink)] font-medium text-[var(--paper)]'
              : 'text-[var(--muted)] hover:text-[var(--ink)]'
          "
          :aria-pressed="fond === id"
          @click="fond = id"
        >
          {{ t(LIBELLES_FONDS[id]) }}
        </button>
      </div>

      <div v-if="fond === 'solid'" class="mt-2 grid grid-cols-6 gap-1.5">
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
            estPerso() ? 'border-[var(--ink)]' : 'border-transparent hover:border-[var(--line)]'
          "
          :title="t('panel.custom')"
        >
          <span
            class="block h-[78%] w-[78%] rounded-full ring-1 ring-black/10 ring-inset"
            :style="{ background: estPerso() ? couleurDe : PERSO_FOND }"
          />
          <input
            type="color"
            class="absolute inset-0 cursor-pointer opacity-0"
            :value="couleurDe"
            :aria-label="t('panel.custom')"
            @input="saisitPerso"
          />
        </label>
      </div>

      <div
        v-if="fond === 'linear' || fond === 'radial'"
        class="mt-2 flex items-center gap-2"
      >
        <div class="teinte-barre min-w-0 flex-1" :style="styleFond(fond)">
          <label
            v-if="fond === 'linear'"
            class="photo-puce"
            :title="couleurDe.toUpperCase()"
            :style="{ background: couleurDe }"
          >
            <input
              type="color"
              :value="couleurDe"
              :aria-label="t('photo.colorStart')"
              @input="couleurDe = ($event.target as HTMLInputElement).value"
            />
          </label>
          <button
            v-if="fond === 'linear'"
            type="button"
            class="absolute top-1/2 left-1/2 z-10 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[var(--muted)] shadow-sm ring-1 ring-black/10 transition hover:text-[var(--ink)]"
            :aria-label="t('panel.swap')"
            :title="t('panel.swap')"
            @click="echangeCouleurs"
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
            v-if="fond === 'radial'"
            class="photo-puce photo-puce--coeur"
            :title="couleurDe.toUpperCase()"
            :style="{ background: couleurDe }"
          >
            <input
              type="color"
              :value="couleurDe"
              :aria-label="t('photo.colorInner')"
              @input="couleurDe = ($event.target as HTMLInputElement).value"
            />
          </label>
          <label
            class="photo-puce photo-puce--fin"
            :title="couleurA.toUpperCase()"
            :style="{ background: couleurA }"
          >
            <input
              type="color"
              :value="couleurA"
              :aria-label="fond === 'radial' ? t('photo.colorOuter') : t('photo.colorEnd')"
              @input="couleurA = ($event.target as HTMLInputElement).value"
            />
          </label>
        </div>
        <button
          v-if="fond === 'linear'"
          type="button"
          class="teinte-cadran"
          :style="styleFond(fond)"
          :aria-label="t('photo.direction')"
          :title="`${angle}°`"
          role="slider"
          :aria-valuenow="angle"
          aria-valuemin="0"
          aria-valuemax="359"
          @pointerdown="cadranPointe"
          @pointermove="cadranGlisse"
          @keydown="cadranClavier"
        >
          <span
            class="pointer-events-none absolute inset-0"
            :style="{ transform: `rotate(${angle}deg)` }"
          >
            <i class="teinte-cadran-aiguille" aria-hidden="true" />
          </span>
        </button>
        <button
          v-else-if="fond === 'radial'"
          type="button"
          class="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full bg-white text-[var(--muted)] shadow-sm ring-1 ring-black/10 transition hover:text-[var(--ink)]"
          :aria-label="t('panel.swapRadial')"
          :title="t('panel.swapRadial')"
          @click="echangeCouleurs"
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
    </section>

    <section>
      <h2 class="text-sm font-semibold">{{ t('photo.expression') }}</h2>
      <div class="mt-2 grid grid-cols-4 gap-1.5">
        <BotTile
          v-for="id in EXPRESSION_IDS"
          :key="id"
          :label="stateName(id)"
          :selected="!manuel && id === expression"
          :shape="shape"
          :color="color"
          :state="id"
          :active="active"
          @click="expression = id"
        />
      </div>
    </section>

    <section>
      <h2 class="text-sm font-semibold">{{ t('photo.exportTitle') }}</h2>
      <div class="mt-2 flex rounded-full bg-black/[0.04] p-0.5">
        <button
          v-for="id in ['png', 'svg'] as const"
          :key="id"
          type="button"
          class="flex-1 cursor-pointer rounded-full py-1 text-xs uppercase transition"
          :class="
            id === format
              ? 'bg-[var(--ink)] font-medium text-[var(--paper)]'
              : 'text-[var(--muted)] hover:text-[var(--ink)]'
          "
          :aria-pressed="id === format"
          @click="format = id"
        >
          {{ id }}
        </button>
      </div>
      <div class="mt-1.5 flex rounded-full bg-black/[0.04] p-0.5">
        <button
          v-for="n in TAILLES"
          :key="n"
          type="button"
          class="flex-1 cursor-pointer rounded-full py-1 text-xs transition"
          :class="
            n === taille
              ? 'bg-[var(--ink)] font-medium text-[var(--paper)]'
              : 'text-[var(--muted)] hover:text-[var(--ink)]'
          "
          :aria-pressed="n === taille"
          @click="taille = n"
        >
          {{ t('photo.pixels', { n }) }}
        </button>
      </div>
    </section>
  </div>
</template>
