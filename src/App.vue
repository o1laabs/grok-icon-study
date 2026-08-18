<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import AnimPanel from '@/components/AnimPanel.vue'
import Customizer from '@/components/Customizer.vue'
import CycleDialog from '@/components/CycleDialog.vue'
import ExportBar from '@/components/ExportBar.vue'
import GifDialog from '@/components/GifDialog.vue'
import Hero from '@/components/Hero.vue'
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
  type ActionId,
  type EtatExport,
  type FondGif,
  type FormatCycle
} from '@/ui/export'
import { ecris, lis } from '@/ui/stockage'

const view = ref<ViewId>('personnaliser')
const preview = ref(false)
const ready = ref(false)
const savedShape = lis('forme')
const shape = ref(savedShape && estForme(savedShape) ? savedShape : DEFAULT_SHAPE)
const color = ref(lis('couleur') || DEFAULT_COLOR)
const expression = ref(lis('expression') || DEFAULT_EXPRESSION)
const intro = ref(true)
const hero = ref<{
  spin: () => void
  orbitGaze: (ms?: number) => void
  svg: () => SVGSVGElement | null
} | null>(null)

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
const droite = computed(() => view.value !== 'reglages' && !preview.value && !intro.value)
const follow = computed(() => view.value === 'reglages' && !preview.value)
const nue = computed(() => intro.value && !preview.value)
const playedState = computed(() => {
  if (view.value === 'animations' || preview.value) return state.value
  return expression.value
})

watch(shape, (id) => ecris('forme', id))
watch(color, (id) => ecris('couleur', id))
watch(expression, (id) => {
  ecris('expression', id)
  if (view.value !== 'animations') state.value = id
})

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

watch(view, (now) => {
  intro.value = false
  if (now === 'animations') {
    playing.value = true
    state.value = cycle.value.blocks[block.value]?.state ?? 'idle'
    return
  }
  playing.value = now === 'reglages'
  state.value = expression.value
})

watch(preview, (on) => {
  if (on) playing.value = true
})

let raf = 0
let last = 0
function tick(ms: number) {
  raf = requestAnimationFrame(tick)
  const dt = last ? Math.min((ms - last) / 1000, 0.064) : 0
  last = ms
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
  if (e.key === 'Escape') preview.value = false
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
  const reglages = { shape: shape.value, color: color.value, expression: expression.value }
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
      const reglages = { shape: shape.value, color: color.value, expression: expression.value }
      telecharge(await versSvgAnime(reglages, cote, ANIM_IMAGES, ANIM_PAS), nom())
      etatExport.value = 'exporte'
    } else if (action.mode === 'gif') {
      const reglages = { shape: shape.value, color: color.value, expression: expression.value }
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
})
</script>

<template>
  <h1 class="sr-only">{{ t('app.name') }}</h1>
  <SideRail v-if="!preview" v-model="view" class="rail" :inert="nue || undefined" />

  <button
    v-if="preview"
    type="button"
    class="fixed top-5 right-5 z-30 flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1.5 text-xs text-[var(--muted)] shadow-sm backdrop-blur transition hover:text-[var(--ink)]"
    @click="preview = false"
  >
    {{ t('preview.exit') }}
    <kbd class="rounded bg-black/5 px-1 py-0.5 text-[10px]">{{ t('preview.key') }}</kbd>
  </button>

  <div
    class="scene min-h-full items-stretch justify-center p-8 max-lg:flex max-lg:flex-col max-lg:gap-10 max-lg:px-5"
    :class="[
      !preview && view === 'animations' && 'scene--timeline pb-[calc(var(--timeline)_+_1rem)]',
      !preview && 'max-lg:pt-20',
      nue || preview ? 'scene--seule' : view === 'reglages' && 'scene--gauche'
    ]"
  >
    <aside
      v-if="!preview"
      class="panneau scene__gauche w-full lg:flex lg:h-[calc(100dvh_-_3rem_-_var(--timeline))] lg:w-80 lg:shrink-0 lg:flex-col lg:justify-center lg:self-start lg:-translate-y-12 lg:pl-14"
      :class="gauche ? 'panneau--ouvert max-lg:order-2' : 'max-lg:hidden'"
    >
      <Settings :ready="ready" />
    </aside>

    <main
      class="scene__avatar relative flex flex-1 items-center justify-center max-lg:order-1 max-lg:flex-col max-lg:gap-4 lg:self-start"
      :class="
        preview
          ? 'lg:min-h-[calc(100dvh_-_4rem)]'
          : 'lg:min-h-[calc(100dvh_-_3rem_-_var(--timeline))]'
      "
    >
      <div
        class="avatar flex aspect-square w-full items-center justify-center"
        :class="[
          preview
            ? 'max-w-[min(560px,calc(100dvh_-_6rem))]'
            : 'max-w-[min(460px,calc(100dvh_-_var(--timeline)_-_7rem))]',
          nue && 'avatar--intro',
          view === 'reglages' && !preview && 'avatar--geant'
        ]"
      >
        <Hero
          ref="hero"
          class="h-auto max-w-full"
          :size="preview ? 560 : 440"
          :shape="shape"
          :color="color"
          :state="playedState"
          :follow="follow"
          @ready="onHeroReady"
        />
      </div>

      <div
        v-if="view === 'personnaliser' && !preview"
        class="barre-export flex justify-center"
        :class="(nue || barreCachee) && 'barre-export--cachee'"
        :inert="nue || barreCachee || undefined"
      >
        <ExportBar :etat="etatExport" @exporter="exporte" />
      </div>

      <CycleDialog
        v-if="view === 'animations' && !preview"
        v-model:open="dialogueCycle"
        v-model:format="formatCycle"
        v-model:fond="fondCycle"
        :avancement="avancementCycle"
        :erreur="erreurCycle"
        @confirm="exporteCycle"
        @annuler="annuleCycle"
      />

      <GifDialog
        v-if="view === 'personnaliser' && !preview"
        v-model:open="dialogueGif"
        v-model:fond="fondGif"
        @confirm="exporte('gif', true)"
      />
    </main>

    <aside
      v-if="!preview"
      class="panneau scene__droite w-full lg:w-80 lg:shrink-0"
      :class="droite ? 'panneau--ouvert max-lg:order-2' : 'max-lg:hidden'"
    >
      <Customizer
        v-if="view === 'personnaliser'"
        v-model:shape="shape"
        v-model:color="color"
        v-model:expression="expression"
        :ready="ready"
      />
      <AnimPanel
        v-else-if="view === 'animations'"
        v-model="state"
        :shape="shape"
        :color="color"
        :ready="ready"
        @pick="addBlock"
      />
    </aside>
  </div>

  <Timeline
    v-if="view === 'animations' && !preview"
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

  <p v-if="view === 'reglages' && !preview" class="wordmark" aria-hidden="true">STUDY</p>
</template>
