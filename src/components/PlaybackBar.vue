<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import PlaybackDetails from '@/components/PlaybackDetails.vue'
import PlaybackIdentity from '@/components/PlaybackIdentity.vue'
import PlaybackStep from '@/components/PlaybackStep.vue'
import { playlistOf } from '@/replica/motion'
import { stateName, t } from '@/i18n'
import { playbackStatus } from '@/ui/playback'
import { useSnapSheet } from '@/ui/useSnapSheet'

const props = defineProps<{
  expression: string
  cursor: number
  elapsed: number
  hold: number
  shape: string
  color: string
  active?: boolean
  ready?: boolean
  stopped?: boolean
}>()

const emit = defineEmits<{
  seek: [index: number]
  stop: []
}>()

const playing = defineModel<boolean>('playing', { required: true })

const details = useTemplateRef<HTMLElement>('details')
const dock = useTemplateRef<HTMLElement>('dock')
const footer = useTemplateRef<HTMLElement>('footer')
const {
  y,
  expanded,
  dragging,
  opacity,
  ready,
  onPointerDown,
  onPointerMove,
  onPointerUp
} = useSnapSheet(details)

const poses = computed(() => {
  void props.ready
  return playlistOf(props.expression)
})
const name = computed(() => stateName(props.expression))
const status = computed(() => playbackStatus(playing.value, props.stopped))

function pick(index: number) {
  emit('seek', index)
}

function publish() {
  const host = dock.value?.closest('.playback-host')
  if (!(host instanceof HTMLElement) || !footer.value) return
  const visible = Math.max(72, footer.value.offsetHeight - y.value)
  host.style.setProperty('--playback-clearance', `${visible + 6}px`)
}

watch(
  [y, expanded, ready, () => poses.value.length],
  () => void nextTick(publish),
  { flush: 'post' }
)

onMounted(() => void nextTick(publish))

watch(
  () => props.cursor,
  async () => {
    await nextTick()
    dock.value
      ?.querySelector<HTMLElement>('.playback-step[aria-pressed="true"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }
)

onBeforeUnmount(() => {
  const host = dock.value?.closest('.playback-host')
  if (host instanceof HTMLElement) host.style.removeProperty('--playback-clearance')
})
</script>

<template>
  <div ref="dock" class="playback-dock">
    <footer
      ref="footer"
      class="playback-bar"
      :class="{
        'is-expanded': expanded,
        'is-dragging': dragging,
        'is-ready': ready
      }"
      :style="{ transform: `translateY(${y}px)` }"
    >
      <div class="playback-handle-slot">
        <button
          type="button"
          class="playback-handle"
          :aria-expanded="expanded"
          :aria-label="expanded ? t('playback.hide') : t('playback.show')"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <span />
        </button>
      </div>

      <div class="playback-strip">
        <div v-if="poses.length > 1" class="playback-steps">
          <PlaybackStep
            v-for="(eye, index) in poses"
            :key="`${expression}-${eye}-${index}`"
            :state="expression"
            :shape="shape"
            :color="color"
            :eye="eye"
            :current="index === cursor"
            :elapsed="index === cursor ? elapsed : 0"
            :duration="hold"
            :active="active"
            @pick="pick(index)"
          />
        </div>
        <div class="playback-controls">
          <PlaybackIdentity :name="name" :status="status" />
          <button
            type="button"
            class="playback-btn"
            :aria-label="
              playing ? t('playback.pause', { name }) : t('playback.play', { name })
            "
            @click="playing = !playing"
          >
            <svg v-if="!playing" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.4086 9.35258C23.5305 10.5065 23.5305 13.4935 21.4086 14.6474L8.59662 21.6145C6.53435 22.736 4 21.2763 4 18.9671L4 5.0329C4 2.72368 6.53435 1.26402 8.59661 2.38548L21.4086 9.35258Z"
              />
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <g fill="currentColor">
                <path
                  d="M2 6C2 4.11438 2 3.17157 2.58579 2.58579C3.17157 2 4.11438 2 6 2C7.88562 2 8.82843 2 9.41421 2.58579C10 3.17157 10 4.11438 10 6V18C10 19.8856 10 20.8284 9.41421 21.4142C8.82843 22 7.88562 22 6 22C4.11438 22 3.17157 22 2.58579 21.4142C2 20.8284 2 19.8856 2 18V6Z"
                />
                <path
                  d="M14 6C14 4.11438 14 3.17157 14.5858 2.58579C15.1716 2 16.1144 2 18 2C19.8856 2 20.8284 2 21.4142 2.58579C22 3.17157 22 4.11438 22 6V18C22 19.8856 22 20.8284 21.4142 21.4142C20.8284 22 19.8856 22 18 22C16.1144 22 15.1716 22 14.5858 21.4142C14 20.8284 14 3.17157 14 18V6Z"
                />
              </g>
            </svg>
          </button>
          <button
            type="button"
            class="playback-btn playback-btn--ghost"
            :aria-label="t('playback.stop', { name })"
            @click="emit('stop')"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M6 3C4.11438 3 3.17157 3 2.58579 3.58579C2 4.17157 2 5.11438 2 7V17C2 18.8856 2 19.8284 2.58579 20.4142C3.17157 21 4.11438 21 6 21H18C19.8856 21 20.8284 21 21.4142 20.4142C22 19.8284 22 18.8856 22 17V7C22 5.11438 22 4.17157 21.4142 3.58579C20.8284 3 19.8856 3 18 3H6Z"
              />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref="details"
        class="playback-details-shell"
        :style="{ opacity }"
        :aria-hidden="!expanded"
      >
        <PlaybackDetails
          :expression="expression"
          :index="cursor"
          :elapsed="elapsed"
          :hold="hold"
        />
      </div>
    </footer>
  </div>
</template>

<style scoped>
.playback-bar {
  position: relative;
  padding: 18px 6px 4px 12px;
  border-top: 1px solid #d9dce3;
  background: rgb(250 251 253 / 96%);
  box-shadow: 0 -10px 30px rgb(24 28 35 / 8%);
  backdrop-filter: blur(14px);
}
.playback-bar.is-ready {
  transition: transform 0.38s cubic-bezier(0.22, 1, 0.36, 1);
}
.playback-bar.is-dragging {
  transition: none;
}
.playback-handle-slot {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  height: 18px;
  align-items: center;
  justify-content: center;
}
.playback-handle {
  display: grid;
  width: 64px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  cursor: grab;
  place-items: center;
  touch-action: none;
}
.playback-handle:active {
  cursor: grabbing;
}
.playback-handle > span {
  width: 38px;
  height: 4px;
  border-radius: 999px;
  background: #b9bfca;
  transition:
    width 160ms ease,
    background-color 160ms ease;
}
.playback-handle:hover > span,
.playback-handle:focus-visible > span {
  width: 44px;
  background: #5b7fe5;
}
.playback-strip {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.playback-steps {
  display: flex;
  min-width: 0;
  flex: 1;
  gap: 5px;
  overflow-x: auto;
  padding: 2px 8px 2px 2px;
  scrollbar-color: #cbd2df transparent;
  scrollbar-width: thin;
}
.playback-controls {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.playback-steps + .playback-controls {
  padding-left: 14px;
  border-left: 1px solid #dfe3eb;
}
.playback-controls :deep(.playback-identity) {
  max-width: 64px;
}
.playback-btn {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: 10px;
  background: #edf1ff;
  color: #4168d5;
  cursor: pointer;
}
.playback-btn--ghost {
  background: transparent;
  color: #7f8692;
}
.playback-btn:hover {
  background: #e0e7ff;
}
.playback-btn--ghost:hover {
  background: #f0f1f4;
  color: #343943;
}
.playback-details-shell {
  will-change: opacity;
}
@media (prefers-reduced-motion: reduce) {
  .playback-bar.is-ready,
  .playback-handle > span {
    transition: none;
  }
}
</style>
