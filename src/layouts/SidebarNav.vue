<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '../components/ui/Icon.vue'
import { visibleNavGroups } from './navModel'

defineEmits<{ navigate: [] }>()

const route = useRoute()
const { t } = useI18n()

// Shared with the command palette (./navModel); adds the external account
// link when the deployment configures one.
const groups = visibleNavGroups()

function isActive(name: string): boolean {
    if (name === 'pipelines') return route.name === 'pipelines' || route.name === 'pipeline-new'
    return route.name === name
}
</script>

<template>
    <nav class="flex-1 overflow-y-auto px-3">
        <template v-for="(group, gi) in groups" :key="gi">
            <div
                v-if="group.titleKey"
                class="px-[11px] pb-1.5 pt-3.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3"
            >
                {{ t(group.titleKey) }}
            </div>
            <template v-for="item in group.items" :key="item.name">
                <a
                    v-if="item.externalUrl"
                    :href="item.externalUrl"
                    target="_blank"
                    rel="noopener"
                    class="mb-[3px] flex items-center gap-[11px] rounded-[9px] px-[11px] py-[9px] text-[13.5px] font-semibold hover:bg-surface-2"
                    style="color: var(--ink-2)"
                >
                    <Icon :name="item.icon" :size="18" />
                    <span class="flex-1">{{ t(item.labelKey) }}</span>
                    <Icon name="launch" :size="14" />
                </a>
                <RouterLink
                    v-else
                    :to="{ name: item.name }"
                    class="mb-[3px] flex items-center gap-[11px] rounded-[9px] px-[11px] py-[9px] text-[13.5px] font-semibold"
                    :style="{
                        background: isActive(item.name) ? 'var(--accent-soft)' : 'transparent',
                        color: isActive(item.name) ? 'var(--accent-soft-ink)' : 'var(--ink-2)',
                    }"
                    :class="!isActive(item.name) ? 'hover:bg-surface-2' : ''"
                    @click="$emit('navigate')"
                >
                    <Icon :name="item.icon" :size="18" />
                    <span class="flex-1">{{ t(item.labelKey) }}</span>
                    <span
                        v-if="item.badge"
                        class="rounded-full px-[7px] py-0.5 text-[10.5px] font-bold"
                        style="background: var(--accent-soft); color: var(--accent-soft-ink)"
                    >{{ item.badge }}</span>
                </RouterLink>
            </template>
        </template>
    </nav>
</template>
