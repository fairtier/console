<script setup lang="ts">
// "Test connection": ask the workspace's own box whether it can read this
// source, before saving a pipeline that will otherwise discover the answer
// from its first scheduled run.
//
// The probe does not run here and it does not run in the workspace API — it
// runs on the box's dlt-worker, which has the drivers, the baked DuckDB
// extensions and the network path a real run has. So this is a queued job:
// TestSourceConnection returns a pending test, and this card polls
// GetSourceTest until the worker answers. That is also why the button says
// where the test runs; a few seconds of waiting is a surprise only if nobody
// said the work was happening somewhere else.
//
// Which source types offer the button is the BOX's answer, not this build's
// (`capabilities.testable_source_types`): a Console that decided for itself
// would be a fourth copy of a list that already lives in three repos, and the
// failure mode is a button that queues a test nothing ever claims.
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { pipelineClient } from '../../api'
import { errorMessage } from '../../api/errors'
import { buildCredentials, buildSourceConfig, credentialsProvided } from '../../lib/pipelineConfig'
import type { PipelineForm, PipelineSource } from '../../lib/pipelineSources'
import { useWorkspaceStore } from '../../stores/workspace'
import Icon from '../ui/Icon.vue'
import Spinner from '../ui/Spinner.vue'

const props = defineProps<{
    form: PipelineForm
    source: PipelineSource
    advancedJson: boolean
    isEdit: boolean
    /** The pipeline being edited, so a blank credentials field can fall back
     *  to the stored ones — "leave empty to keep" has to hold here too. */
    pipelineId: string
}>()

const { t } = useI18n()
const workspace = useWorkspaceStore()

/** How long to wait for the box before giving up, and how often to ask. */
const POLL_MS = 2000
const GIVE_UP_MS = 150_000

const supported = computed(() => (workspace.testableSourceTypes ?? []).includes(props.source.id))

const testing = ref(false)
const result = ref<{ ok: boolean; message: string; details: string[] } | null>(null)

// A wizard the user navigates away from must not keep polling: the component
// is gone, and its answer has nowhere to land.
let disposed = false
onUnmounted(() => {
    disposed = true
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function runTest() {
    if (testing.value) return
    testing.value = true
    result.value = null
    try {
        let sourceConfig: string
        let sourceCredentials: string
        try {
            sourceConfig = JSON.stringify(buildSourceConfig(props.form, props.advancedJson))
            sourceCredentials = credentialsProvided(props.form, props.advancedJson)
                ? JSON.stringify(buildCredentials(props.form, props.advancedJson))
                : ''
        } catch {
            result.value = { ok: false, message: t('pipelines.validation.invalidJson'), details: [] }
            return
        }

        const started = await pipelineClient.testSourceConnection({
            // The proto type, never the picker's key — 'duckdb/mysql' is a
            // Console word.
            sourceType: props.source.id,
            sourceConfig,
            sourceCredentials,
            pipelineId: props.isEdit ? props.pipelineId : '',
        })
        const id = started.test?.id ?? ''
        if (!id) throw new Error('no test id')

        const deadline = Date.now() + GIVE_UP_MS
        while (!disposed && Date.now() < deadline) {
            await sleep(POLL_MS)
            if (disposed) return
            const { test } = await pipelineClient.getSourceTest({ id })
            if (!test || test.status === 'pending' || test.status === 'running') continue
            result.value = {
                ok: test.status === 'success',
                message: test.message,
                details: test.details,
            }
            return
        }
        if (!disposed) {
            result.value = { ok: false, message: t('pipelinesUi.wizard.configure.test.timeout'), details: [] }
        }
    } catch (e) {
        if (!disposed) {
            result.value = {
                ok: false,
                message: errorMessage(e, t('pipelinesUi.wizard.configure.test.failedToStart')),
                details: [],
            }
        }
    } finally {
        testing.value = false
    }
}
</script>

<template>
    <div
        v-if="supported"
        class="mb-4 rounded-2xl border p-[22px]"
        style="background: var(--surface); border-color: var(--line); box-shadow: var(--shadow)"
    >
        <h2 class="mb-[5px] text-base font-bold">{{ t('pipelinesUi.wizard.configure.test.title') }}</h2>
        <div class="mb-4 text-[12.5px]" style="color: var(--ink-2)">
            {{ t('pipelinesUi.wizard.configure.test.help') }}
        </div>

        <button
            :disabled="testing"
            class="flex h-[38px] items-center gap-2 rounded-[10px] border px-4 text-[13.5px] font-semibold"
            style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
            :style="testing ? 'opacity:.6; cursor:not-allowed;' : 'cursor:pointer;'"
            @click="runTest"
        >
            <Spinner v-if="testing" :size="15" />
            <Icon v-else name="check" :size="15" />
            {{ testing ? t('pipelinesUi.wizard.configure.test.running') : t('pipelinesUi.wizard.configure.test.button') }}
        </button>

        <div
            v-if="result"
            class="mt-4 rounded-[10px] border p-3 text-[12.5px]"
            :style="
                result.ok
                    ? 'background: var(--ok-soft); border-color: var(--ok-soft); color: var(--ok-ink)'
                    : 'background: var(--err-soft); border-color: var(--err-soft); color: var(--err-ink)'
            "
        >
            <div class="font-semibold">
                {{ result.ok ? t('pipelinesUi.wizard.configure.test.passed') : t('pipelinesUi.wizard.configure.test.failed') }}
            </div>
            <div class="mt-1 break-words">{{ result.message }}</div>
            <ul v-if="result.details.length" class="mt-2 list-none space-y-1 font-mono text-[11.5px]">
                <li v-for="line in result.details" :key="line">{{ line }}</li>
            </ul>
        </div>
    </div>
</template>
