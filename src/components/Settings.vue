<script setup lang="ts">
import { langue, LANGUES, t } from '@/i18n'

defineProps<{
  ready: boolean
}>()

function auClavier(event: KeyboardEvent, index: number) {
  const pas = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
  if (!pas) return
  event.preventDefault()
  const cible = LANGUES[(index + pas + LANGUES.length) % LANGUES.length]!
  langue.value = cible.id
  const boutons = (event.currentTarget as HTMLElement).parentElement?.children
  const suivant = boutons?.[LANGUES.indexOf(cible)]
  if (suivant instanceof HTMLElement) suivant.focus()
}
</script>

<template>
  <div>
    <h2 class="text-sm font-semibold">{{ t('settings.language') }}</h2>
    <div class="mt-2 flex flex-col gap-1" role="radiogroup" :aria-label="t('settings.language')">
      <button
        v-for="(l, i) in LANGUES"
        :key="l.id"
        type="button"
        role="radio"
        :aria-checked="l.id === langue"
        :aria-label="l.nom"
        :lang="l.tag"
        :tabindex="l.id === langue ? 0 : -1"
        class="flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition"
        :class="
          l.id === langue
            ? 'border-[var(--ink)] bg-white font-medium'
            : 'border-[var(--line)] text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--ink)]'
        "
        @keydown="auClavier($event, i)"
        @click="langue = l.id"
      >
        <span class="text-base leading-none" aria-hidden="true">{{ l.emoji }}</span>
        <span class="flex-1">{{ l.nom }}</span>
        <svg
          v-if="l.id === langue"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden="true"
          class="shrink-0"
        >
          <path
            d="M2.5 6.4 4.8 8.7 9.5 3.6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <h2 class="mt-6 text-sm font-semibold">{{ t('settings.about') }}</h2>
    <a
      class="mt-2 flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm transition hover:border-[var(--muted)]"
      href="/replica/index.html"
      :aria-label="t('settings.labAria')"
    >
      <span class="flex-1">{{ t('settings.lab') }}</span>
    </a>
    <a
      class="mt-1.5 flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm transition hover:border-[var(--muted)]"
      href="/replica/showcase.html"
      :aria-label="t('settings.showcaseAria')"
    >
      <span class="flex-1">{{ t('settings.showcase') }}</span>
    </a>
    <p class="mt-4 text-xs text-[var(--muted)]">{{ t('settings.credits') }}</p>
    <p v-if="!ready" class="mt-2 text-xs text-[var(--muted)]">{{ t('settings.missing') }}</p>
  </div>
</template>
