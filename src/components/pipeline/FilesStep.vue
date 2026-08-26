<script setup lang="ts">
// The wizard's last step for a file_upload pipeline: now that the pipeline
// exists there is a prefix to upload into. Both exits — Finish and Run now —
// leave the wizard, so the component reports `done` and the parent routes.
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { pipelineClient } from '../../api'
import { errorMessage } from '../../api/errors'
import { useToast } from '../../composables/useToast'
import FileDropManager from '../FileDropManager.vue'
import Icon from '../ui/Icon.vue'
import Spinner from '../ui/Spinner.vue'

const props = defineProps<{ pipelineId: string }>()
const emit = defineEmits<{ (e: 'done'): void }>()

const { t } = useI18n()
const toast = useToast()

const uploadedCount = ref(0)
const running = ref(false)

async function runNow() {
    if (!props.pipelineId || running.value) return
    running.value = true
    try {
        await pipelineClient.triggerPipeline({ id: props.pipelineId })
        toast.success(t('pipelinesUi.toast.triggered'))
        emit('done')
    } catch (err) {
        toast.error(errorMessage(err, t('pipelinesUi.toast.triggerFailed')))
    } finally {
        running.value = false
    }
}
</script>

<template>
    <div
        class="rounded-[18px] border p-[26px]"
        style="background: var(--surface); border-color: var(--line); box-shadow: var(--shadow)"
    >
        <h2 class="mb-[5px] text-lg font-bold tracking-[-.01em]">{{ t('pipelinesUi.fileDrop.title') }}</h2>
        <div class="mb-[18px] text-[13px]" style="color: var(--ink-2)">{{ t('pipelinesUi.fileDrop.subtitle') }}</div>

        <FileDropManager :pipeline-id="pipelineId" @changed="uploadedCount = $event" />

        <div class="mt-[22px] flex items-center justify-between">
            <button
                class="flex h-[42px] cursor-pointer items-center gap-[7px] rounded-[11px] border px-4 font-sans text-sm font-semibold"
                style="background: var(--surface); border-color: var(--line); color: var(--ink-2)"
                @click="emit('done')"
            >
                {{ t('pipelinesUi.fileDrop.finish') }}
            </button>
            <button
                :disabled="uploadedCount === 0 || running"
                class="flex h-[42px] items-center gap-2 rounded-[11px] border-none px-5 font-sans text-sm font-semibold"
                :style="{
                    background: 'var(--accent)',
                    color: 'var(--accent-ink)',
                    boxShadow: 'var(--shadow)',
                    opacity: uploadedCount === 0 || running ? 0.5 : 1,
                    cursor: uploadedCount === 0 || running ? 'not-allowed' : 'pointer',
                }"
                @click="runNow"
            >
                <Spinner v-if="running" :size="16" />
                <Icon v-else name="play" :size="16" />
                {{ t('pipelinesUi.fileDrop.runNow') }}
            </button>
        </div>
    </div>
</template>
