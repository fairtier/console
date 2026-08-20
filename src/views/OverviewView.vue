<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../stores/workspace'
import { useAuth } from '../composables/useAuth'
import { warehouseClient, pipelineClient } from '../api'
import type { Pipeline } from '../api/gen/pipeline_pb'
import Icon from '../components/ui/Icon.vue'
import StatusChip from '../components/ui/StatusChip.vue'
import Spinner from '../components/ui/Spinner.vue'

const { t } = useI18n()
const router = useRouter()
const workspace = useWorkspaceStore()
const { user } = useAuth()

const loading = ref(true)
const warehouseCount = ref(0)
const pipelines = ref<Pipeline[]>([])

const greeting = computed(() => {
    const h = new Date().getHours()
    const key = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
    const who = user.value?.displayName || user.value?.name || ''
    return who ? `${t(`dashboard.greeting.${key}`)}, ${who}` : t(`dashboard.greeting.${key}`)
})

const enabledPipelineCount = computed(() => pipelines.value.filter(p => p.enabled).length)

const appsOnCount = computed(() =>
    [
        workspace.cubeEnabled,
        workspace.rillEnabled,
        workspace.duckflightEnabled,
    ].filter(Boolean).length,
)

// The pipeline list items don't carry last-run status or row counts, so we
// surface each pipeline's enabled/paused state instead. (Backend gap.)
const recentRuns = computed(() =>
    pipelines.value.slice(0, 5).map(p => ({
        id: p.id,
        name: p.name,
        dataset: p.datasetName,
        enabled: p.enabled,
    })),
)

function goNewPipeline() {
    router.push({ name: 'pipeline-new' })
}
function goCatalog() {
    router.push({ name: 'catalog' })
}
function goApps() {
    router.push({ name: 'apps' })
}
function goPipelines() {
    router.push({ name: 'pipelines' })
}

onMounted(async () => {
    await workspace.ensureLoaded()
    const [whResp, plResp] = await Promise.all([
        warehouseClient.listWarehouses({}).catch(() => ({ warehouses: [] })),
        pipelineClient.listPipelines({}).catch(() => ({ pipelines: [] })),
    ])
    warehouseCount.value = whResp.warehouses?.length ?? 0
    pipelines.value = plResp.pipelines ?? []
    loading.value = false
})
</script>

<template>
    <div class="mx-auto px-[34px] pb-20 pt-[34px]" style="max-width:1080px">
        <div v-if="loading" class="flex items-center justify-center py-24 text-ink-3">
            <Spinner :size="24" />
        </div>

        <template v-else>
            <!-- header row -->
            <div class="mb-6 flex items-end justify-between gap-5">
                <div>
                    <div class="mb-[5px] text-[13px] font-semibold text-ink-3">{{ greeting }}</div>
                    <h1 class="m-0 text-[27px] font-bold tracking-[-.02em]">{{ workspace.name }}</h1>
                </div>
            </div>

            <!-- STATS -->
            <div class="mb-6 grid grid-cols-4 gap-[14px]">
                <div class="rounded-[14px] border p-[16px_17px]" style="background:var(--surface); border-color:var(--line); box-shadow:var(--shadow)">
                    <div class="mb-2.5 flex items-center gap-2 text-[12.5px] font-semibold text-ink-3">
                        <Icon name="database" :size="15" />
                        {{ t('overview.stats.warehouses') }}
                    </div>
                    <div class="text-[26px] font-bold tracking-[-.02em]">{{ warehouseCount }}</div>
                </div>
                <div class="rounded-[14px] border p-[16px_17px]" style="background:var(--surface); border-color:var(--line); box-shadow:var(--shadow)">
                    <div class="mb-2.5 flex items-center gap-2 text-[12.5px] font-semibold text-ink-3">
                        <Icon name="pipelines" :size="15" />
                        {{ t('overview.stats.pipelines') }}
                    </div>
                    <div class="text-[26px] font-bold tracking-[-.02em]">
                        {{ pipelines.length }}
                        <span class="text-[13px] font-semibold text-ink-3">· {{ t('overview.stats.pipelinesOn', { count: enabledPipelineCount }) }}</span>
                    </div>
                </div>
                <div class="rounded-[14px] border p-[16px_17px]" style="background:var(--surface); border-color:var(--line); box-shadow:var(--shadow)">
                    <div class="mb-2.5 flex items-center gap-2 text-[12.5px] font-semibold text-ink-3">
                        <Icon name="apps" :size="15" />
                        {{ t('overview.stats.appsOn') }}
                    </div>
                    <div class="text-[26px] font-bold tracking-[-.02em]">
                        {{ appsOnCount }}
                        <span class="text-[13px] font-semibold text-ink-3">/ 4</span>
                    </div>
                </div>
                <div class="rounded-[14px] border p-[16px_17px]" style="background:var(--surface); border-color:var(--line); box-shadow:var(--shadow)">
                    <div class="mb-2.5 flex items-center gap-2 text-[12.5px] font-semibold text-ink-3">
                        <Icon name="clock" :size="15" />
                        {{ t('overview.stats.lastRun') }}
                    </div>
                    <div class="text-[15px] font-bold text-ink-2">
                        {{ pipelines.length ? t('overview.stats.neverRun') : t('overview.stats.noPipelines') }}
                    </div>
                </div>
            </div>

            <!-- two col -->
            <div class="grid gap-[18px]" style="grid-template-columns:1.6fr 1fr">
                <!-- recent runs -->
                <div class="overflow-hidden rounded-2xl border" style="background:var(--surface); border-color:var(--line); box-shadow:var(--shadow)">
                    <div class="flex items-center justify-between p-[16px_18px_12px]">
                        <div class="text-[15px] font-bold">{{ t('overview.recent.title') }}</div>
                        <button
                            type="button"
                            class="flex items-center gap-1 border-none bg-transparent text-[13px] font-semibold text-accent hover:brightness-105"
                            @click="goPipelines"
                        >
                            {{ t('overview.recent.viewAll') }}
                            <Icon name="chevronRight" :size="14" />
                        </button>
                    </div>
                    <div
                        v-if="!recentRuns.length"
                        class="border-t p-[16px_18px] text-[13px] text-ink-3"
                        style="border-color:var(--line-2)"
                    >
                        {{ t('overview.recent.empty') }}
                    </div>
                    <div
                        v-for="r in recentRuns"
                        :key="r.id"
                        class="flex items-center gap-[13px] border-t p-[11px_18px]"
                        style="border-color:var(--line-2)"
                    >
                        <div class="min-w-0 flex-1">
                            <div class="truncate text-[13.5px] font-semibold">{{ r.name }}</div>
                            <div class="font-mono text-[12px] text-ink-3">{{ r.dataset }}</div>
                        </div>
                        <StatusChip
                            :status="r.enabled ? 'active' : 'off'"
                            :label="r.enabled ? t('overview.recent.enabled') : t('overview.recent.paused')"
                        />
                    </div>
                </div>

                <!-- quick actions -->
                <div class="flex flex-col gap-[14px]">
                    <div
                        class="rounded-2xl border p-[17px_18px]"
                        style="background:var(--clay-soft); border-color:color-mix(in srgb, var(--clay) 30%, transparent)"
                    >
                        <div class="mb-[7px] flex items-center gap-2">
                            <Icon name="sparkle" :size="17" :style="{ color: 'var(--clay)' }" />
                            <div class="text-[14px] font-bold" style="color:var(--clay-soft-ink)">{{ t('overview.actions.aiTitle') }}</div>
                        </div>
                        <div class="mb-[13px] text-[12.5px] opacity-85" style="color:var(--clay-soft-ink)">{{ t('overview.actions.aiDesc') }}</div>
                        <button
                            type="button"
                            class="h-[38px] w-full rounded-[10px] border-none text-[13px] font-semibold text-white hover:brightness-105"
                            style="background:var(--clay)"
                            @click="goNewPipeline"
                        >
                            {{ t('overview.actions.aiButton') }}
                        </button>
                    </div>
                    <div class="overflow-hidden rounded-2xl border" style="background:var(--surface); border-color:var(--line); box-shadow:var(--shadow)">
                        <button
                            type="button"
                            class="flex w-full items-center gap-[11px] border-none bg-transparent p-[13px_16px] text-left text-ink hover:brightness-105"
                            @click="goCatalog"
                        >
                            <Icon name="catalog" :size="17" :style="{ color: 'var(--accent)' }" />
                            <span class="text-[13.5px] font-semibold">{{ t('overview.actions.openCatalog') }}</span>
                            <Icon name="chevronRight" :size="15" class="ml-auto text-ink-3" />
                        </button>
                        <button
                            type="button"
                            class="flex w-full items-center gap-[11px] border-t border-none bg-transparent p-[13px_16px] text-left text-ink hover:brightness-105"
                            style="border-top-color:var(--line-2)"
                            @click="goApps"
                        >
                            <Icon name="apps" :size="17" :style="{ color: 'var(--accent)' }" />
                            <span class="text-[13.5px] font-semibold">{{ t('overview.actions.launchApp') }}</span>
                            <Icon name="chevronRight" :size="15" class="ml-auto text-ink-3" />
                        </button>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
