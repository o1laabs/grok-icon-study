<script setup lang="ts">
import { computed } from 'vue'
import BotTile from '@/components/BotTile.vue'
import { shapeName, stateName, t } from '@/i18n'
import { COLOR_IDS, EXPRESSION_IDS, colorFill, liveShapes } from '@/replica/catalog'
import { type ManualState } from '@/ui/pose/model'

const props = defineProps<{ ready?: boolean; active?: boolean }>()
const shape = defineModel<string>('shape', { required: true })
const color = defineModel<string>('color', { required: true })
const expression = defineModel<string>('expression', { required: true })
const manual = defineModel<ManualState>('manual', { required: true })
const shapes = computed(() => {
  void props.ready
  return liveShapes()
})

function patch(next: Partial<ManualState>) {
  manual.value = { ...manual.value, ...next }
}
</script>

<template>
  <div>
    <h2 class="text-sm font-semibold">{{ t('manual.title') }}</h2>
    <p class="mt-1 text-xs leading-relaxed text-[var(--muted)]">{{ t('manual.help') }}</p>
    <button
      type="button"
      class="mt-2 flex w-full cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition"
      :class="
        manual.on
          ? 'border-[var(--ink)] bg-white font-medium'
          : 'border-[var(--line)] text-[var(--muted)] hover:border-[var(--muted)] hover:text-[var(--ink)]'
      "
      :aria-pressed="manual.on"
      @click="patch({ on: !manual.on, selected: !manual.on ? 'body' : null })"
    >
      <span>{{ t('manual.on') }}</span>
      <span
        class="relative h-5 w-9 shrink-0 rounded-full transition"
        :class="manual.on ? 'bg-[var(--ink)]' : 'bg-[var(--line)]'"
      >
        <span
          class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition"
          :class="manual.on && 'translate-x-4'"
        />
      </span>
    </button>

    <h2 class="mt-5 text-sm font-semibold">{{ t('panel.shape') }}</h2>
    <div class="mt-2 grid grid-cols-4 gap-1.5">
      <BotTile
        v-for="id in shapes"
        :key="id"
        :label="shapeName(id)"
        :selected="id === shape"
        :shape="id"
        :color="color"
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
          id === color ? 'border-[var(--ink)]' : 'border-transparent hover:border-[var(--line)]'
        "
        :aria-label="id"
        :aria-pressed="id === color"
        :title="id"
        @click="color = id"
      >
        <span
          class="block h-[78%] w-[78%] rounded-full ring-1 ring-black/10 ring-inset"
          :style="{ background: colorFill(id) }"
        />
      </button>
    </div>
  </div>
</template>
