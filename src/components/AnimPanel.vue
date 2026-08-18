<script setup lang="ts">
import { computed } from 'vue'
import BotTile from '@/components/BotTile.vue'
import { stateName, t } from '@/i18n'
import { stateGroups } from '@/replica/catalog'

const emit = defineEmits<{ pick: [state: string] }>()
const current = defineModel<string>({ required: true })

const props = defineProps<{
  shape: string
  color: string
  ready?: boolean
}>()

const groups = computed(() => {
  void props.ready
  return stateGroups()
})
</script>

<template>
  <div>
    <h2 class="text-sm font-semibold">{{ t('panel.animations') }}</h2>
    <section v-for="group in groups" :key="group.key" class="mt-4">
      <h3 class="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
        {{
          group.key === 'lifecycle'
            ? t('panel.group_lifecycle')
            : group.key === 'reactions'
              ? t('panel.group_reactions')
              : group.key === 'agent'
                ? t('panel.group_agent')
                : t('panel.group_product')
        }}
      </h3>
      <div class="mt-2 grid grid-cols-4 gap-1.5">
        <BotTile
          v-for="id in group.states"
          :key="id"
          :label="stateName(id)"
          :selected="id === current"
          :state="id"
          :shape="shape"
          :color="color"
          @click="emit('pick', id)"
        />
      </div>
    </section>
  </div>
</template>
