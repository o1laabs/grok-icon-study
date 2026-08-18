<script setup lang="ts">
import { computed } from 'vue'
import BotTile from '@/components/BotTile.vue'
import { shapeName, stateName, t } from '@/i18n'
import { COLOR_IDS, EXPRESSION_IDS, colorFill, liveShapes } from '@/replica/catalog'

const props = defineProps<{ ready?: boolean; active?: boolean }>()
const shape = defineModel<string>('shape', { required: true })
const color = defineModel<string>('color', { required: true })
const expression = defineModel<string>('expression', { required: true })
const shapes = computed(() => {
  void props.ready
  return liveShapes()
})
</script>

<template>
  <div>
    <h2 class="text-sm font-semibold">{{ t('panel.shape') }}</h2>
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
