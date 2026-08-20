<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '../ui/Icon.vue'
import Spinner from '../ui/Spinner.vue'
import { useSqlEditorStore } from '../../stores/sqlEditor'
import type { TableRef } from '../../api'

const emit = defineEmits<{
    // Asks the view to insert + run a preview statement for the table.
    preview: [table: TableRef]
}>()

const { t } = useI18n()
const store = useSqlEditorStore()

const expanded = ref<Record<string, boolean>>({})
const describing = ref<Record<string, boolean>>({})

interface NamespaceGroup {
    namespace: string
    tables: TableRef[]
}

const groups = computed<NamespaceGroup[]>(() => {
    const byNs = new Map<string, TableRef[]>()
    for (const table of store.tables) {
        const list = byNs.get(table.namespace)
        if (list) list.push(table)
        else byNs.set(table.namespace, [table])
    }
    return [...byNs.entries()].map(([namespace, tables]) => ({ namespace, tables }))
})

async function toggleTable(table: TableRef) {
    const key = store.tableKey(table)
    expanded.value[key] = !expanded.value[key]
    if (expanded.value[key] && !store.columnsByTable[key]) {
        describing.value[key] = true
        try {
            await store.describeTable(table)
        } finally {
            describing.value[key] = false
        }
    }
}

onMounted(() => {
    void store.loadTables()
})
</script>

<template>
    <div class="flex h-full min-h-0 flex-col">
        <div class="flex items-center justify-between px-3 pb-1 pt-3">
            <span class="text-[11px] font-bold uppercase tracking-[0.06em]" style="color: var(--ink-3)">
                {{ t('sqlUi.catalog.title') }}
            </span>
            <button
                class="flex h-6 w-6 items-center justify-center rounded-md hover:bg-surface-2"
                style="color: var(--ink-2)"
                :title="t('sqlUi.catalog.refresh')"
                :disabled="store.tablesLoading"
                @click="store.loadTables(true)"
            >
                <Spinner v-if="store.tablesLoading" :size="13" />
                <Icon v-else name="refresh" :size="13" />
            </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            <div v-if="store.tablesError" class="px-2 py-2 text-[12px]" style="color: var(--err)">
                {{ t('sqlUi.catalog.loadFailed') }}
            </div>
            <div
                v-else-if="store.tablesLoaded && groups.length === 0"
                class="px-2 py-2 text-[12px]"
                style="color: var(--ink-3)"
            >
                {{ t('sqlUi.catalog.empty') }}
            </div>

            <div v-for="group in groups" :key="group.namespace" class="mb-1">
                <div
                    class="flex items-center gap-1.5 px-2 py-1 text-[12px] font-bold"
                    style="color: var(--ink-2)"
                >
                    <Icon name="database" :size="13" />
                    <span class="truncate">{{ group.namespace }}</span>
                </div>
                <div v-for="table in group.tables" :key="store.tableKey(table)">
                    <div
                        class="group/row flex cursor-pointer items-center gap-1 rounded-md py-[3px] pl-4 pr-1 hover:bg-surface-2"
                        @click="toggleTable(table)"
                    >
                        <Icon
                            :name="expanded[store.tableKey(table)] ? 'chevronDown' : 'chevronRight'"
                            :size="12"
                            style="color: var(--ink-3); flex: none"
                        />
                        <Icon name="table" :size="13" style="color: var(--ink-3); flex: none" />
                        <span class="min-w-0 flex-1 truncate text-[12.5px]" style="color: var(--ink)">
                            {{ table.name }}
                        </span>
                        <button
                            class="hidden h-5 items-center rounded px-1.5 text-[10.5px] font-bold group-hover/row:flex"
                            style="background: var(--accent-soft); color: var(--accent-soft-ink)"
                            :title="t('sqlUi.catalog.preview')"
                            @click.stop="emit('preview', table)"
                        >
                            <Icon name="play" :size="10" />
                        </button>
                    </div>
                    <div v-if="expanded[store.tableKey(table)]" class="pb-1 pl-[42px]">
                        <div v-if="describing[store.tableKey(table)]" class="py-1">
                            <Spinner :size="12" />
                        </div>
                        <div
                            v-for="col in store.columnsByTable[store.tableKey(table)] ?? []"
                            :key="col.name"
                            class="flex items-baseline gap-2 py-[2px] text-[11.5px]"
                            style="font-family: 'JetBrains Mono', monospace"
                        >
                            <span class="truncate" style="color: var(--ink-2)">{{ col.name }}</span>
                            <span class="truncate lowercase" style="color: var(--ink-3)">{{ col.type }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
