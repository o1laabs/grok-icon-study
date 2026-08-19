<script setup lang="ts">
import type { Cle } from '@/i18n'
import { t } from '@/i18n'
import type { PlaybackStatus } from '@/ui/playback'

defineProps<{ name: string; status: PlaybackStatus }>()

const LABEL: Record<PlaybackStatus, Cle> = {
  playing: 'playback.playing',
  paused: 'playback.paused',
  stopped: 'playback.stopped'
}
</script>

<template>
  <span class="playback-identity" :class="'is-' + status">
    <i />
    <span>
      <small>{{ t(LABEL[status]) }}</small>
      <strong>{{ name }}</strong>
    </span>
  </span>
</template>

<style scoped>
.playback-identity {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  color: #33834b;
}
.playback-identity.is-paused {
  color: #8a6a24;
}
.playback-identity.is-stopped {
  color: #7f8692;
}
.playback-identity i {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 12%, transparent);
}
.playback-identity > span {
  display: grid;
  min-width: 0;
  gap: 1px;
}
.playback-identity small {
  color: #9297a1;
  font-size: 8px;
  font-weight: 750;
  letter-spacing: 0.06em;
  line-height: 1;
  text-transform: uppercase;
}
.playback-identity strong {
  overflow: hidden;
  color: #343943;
  font-size: 10px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
