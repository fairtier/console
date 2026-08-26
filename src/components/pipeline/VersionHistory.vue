<script setup lang="ts">
// The pipeline's history from the workspace's own git repo (VM boxes mirror
// every pipeline definition there). Owns its RPCs and hides itself when the
// workspace has no mirror — the parent only says which pipeline and reloads
// its form after a restore.
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { pipelineClient } from '../../api'
import { errorMessage } from '../../api/errors'
import type { PipelineVersion } from '../../api/gen/pipeline_pb.js'
import { useConfirm } from '../../composables/useConfirm'
import { useToast } from '../../composables/useToast'
import Icon from '../ui/Icon.vue'
import Spinner from '../ui/Spinner.vue'

const props = defineProps<{ pipelineId: string }>()
const emit = defineEmits<{ (e: 'restored'): void }>()

const { t } = useI18n()
const toast = useToast()
const { confirm } = useConfirm()

const versions = ref<PipelineVersion[]>([])
const state = ref<'hidden' | 'loading' | 'ready'>('hidden')
const restoringSha = ref('')

async function load() {
    state.value = 'loading'
    try {
        const resp = await pipelineClient.listPipelineVersions({ pipelineId: props.pipelineId })
        versions.value = resp.versions
        state.value = resp.versions.length > 0 ? 'ready' : 'hidden'
    } catch {
        // FAILED_PRECONDITION = not a VM box / mirror not ready; any other
        // error is equally non-blocking here — the section simply stays hidden.
        state.value = 'hidden'
    }
}

onMounted(load)

async function restore(v: PipelineVersion) {
    const ok = await confirm({
        title: t('pipelinesUi.versions.confirmTitle'),
        body: t('pipelinesUi.versions.confirmBody', { date: formatTime(v.date), author: v.authorName }),
        confirmLabel: t('pipelinesUi.versions.confirmRestore'),
    })
    if (!ok) return
    restoringSha.value = v.sha
    try {
        await pipelineClient.restorePipelineVersion({ pipelineId: props.pipelineId, sha: v.sha })
        toast.success(t('pipelinesUi.versions.restored'))
        emit('restored')
        await load()
    } catch (err) {
        toast.error(errorMessage(err, t('pipelinesUi.versions.restoreFailed')))
    } finally {
        restoringSha.value = ''
    }
}

function formatTime(iso: string): string {
    if (!iso) return ''
    const then = new Date(iso)
    if (Number.isNaN(then.getTime())) return ''
    return then.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<template>
    <div
        v-if="state === 'ready'"
        class="mt-5 rounded-[18px] border px-[26px] py-[22px]"
        style="background: var(--surface); border-color: var(--line); box-shadow: var(--shadow)"
    >
        <div class="mb-1 flex items-center gap-[9px]">
            <Icon name="clock" :size="16" :style="{ color: 'var(--ink-3)' }" />
            <h2 class="text-base font-bold tracking-[-.01em]">{{ t('pipelinesUi.versions.title') }}</h2>
        </div>
        <div class="mb-[14px] text-[12.5px]" style="color: var(--ink-2)">
            {{ t('pipelinesUi.versions.subtitle') }}
        </div>
        <div
            v-for="(v, i) in versions"
            :key="v.sha"
            class="flex items-center gap-3 px-0.5 py-2 text-[13px]"
            :class="i > 0 ? 'border-t' : ''"
            style="border-color: var(--line)"
        >
            <span class="min-w-[150px] flex-none" style="color: var(--ink-2)">{{ formatTime(v.date) }}</span>
            <span class="max-w-[160px] flex-none truncate font-semibold">{{ v.authorName }}</span>
            <span class="flex-1 font-mono text-[11.5px]" style="color: var(--ink-3)">{{ v.sha.slice(0, 8) }}</span>
            <span v-if="i === 0" class="flex-none text-[11.5px] font-bold" style="color: var(--ok)">
                {{ t('pipelinesUi.versions.current') }}
            </span>
            <button
                v-else
                :disabled="restoringSha !== ''"
                class="flex h-[30px] flex-none items-center gap-1.5 rounded-[9px] border px-3 font-sans text-[12.5px] font-bold"
                :style="{
                    background: 'var(--surface-2)',
                    borderColor: 'var(--line)',
                    color: 'var(--accent)',
                    opacity: restoringSha !== '' ? 0.5 : 1,
                    cursor: restoringSha !== '' ? 'not-allowed' : 'pointer',
                }"
                @click="restore(v)"
            >
                <Spinner v-if="restoringSha === v.sha" :size="13" />
                {{ t('pipelinesUi.versions.restore') }}
            </button>
        </div>
    </div>
</template>
