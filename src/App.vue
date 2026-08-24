<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import AnimPanel from '@/components/AnimPanel.vue'
import Customizer from '@/components/Customizer.vue'
import PlaybackBar from '@/components/PlaybackBar.vue'
import CycleDialog from '@/components/CycleDialog.vue'
import ExportBar from '@/components/ExportBar.vue'
import GifDialog from '@/components/GifDialog.vue'
import AvatarStage from '@/components/AvatarStage.vue'
import PhotoFrame from '@/components/PhotoFrame.vue'
import PhotoPanel from '@/components/PhotoPanel.vue'
import Settings from '@/components/Settings.vue'
import SideRail, { type ViewId } from '@/components/SideRail.vue'
import Timeline from '@/components/Timeline.vue'
import {
  blockAt,
  blocksWith,
  defaultCycle,
  parseCycles,
  totalDuration,
  type Cycle
} from '@/editor/cycles'
import { nomDeCycle, t } from '@/i18n'
import { DEFAULT_COLOR, DEFAULT_EXPRESSION, DEFAULT_SHAPE, estForme } from '@/replica/catalog'
import {
  copie,
  copieTexte,
  cycleVersGif,
  cycleVersMp4,
  svgAutonome,
  telecharge,
  versGifAnime,
  versPng,
  versSvgAnime
} from '@/ui/capture'
import {
  ACTION_BY_ID,
  ANIM_IMAGES,
  ANIM_PAS,
  BLANC,
  CYCLE_TAILLE,
  FOND_GIF_DEFAUT,
  FORMAT_CYCLE_DEFAUT,
  GIF_IMAGES,
  GIF_PAS,
  Abandon,
  couleurDeFond,
  cycleImages,
  cyclePas,
  nomFichier,
  tailleAction,
  viewBoxExport,
  type ActionId,
  type EtatExport,
  type FondGif,
  type FormatCycle
} from '@/ui/export'
import {
  ANGLE_DEFAUT,
  COMPOSITION_DEFAUT,
  svgPhoto,
  type CompositionPhoto,
  type FondPhoto
} from '@/ui/photo'
import { parseManual, persistable, type ManualState } from '@/ui/pose/model'
import { ecris, lis } from '@/ui/stockage'

const view = ref<ViewId>('personnaliser')
const preview = ref(false)
const ready = ref(false)
const savedShape = lis('forme')
const shape = ref(savedShape && estForme(savedShape) ? savedShape : DEFAULT_SHAPE)
const color = ref(lis('couleur') || DEFAULT_COLOR)
const oeil = ref(lis('oeil') || '')
const expression = ref(lis('expression') || DEFAULT_EXPRESSION)
const intro = ref(true)
const hero = ref<{
  spin: () => void
  orbitGaze: (ms?: number) => void
  svg: () => SVGSVGElement | null
  seekEye: (index: number, opts?: { snap?: boolean }) => void
  flushPerformance: () => void
  setPlaylistHold: (on: boolean) => void
  setPaused: (on: boolean | 'hold-pose') => void
  holdFrame: (at?: number) => void
  freezeNow: (opts?: { settle?: boolean }) => unknown
  playback: () => {
    state: string
    eyeIdx: number
    holdMs: number
    remainMs: number
    held: boolean
    frozen: boolean
    manualMix: number
  } | null
} | null>(null)
const manual = ref<ManualState>(parseManual(lis('manuel')))

/* ---- mode photo : cadrage, fond et capture de l'avatar fige ---- */
const photo = ref(false)
const photoOutil = ref<'cadre' | 'pose'>('cadre')
const photoComposition = ref<CompositionPhoto>({ ...COMPOSITION_DEFAUT, cornerRadius: 18 })
const photoFond = ref<FondPhoto>('transparent')
const photoCouleurDe = ref('#F5F7FC')
const photoCouleurA = ref('#C9D5FF')
const photoAngle = ref(ANGLE_DEFAUT)
const photoFormat = ref<'png' | 'svg'>('png')
const photoTaille = ref(1024)
const photoFlash = ref(0)
const photoAvantJoue = ref(true)
let minuteurPhoto: ReturnType<typeof setTimeout> | undefined

const restored = parseCycles(lis('cycles'))
const cycles = ref<Cycle[]>(restored.length ? restored : [defaultCycle()])
const activeId = ref(
  (() => {
    const v = lis('cycle')
    return v && cycles.value.some((c) => c.id === v) ? v : cycles.value[0]!.id
  })()
)
const block = ref(0)
const elapsed = ref(0)
const playing = ref(false)
let seeking = false

const cycle = computed(() => cycles.value.find((c) => c.id === activeId.value) ?? cycles.value[0]!)
const state = ref(intro.value ? 'idle' : (cycle.value.blocks[block.value]?.state ?? 'idle'))

const gauche = computed(() => view.value === 'reglages' && !preview.value)
const autoTricks = computed(() => view.value === 'animations')
const droite = computed(() => view.value !== 'reglages' && !preview.value && !intro.value)
const plein = computed(() => preview.value || photo.value)
const follow = computed(() => view.value === 'reglages' && !preview.value)
const nue = computed(() => intro.value && !preview.value)
const playedState = computed(() => {
  if (photo.value) return expression.value
  if (view.value === 'animations' || preview.value) return state.value
  return expression.value
})
const avatarSize = computed(() => {
  if (photo.value) return 460
  if (preview.value) return 560
  if (view.value === 'personnaliser') return 580
  return 440
})
const avatarMax = computed(() => {
  if (photo.value)
    return 'max-w-[min(460px,68vw,calc(100dvh_-_14rem))] max-lg:max-w-[calc(54dvh_-_12.5rem)]'
  if (preview.value) return 'max-w-[min(560px,calc(100dvh_-_6rem))]'
  if (view.value === 'personnaliser')
    return 'max-w-[min(600px,calc(100dvh_-_var(--timeline)_-_7rem))]'
  return 'max-w-[min(460px,calc(100dvh_-_var(--timeline)_-_7rem))]'
})

watch(shape, (id) => {
  ecris('forme', id)
  if (manual.value.selected) manual.value = { ...manual.value, selected: null }
})
watch(color, (id) => ecris('couleur', id))
watch(oeil, (v) => ecris('oeil', v))
watch(expression, (id) => {
  ecris('expression', id)
  if (photo.value) {
    // en photo, l'avatar est fige : on libere le temps de la transition
    // spring vers la nouvelle expression, puis on regele.
    hero.value?.setPaused(false)
    clearTimeout(minuteurPhoto)
    minuteurPhoto = setTimeout(() => hero.value?.freezeNow({ settle: true }), 700)
    return
  }
  if (view.value !== 'animations') state.value = id
  if (view.value !== 'personnaliser') return
  poseIdx.value = 0
  poseElapsed.value = 0
  if (manual.value.on) return
  posePlay.value = true
  poseStopped.value = false
})
watch(
  manual,
  (value) => {
    ecris('manuel', JSON.stringify(persistable(value)))
  },
  { deep: true }
)

let pending: ReturnType<typeof setTimeout>
function enregistreCycles() {
  clearTimeout(pending)
  ecris('cycles', JSON.stringify(cycles.value))
}
watch(cycles, () => {
  clearTimeout(pending)
  pending = setTimeout(enregistreCycles, 250)
})
watch(activeId, (v) => {
  ecris('cycle', v)
  block.value = 0
  elapsed.value = 0
  state.value = cycle.value.blocks[0]?.state ?? 'idle'
})

watch(block, (i) => {
  if (seeking) {
    seeking = false
    return
  }
  elapsed.value = 0
  state.value = cycle.value.blocks[i]?.state ?? 'idle'
})

watch(
  () => cycle.value.blocks.length,
  (n) => {
    if (block.value >= n) block.value = Math.max(0, n - 1)
  }
)

function addBlock(id: string) {
  cycles.value = cycles.value.map((c) =>
    c.id === cycle.value.id ? { ...c, blocks: blocksWith(c.blocks, id) } : c
  )
}

function onSeek(t: number) {
  const { index, elapsed: offset } = blockAt(cycle.value.blocks, t)
  seeking = true
  block.value = index
  elapsed.value = offset
  state.value = cycle.value.blocks[index]?.state ?? 'idle'
}

const posePlay = ref(!manual.value.on)
const poseStopped = ref(false)
const poseIdx = ref(0)
const poseElapsed = ref(0)
const poseHold = ref(2)
const poseMix = ref(0)

watch(
  () => manual.value.on,
  (on) => {
    if (view.value !== 'personnaliser') return
    if (on) {
      posePlay.value = false
      // en photo, l'entree a gele le moteur : le degeler pour que le
      // ressort manualMix reparte et laisse apparaitre les gizmos.
      if (photo.value) hero.value?.setPaused(false)
      pausePose()
    } else {
      posePlay.value = true
      releasePoseFreeze()
    }
  }
)

function onSeekPose(index: number) {
  const frozen = !!hero.value?.playback()?.frozen
  hero.value?.seekEye(index, { snap: frozen })
  poseIdx.value = index
}

function releasePoseFreeze() {
  hero.value?.setPaused(false)
  hero.value?.setPlaylistHold(false)
}

function playPose() {
  poseStopped.value = false
  hero.value?.setPaused(false)
  hero.value?.setPlaylistHold(false)
}

function pausePose(settle = false) {
  hero.value?.setPlaylistHold(true)
  if (manual.value.on) {
    hero.value?.setPaused(true)
    return
  }
  hero.value?.seekEye(poseIdx.value, { snap: true })
  hero.value?.freezeNow({ settle })
}

function applyPosePlayback() {
  if (view.value !== 'personnaliser' || preview.value) return
  if (posePlay.value) playPose()
  else pausePose(poseStopped.value)
}

function onStopPose() {
  poseStopped.value = true
  posePlay.value = false
  if (view.value === 'personnaliser') pausePose(true)
}

function ouvrePhoto() {
  if (!hero.value || intro.value || preview.value) return
  // fige l'instant present : l'expression affichee devient la pose photo.
  expression.value = playedState.value
  photoOutil.value = 'cadre'
  photoAvantJoue.value = posePlay.value
  posePlay.value = false
  poseStopped.value = false
  pausePose(true)
  photo.value = true
}

function fermePhoto() {
  photo.value = false
  clearTimeout(minuteurPhoto)
  photoFlash.value = 0
  hero.value?.setPaused(false)
  posePlay.value = photoAvantJoue.value && !manual.value.on
  void nextTick(applyPosePlayback)
}

function recadrePhoto() {
  photoComposition.value = {
    ...COMPOSITION_DEFAUT,
    cornerRadius: photoComposition.value.cornerRadius
  }
}

function choisitOutil(outil: 'cadre' | 'pose') {
  photoOutil.value = outil
  if (outil === 'pose' && !manual.value.on) {
    manual.value = { ...manual.value, on: true, selected: manual.value.selected ?? 'body' }
  }
}

/**
 * Choisir une expression quitte le reglage manuel (la pose revient a
 * l'expression) puis enchaine la transition — meme si l'expression cliquee
 * est celle d'origine, la grille n'affichant aucune selection en manuel.
 */
function choisitExpression(id: string) {
  if (manual.value.on) manual.value = { ...manual.value, on: false, selected: null }
  if (id === expression.value) {
    hero.value?.setPaused(false)
    clearTimeout(minuteurPhoto)
    minuteurPhoto = setTimeout(() => hero.value?.freezeNow({ settle: true }), 700)
    return
  }
  expression.value = id
}

async function prendPhoto() {
  const svg = hero.value?.svg()
  if (!svg || !photo.value || etatExport.value === 'occupe') return
  clearTimeout(minuteurPhoto)
  hero.value?.freezeNow({ settle: true })
  photoFlash.value++
  clearTimeout(confirmation)
  etatExport.value = 'occupe'
  try {
    // le viewBox vivant du moment : c'est lui que le cadre affiche.
    const vue = svg.getAttribute('viewBox') || viewBoxExport()
    const markup = svgAutonome(svg, 300, vue)
    const complet = svgPhoto(markup, {
      fond: photoFond.value,
      couleurDe: photoCouleurDe.value,
      couleurA: photoCouleurA.value,
      angle: photoAngle.value,
      taille: photoTaille.value,
      composition: photoComposition.value
    })
    const nom = nomFichier(shape.value, expression.value, color.value, photoFormat.value, 'photo')
    const fichier =
      photoFormat.value === 'svg'
        ? new Blob([complet], { type: 'image/svg+xml' })
        : await versPng(complet, photoTaille.value)
    telecharge(fichier, nom)
    etatExport.value = 'exporte'
  } catch {
    etatExport.value = 'erreur'
  }
  confirmation = setTimeout(() => (etatExport.value = 'pret'), CONFIRMATION_MS)
}

const gardeAnim = ref(false)

watch(view, (now, prev) => {
  intro.value = false
  if (photo.value) fermePhoto()
  if (prev === 'personnaliser' && now !== 'personnaliser') releasePoseFreeze()
  if (now === 'animations') {
    gardeAnim.value = true
    playing.value = true
    state.value = cycle.value.blocks[block.value]?.state ?? 'idle'
    return
  }
  playing.value = now === 'reglages'
  state.value = expression.value
  if (now === 'personnaliser') {
    void nextTick(() => {
      hero.value?.flushPerformance()
      applyPosePlayback()
    })
  }
})

watch(preview, (on) => {
  if (on) {
    playing.value = true
    releasePoseFreeze()
    return
  }
  if (view.value === 'personnaliser') void nextTick(applyPosePlayback)
})

watch(posePlay, (on) => {
  if (view.value !== 'personnaliser') return
  if (on) playPose()
  else pausePose(poseStopped.value)
})

let raf = 0
let last = 0
function tick(ms: number) {
  raf = requestAnimationFrame(tick)
  const dt = last ? Math.min((ms - last) / 1000, 0.064) : 0
  last = ms
  if (view.value === 'personnaliser' && !preview.value) {
    const snap = hero.value?.playback()
    if (snap) {
      poseIdx.value = snap.eyeIdx
      poseHold.value = snap.holdMs / 1000
      poseElapsed.value = Math.max(0, (snap.holdMs - snap.remainMs) / 1000)
      if (typeof snap.manualMix === 'number') poseMix.value = snap.manualMix
    }
  }
  if (!playing.value || (view.value !== 'animations' && !preview.value)) return
  const blocs = cycle.value.blocks
  const cur = blocs[block.value]
  if (!cur) return
  elapsed.value += dt
  if (elapsed.value >= cur.duration) {
    const next = (block.value + 1) % blocs.length
    seeking = true
    block.value = next
    elapsed.value = 0
    state.value = blocs[next]!.state
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (photo.value) fermePhoto()
    else preview.value = false
  }
  if (e.code !== 'Space') return
  if (view.value !== 'animations' && !preview.value && !photo.value) return
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
  const node = e.target
  if (
    node instanceof HTMLElement &&
    node.closest('input, textarea, select, [contenteditable="true"], dialog')
  ) {
    return
  }
  e.preventDefault()
  playing.value = !playing.value
}

function onPageHide() {
  clearTimeout(pending)
  ecris('cycles', JSON.stringify(cycles.value))
}

const RETARD_ARRIVEE = 400
const barreCachee = ref(false)
let minuteurBarre: ReturnType<typeof setTimeout> | undefined
watch(nue, (encore, avant) => {
  if (!avant || encore) return
  barreCachee.value = true
  clearTimeout(minuteurBarre)
  minuteurBarre = setTimeout(() => (barreCachee.value = false), RETARD_ARRIVEE)
})

const dialogueCycle = ref(false)
const formatCycle = ref<FormatCycle>(FORMAT_CYCLE_DEFAUT)
const fondCycle = ref<FondGif>(FOND_GIF_DEFAUT)
const avancementCycle = ref<number | null>(null)
const erreurCycle = ref(false)
let abandonCycle: AbortController | null = null

async function exporteCycle() {
  if (avancementCycle.value !== null) return
  erreurCycle.value = false
  const controle = new AbortController()
  abandonCycle = controle
  const blocs = cycle.value.blocks
  const format = formatCycle.value
  const images = cycleImages(totalDuration(blocs), format)
  const pas = cyclePas(format)
  const taille = CYCLE_TAILLE[format]
  const reglages = {
    shape: shape.value,
    color: color.value,
    oeil: oeil.value || undefined,
    expression: expression.value
  }
  const suit = (fait: number, total: number) => (avancementCycle.value = fait / total)
  avancementCycle.value = 0
  try {
    const mp4 = format === 'mp4'
    const fichier = mp4
      ? await cycleVersMp4(reglages, blocs, taille, images, pas, BLANC, suit, controle.signal)
      : await cycleVersGif(
          reglages,
          blocs,
          taille,
          images,
          pas,
          couleurDeFond(fondCycle.value),
          suit,
          controle.signal
        )
    telecharge(fichier, nomFichier(nomDeCycle(cycle.value), '', '', mp4 ? 'mp4' : 'gif'))
    dialogueCycle.value = false
  } catch (e) {
    if (!(e instanceof Abandon)) erreurCycle.value = true
  } finally {
    avancementCycle.value = null
    abandonCycle = null
  }
}

function annuleCycle() {
  abandonCycle?.abort()
}

watch(dialogueCycle, (ouverte) => {
  if (ouverte) erreurCycle.value = false
  else annuleCycle()
})

watch([view, preview], () => {
  if (manual.value.selected) manual.value = { ...manual.value, selected: null }
  if (view.value !== 'animations' || preview.value) annuleCycle()
})

const CONFIRMATION_MS = 1800
const etatExport = ref<EtatExport>('pret')
let confirmation: ReturnType<typeof setTimeout> | undefined
const fondGif = ref<FondGif>(FOND_GIF_DEFAUT)
const dialogueGif = ref(false)

async function exporte(id: ActionId, confirme = false) {
  if (etatExport.value === 'occupe') return
  if (!confirme && ACTION_BY_ID.get(id)?.mode === 'gif') {
    dialogueGif.value = true
    return
  }
  const action = ACTION_BY_ID.get(id)
  const svg = hero.value?.svg()
  if (!action || !svg) return
  clearTimeout(confirmation)
  etatExport.value = 'occupe'
  const cote = tailleAction(action)
  const nom = () =>
    nomFichier(shape.value, expression.value, color.value, action.extension, action.suffixe)
  try {
    if (action.mode === 'anime') {
      const reglages = {
    shape: shape.value,
    color: color.value,
    oeil: oeil.value || undefined,
    expression: expression.value
  }
      telecharge(await versSvgAnime(reglages, cote, ANIM_IMAGES, ANIM_PAS), nom())
      etatExport.value = 'exporte'
    } else if (action.mode === 'gif') {
      const reglages = {
    shape: shape.value,
    color: color.value,
    oeil: oeil.value || undefined,
    expression: expression.value
  }
      telecharge(
        await versGifAnime(reglages, action.taille, GIF_IMAGES, GIF_PAS, couleurDeFond(fondGif.value)),
        nom()
      )
      etatExport.value = 'exporte'
    } else {
      const markup = svgAutonome(svg, cote)
      if (action.mode === 'copieImage') {
        await copie(versPng(markup, cote))
        etatExport.value = 'copie'
      } else if (action.mode === 'copieTexte') {
        await copieTexte(markup)
        etatExport.value = 'copie'
      } else {
        const fichier =
          action.extension === 'svg'
            ? new Blob([markup], { type: 'image/svg+xml' })
            : await versPng(markup, cote)
        telecharge(fichier, nom())
        etatExport.value = 'exporte'
      }
    }
  } catch {
    etatExport.value = 'erreur'
  }
  confirmation = setTimeout(() => (etatExport.value = 'pret'), CONFIRMATION_MS)
}

function onHeroReady(ok: boolean) {
  ready.value = ok
  if (ok) void nextTick(applyPosePlayback)
  if (!intro.value) return
  if (!ok) {
    intro.value = false
    return
  }
  hero.value?.orbitGaze(1500)
  window.setTimeout(() => {
    intro.value = false
  }, 1800)
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('pagehide', onPageHide)
  raf = requestAnimationFrame(tick)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('pagehide', onPageHide)
  cancelAnimationFrame(raf)
  clearTimeout(pending)
  clearTimeout(minuteurBarre)
  clearTimeout(confirmation)
  clearTimeout(minuteurPhoto)
  annuleCycle()
})
</script>

<template>
  <h1 class="sr-only">{{ t('app.name') }}</h1>
  <SideRail v-if="!preview" v-model="view" class="rail" :inert="nue || undefined" />

  <button
    v-if="photo"
    type="button"
    class="photo-sortie fixed top-4 right-4 z-30 flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--line)] bg-white/90 px-3 py-1.5 text-xs text-[var(--muted)] shadow-sm backdrop-blur transition hover:text-[var(--ink)] lg:right-[calc(21.25rem+1rem)]"
    @click="fermePhoto"
  >
    {{ t('photo.exit') }}
    <kbd class="rounded bg-black/5 px-1 py-0.5 text-[10px]">{{ t('preview.key') }}</kbd>
  </button>

  <button
    v-else-if="preview"
    type="button"
    class="fixed top-5 right-5 z-30 flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1.5 text-xs text-[var(--muted)] shadow-sm backdrop-blur transition hover:text-[var(--ink)]"
    @click="preview = false"
  >
    {{ t('preview.exit') }}
    <kbd class="rounded bg-black/5 px-1 py-0.5 text-[10px]">{{ t('preview.key') }}</kbd>
  </button>

  <aside
    v-if="photo"
    class="photo-panneau fixed top-0 right-0 z-20 flex h-dvh w-[21.25rem] flex-col gap-3 overflow-y-auto border-l border-[var(--line)] bg-[var(--paper)] p-4 max-lg:inset-x-0 max-lg:top-auto max-lg:bottom-0 max-lg:h-[46dvh] max-lg:w-auto max-lg:rounded-t-2xl max-lg:border-t"
  >
    <PhotoPanel
      v-model:composition="photoComposition"
      v-model:fond="photoFond"
      v-model:couleur-de="photoCouleurDe"
      v-model:couleur-a="photoCouleurA"
      v-model:angle="photoAngle"
      :expression="expression"
      v-model:format="photoFormat"
      v-model:taille="photoTaille"
      v-model:shape="shape"
      v-model:color="color"
      v-model:manual="manual"
      :manuel="manual.on"
      :active="true"
      @update:expression="choisitExpression"
    />
  </aside>

  <div
    class="scene min-h-full items-stretch justify-center p-8 lg:pr-3 max-lg:flex max-lg:flex-col max-lg:gap-10 max-lg:px-5"
    :class="[
      !plein && 'scene--timeline lg:pb-[calc(var(--timeline)_+_1rem)]',
      !plein && view === 'animations' && 'pb-[calc(var(--timeline)_+_1rem)]',
      !preview && !photo && 'max-lg:pt-20',
      photo && 'max-lg:pt-40 max-lg:pb-[46dvh]',
      nue || preview ? 'scene--seule' : photo ? 'scene--photo' : view === 'reglages' && 'scene--gauche'
    ]"
  >
    <aside
      v-if="!plein"
      class="panneau scene__gauche w-full lg:flex lg:h-[calc(100dvh_-_3rem_-_var(--timeline))] lg:w-80 lg:shrink-0 lg:flex-col lg:justify-center lg:self-start lg:-translate-y-12 lg:pl-14"
      :class="gauche ? 'panneau--ouvert max-lg:order-2' : 'max-lg:hidden'"
    >
      <Settings :ready="ready" />
    </aside>

    <main
      class="scene__avatar relative flex flex-1 items-center justify-center max-lg:order-1 max-lg:flex-col max-lg:gap-4 lg:self-start"
      :class="
        plein
          ? 'lg:min-h-[calc(100dvh_-_4rem)]'
          : 'lg:min-h-[calc(100dvh_-_3rem_-_var(--timeline))]'
      "
    >
      <div
        class="avatar flex aspect-square w-full items-center justify-center"
        :class="[
          avatarMax,
          nue && 'avatar--intro',
          view === 'reglages' && !plein && 'avatar--geant',
          view === 'personnaliser' && !plein && !nue && 'avatar--bas'
        ]"
      >
        <PhotoFrame
          v-model:composition="photoComposition"
          :active="photo"
          :fond="photoFond"
          :couleur-de="photoCouleurDe"
          :couleur-a="photoCouleurA"
          :angle="photoAngle"
          :outil="photoOutil"
          :flash="photoFlash"
        >
          <AvatarStage
            ref="hero"
            class="h-auto max-w-full"
            :size="avatarSize"
            :shape="shape"
            :color="color"
            :paper="oeil || '#f9f9f9'"
            :state="playedState"
            :follow="follow"
            :manual="manual"
            :tools="(view === 'personnaliser' && !preview && !photo) || photo"
            :echelle="photo ? photoComposition.scale : 1"
            :playing="posePlay"
            :mix="poseMix"
            :auto-tricks="autoTricks"
            @ready="onHeroReady"
            @update:manual="manual = $event"
          />
        </PhotoFrame>
      </div>

      <div
        v-if="photo"
        class="photo-barres absolute inset-x-0 bottom-6 z-30 flex flex-col items-center gap-3 max-lg:fixed max-lg:bottom-auto max-lg:top-20 max-lg:left-1/2 max-lg:-translate-x-1/2 max-lg:scale-90"
      >
        <div class="photo-outils flex items-center gap-1 rounded-full bg-white/90 p-1 shadow-sm backdrop-blur">
          <button
            v-for="outil in ['cadre', 'pose'] as const"
            :key="outil"
            type="button"
            class="cursor-pointer rounded-full px-3 py-1.5 text-xs transition"
            :class="
              photoOutil === outil
                ? 'bg-[var(--ink)] font-medium text-[var(--paper)]'
                : 'text-[var(--muted)] hover:text-[var(--ink)]'
            "
            :aria-pressed="photoOutil === outil"
            @click="choisitOutil(outil)"
          >
            {{ t(outil === 'cadre' ? 'photo.toolFrame' : 'photo.toolPose') }}
          </button>
          <button
            type="button"
            class="cursor-pointer rounded-full px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--ink)]"
            @click="recadrePhoto"
          >
            {{ t('photo.reset') }}
          </button>
        </div>
        <button
          type="button"
          class="photo-declencheur flex cursor-pointer items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold shadow-lg transition"
          :class="etatExport === 'occupe' && 'occupe'"
          :disabled="etatExport === 'occupe'"
          @click="prendPhoto"
        >
          <span class="photo-obturateur" aria-hidden="true" />
          <span>{{
            etatExport === 'exporte'
              ? t('export.done')
              : etatExport === 'erreur'
                ? t('export.failed')
                : t('photo.take')
          }}</span>
          <span class="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] font-medium uppercase">
            {{ photoFormat }}
          </span>
        </button>
      </div>

      <div
        v-if="view === 'personnaliser' && !plein"
        class="barre-export flex justify-center gap-2"
        :class="(nue || barreCachee) && 'barre-export--cachee'"
        :inert="nue || barreCachee || undefined"
      >
        <button
          type="button"
          class="photo-entree flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--muted)] shadow-sm transition hover:border-[var(--muted)] hover:text-[var(--ink)]"
          @click="ouvrePhoto"
        >
          <span class="photo-obturateur photo-obturateur--petit" aria-hidden="true" />
          {{ t('photo.open') }}
        </button>
        <ExportBar :etat="etatExport" @exporter="exporte" />
      </div>

      <CycleDialog
        v-if="view === 'animations' && !plein"
        v-model:open="dialogueCycle"
        v-model:format="formatCycle"
        v-model:fond="fondCycle"
        :avancement="avancementCycle"
        :erreur="erreurCycle"
        @confirm="exporteCycle"
        @annuler="annuleCycle"
      />

      <GifDialog
        v-if="view === 'personnaliser' && !plein"
        v-model:open="dialogueGif"
        v-model:fond="fondGif"
        @confirm="exporte('gif', true)"
      />
    </main>

    <aside
      v-if="!plein"
      class="panneau scene__droite w-full lg:w-[21.25rem] lg:shrink-0"
      :class="[
        droite ? 'panneau--ouvert max-lg:order-2' : 'max-lg:hidden',
        view === 'personnaliser' && !intro && 'playback-host'
      ]"
    >
      <Customizer
        v-show="view === 'personnaliser'"
        class="playback-pad"
        v-model:shape="shape"
        v-model:color="color"
        v-model:oeil="oeil"
        v-model:expression="expression"
        v-model:manual="manual"
        :ready="ready"
        :active="view === 'personnaliser'"
      />
      <AnimPanel
        v-if="gardeAnim"
        v-show="view === 'animations'"
        v-model="state"
        :shape="shape"
        :color="color"
        :ready="ready"
        :active="view === 'animations'"
        @pick="addBlock"
      />
      <PlaybackBar
        v-if="view === 'personnaliser' && !intro"
        v-model:playing="posePlay"
        :stopped="poseStopped"
        :expression="expression"
        :cursor="poseIdx"
        :elapsed="poseElapsed"
        :hold="poseHold"
        :shape="shape"
        :color="color"
        :active="view === 'personnaliser'"
        :ready="ready"
        @seek="onSeekPose"
        @stop="onStopPose"
      />
    </aside>
  </div>

  <Timeline
    v-if="view === 'animations' && !plein"
    v-model:cycles="cycles"
    v-model:active-id="activeId"
    v-model:block="block"
    v-model:playing="playing"
    :elapsed="elapsed"
    :shape="shape"
    :color="color"
    :expression="expression"
    @seek="onSeek"
    @preview="preview = true"
    @exporter="dialogueCycle = true"
  />

  <p v-if="view === 'reglages' && !plein" class="wordmark" aria-hidden="true">STUDY</p>
</template>
