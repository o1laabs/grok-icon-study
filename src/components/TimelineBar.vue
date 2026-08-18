<script setup lang="ts">
import { t } from '@/i18n'

defineProps<{
  playing: boolean
  state: string
}>()

const emit = defineEmits<{
  toggle: []
  preview: []
}>()
</script>

<template>
  <div
    class="fixed right-0 bottom-0 left-0 z-20 border-t border-[var(--line)] bg-[var(--paper)]/90 px-4 py-3 backdrop-blur max-lg:px-5 lg:left-[4.5rem] lg:right-[24.5rem]"
  >
    <div class="mx-auto flex max-w-[460px] items-center justify-between gap-3">
      <button
        type="button"
        class="rounded-xl border border-[var(--line)] px-3 py-1.5 text-sm transition hover:border-[var(--muted)]"
        :aria-label="playing ? t('timeline.pause') : t('timeline.play')"
        @click="emit('toggle')"
      >
        {{ playing ? t('timeline.pause') : t('timeline.play') }}
      </button>
      <span class="tronque text-sm font-medium">{{ state }}</span>
      <button
        type="button"
        class="rounded-xl border border-[var(--line)] px-3 py-1.5 text-sm transition hover:border-[var(--muted)]"
        :aria-label="t('preview.open')"
        @click="emit('preview')"
      >
        {{ t('preview.open') }}
      </button>
    </div>
  </div>
</template>
