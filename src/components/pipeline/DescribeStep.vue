<script setup lang="ts">
// The wizard's first step: describe the pipeline in a sentence and let the
// platform draft it. Owns the RPC and the refusal panel; the draft itself goes
// to the parent, which is where the form lives.
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Code, ConnectError } from '@connectrpc/connect'
import { pipelineAssistClient } from '../../api'
import { errorMessage } from '../../api/errors'
import type { CreatePipelineRequest } from '../../api/gen/pipeline_pb.js'
import { useToast } from '../../composables/useToast'
import Icon from '../ui/Icon.vue'
import Spinner from '../ui/Spinner.vue'

const emit = defineEmits<{
    (e: 'drafted', draft: CreatePipelineRequest): void
    /** Move on to Configure — after a draft, or from "set it up manually". */
    (e: 'configure'): void
}>()

const { t } = useI18n()
const toast = useToast()

const prompt = ref('')
const drafting = ref(false)
// Non-empty after a draft the platform refused as infeasible (e.g. an
// unsupported database engine); rendered as a standing panel, not a toast.
const unsupportedReason = ref('')
const unsupportedNotes = ref('')

const examples = ['postgres', 's3', 'sheets'] as const

async function draft() {
    const text = prompt.value.trim()
    if (!text || drafting.value) return
    drafting.value = true
    unsupportedReason.value = ''
    unsupportedNotes.value = ''
    try {
        const resp = await pipelineAssistClient.draftPipeline({ prompt: text })
        // The refusal path: the request needs a capability the platform does
        // not have. Stay on Describe and show the standing reason — pre-filling
        // the wizard would invite configuring the very thing that cannot run.
        if (resp.unsupportedReason) {
            unsupportedReason.value = resp.unsupportedReason
            unsupportedNotes.value = resp.notes
            return
        }
        if (resp.draft) emit('drafted', resp.draft)
        if (resp.notes) toast.info(resp.notes)
        emit('configure')
    } catch (err) {
        // Server without an AI key returns UNIMPLEMENTED — surface a soft
        // "coming soon" hint and let the user fall back to the manual path.
        if (err instanceof ConnectError && err.code === Code.Unimplemented) {
            toast.info(t('pipelinesUi.wizard.describe.notConfigured'))
        } else {
            toast.error(errorMessage(err, t('pipelinesUi.wizard.describe.draftFailed')))
        }
    } finally {
        drafting.value = false
    }
}
</script>

<template>
    <div
        class="rounded-[18px] border p-[26px]"
        style="background: var(--surface); border-color: var(--line); box-shadow: var(--shadow)"
    >
        <div class="mb-1.5 flex items-center gap-2.5">
            <div
                class="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px]"
                style="background: var(--clay-soft); color: var(--clay)"
            >
                <Icon name="sparkle" :size="18" />
            </div>
            <div>
                <h2 class="text-lg font-bold tracking-[-.01em]">{{ t('pipelinesUi.wizard.describe.title') }}</h2>
                <div class="text-[13px]" style="color: var(--ink-2)">
                    {{ t('pipelinesUi.wizard.describe.subtitle') }}
                </div>
            </div>
        </div>
        <textarea
            v-model="prompt"
            rows="3"
            :placeholder="t('pipelinesUi.wizard.describe.placeholder')"
            class="mt-4 w-full resize-y rounded-[13px] border px-[15px] py-[14px] font-sans text-[15px] leading-[1.55] outline-none"
            style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
        ></textarea>
        <div class="mt-[13px] flex flex-wrap gap-2">
            <span class="mr-0.5 self-center text-xs" style="color: var(--ink-3)">
                {{ t('pipelinesUi.wizard.describe.tryLabel') }}
            </span>
            <button
                v-for="ex in examples"
                :key="ex"
                class="cursor-pointer rounded-[20px] border px-3 py-[5px] font-sans text-xs"
                style="background: var(--surface-2); border-color: var(--line); color: var(--ink-2)"
                @click="prompt = t(`pipelinesUi.wizard.describe.examples.${ex}`)"
            >
                {{ t(`pipelinesUi.wizard.describe.examples.${ex}`) }}
            </button>
        </div>
        <div
            v-if="unsupportedReason"
            class="mt-4 flex items-start gap-[11px] rounded-[14px] border px-4 py-[14px]"
            style="background: var(--warn-soft); border-color: var(--warn)"
        >
            <Icon name="info" :size="18" class="mt-px flex-none" :style="{ color: 'var(--warn-ink)' }" />
            <div class="text-[13.5px] leading-[1.55]" style="color: var(--ink)">
                <div class="mb-[3px] font-bold" style="color: var(--warn-ink)">
                    {{ t('pipelinesUi.wizard.describe.unsupportedTitle') }}
                </div>
                <div>{{ unsupportedReason }}</div>
                <div v-if="unsupportedNotes" class="mt-1.5" style="color: var(--ink-2)">{{ unsupportedNotes }}</div>
            </div>
        </div>
        <div class="mt-[22px] flex items-center justify-end gap-3">
            <button
                class="cursor-pointer border-none bg-transparent font-sans text-[13px] font-bold"
                style="color: var(--accent)"
                @click="emit('configure')"
            >
                {{ t('pipelinesUi.wizard.describe.manual') }}
            </button>
            <button
                :disabled="!prompt.trim() || drafting"
                class="flex h-[42px] items-center gap-2 rounded-[11px] border-none px-5 font-sans text-sm font-semibold text-white"
                :style="{
                    background: 'var(--clay)',
                    boxShadow: 'var(--shadow)',
                    opacity: !prompt.trim() || drafting ? 0.5 : 1,
                    cursor: !prompt.trim() || drafting ? 'not-allowed' : 'pointer',
                }"
                @click="draft"
            >
                <Spinner v-if="drafting" :size="16" />
                <Icon v-else name="sparkle" :size="16" />{{ t('pipelinesUi.wizard.describe.draft') }}
            </button>
        </div>
    </div>
</template>
