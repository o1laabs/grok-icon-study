<script setup lang="ts">
import BotTile from '@/components/BotTile.vue'
import { stateName, t } from '@/i18n'
import { countdownAngle } from '@/ui/playback'

const props = defineProps<{
  state: string
  shape: string
  color: string
  eye: number
  current: boolean
  elapsed: number
  duration: number
  active?: boolean
}>()

const emit = defineEmits<{ pick: [] }>()
</script>

<template>
  <button
    type="button"
    class="playback-step"
    :aria-pressed="current"
    :aria-label="t('timeline.blockAria', { state: stateName(state), duration: duration })"
    @click="emit('pick')"
  >
    <BotTile
      :label="stateName(state)"
      :selected="false"
      :state="state"
      :shape="shape"
      :color="color"
      :eye="eye"
      :size="44"
      :interactive="false"
      :show-label="false"
      :active="active"
    />
    <span
      v-if="current"
      class="playback-countdown"
      aria-hidden="true"
      :style="{ '--countdown': `${countdownAngle(elapsed, duration)}deg` }"
    />
  </button>
</template>

<style scoped>
.playback-step {
  position: relative;
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  overflow: hidden;
  padding: 0;
  border: 1px solid #e1e5ec;
  border-radius: 11px;
  background: white;
  box-shadow: 0 3px 10px rgb(24 28 35 / 5%);
  cursor: pointer;
}
.playback-step :deep(div) {
  width: 100%;
  height: 100%;
  border: 0;
  padding: 0;
}
.playback-step :deep(svg) {
  width: 100%;
  height: 100%;
}
.playback-step[aria-pressed='true'] {
  border-color: #aebff0;
  background: #edf1ff;
  box-shadow: 0 0 0 2px rgb(91 127 229 / 16%);
}
.playback-countdown {
  position: absolute;
  bottom: 4px;
  left: 4px;
  width: 14px;
  height: 14px;
  border: 2px solid white;
  border-radius: 50%;
  background: conic-gradient(#4f72d8 var(--countdown), white 0);
  box-shadow: 0 1px 4px rgb(24 28 35 / 22%);
  pointer-events: none;
}
</style>
