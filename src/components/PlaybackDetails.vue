<script setup lang="ts">
import { computed } from 'vue'
import { FIRST_BLINK_MS, blinkRangeOf, holdRangeOf, playlistOf } from '@/replica/motion'
import { secondes, secondesCourtes, stateName, t } from '@/i18n'

const props = defineProps<{
  expression: string
  index: number
  elapsed: number
  hold: number
}>()

const poses = computed(() => playlistOf(props.expression))
const hold = computed(() => holdRangeOf(props.expression))
const blink = computed(() => blinkRangeOf(props.expression))

function span(range: [number, number]) {
  return `${secondesCourtes(range[0] / 1000, 1)}–${secondesCourtes(range[1] / 1000, 1)}`
}
</script>

<template>
  <div class="playback-details">
    <div class="playback-details-header">
      <div>
        <p class="eyebrow">{{ t('playback.details') }}</p>
        <h2>{{ stateName(expression) }}</h2>
        <p>{{ t('playback.summary', { n: poses.length }) }}</p>
      </div>
      <span class="playback-badge">{{ t('playback.mode') }} · {{ t('playback.loop') }}</span>
    </div>
    <div class="playback-detail-grid">
      <div>
        <span>{{ t('playback.clips') }}</span>
        <strong>{{ poses.length }}</strong>
        <small>{{ span(hold) }}</small>
      </div>
      <div>
        <span>{{ t('playback.blinkFirst') }}</span>
        <strong>{{ blink ? span(FIRST_BLINK_MS) : t('playback.blinkOff') }}</strong>
        <small>{{ t('playback.blinkAfter') }}</small>
      </div>
      <div>
        <span>{{ t('playback.blinkGap') }}</span>
        <strong>{{ blink ? span(blink) : t('playback.blinkOff') }}</strong>
        <small>{{ t('playback.blinkRand') }}</small>
      </div>
      <div>
        <span>{{ t('playback.current') }}</span>
        <strong>{{ t('playback.stepOf', { n: index + 1, m: poses.length }) }}</strong>
        <small>
          {{ secondesCourtes(elapsed, 1) }} / {{ secondes(props.hold) }}
        </small>
      </div>
    </div>
  </div>
</template>

<style scoped>
.playback-details {
  display: grid;
  gap: 14px;
  padding: 16px 2px 6px;
  border-top: 1px solid #dfe3eb;
}
.playback-details-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.playback-details-header > div {
  min-width: 0;
}
.eyebrow {
  margin: 0 0 4px;
  color: #7185c4;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}
.playback-details-header h2 {
  margin: 0;
  font-size: 17px;
  letter-spacing: -0.03em;
}
.playback-details-header p:last-child {
  margin: 5px 0 0;
  color: #7f8692;
  font-size: 10px;
  line-height: 1.45;
}
.playback-badge {
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: 999px;
  background: #edf1ff;
  color: #4168d5;
  font-size: 8px;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.playback-detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}
.playback-detail-grid > div {
  display: grid;
  min-width: 0;
  gap: 3px;
  padding: 10px;
  border: 1px solid #e1e5ec;
  border-radius: 11px;
  background: white;
}
.playback-detail-grid span,
.playback-detail-grid small {
  overflow: hidden;
  color: #858b96;
  font-size: 8px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.playback-detail-grid span {
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.playback-detail-grid strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

