<script setup lang="ts">
// The guided google_sheets form — the spreadsheet and which ranges to read.
// Credentials are not here: signing in with Google is the CredentialsCard's
// job. Multi-root, as a direct child of SourceCard's grid.
//
// Mirrors googleSheets.isGuidable (src/lib/pipelineSources/googleSheets.ts):
// a config with anything beyond these two keys opens in the JSON editor.
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PipelineForm } from '../../../lib/pipelineSources'
import Icon from '../../ui/Icon.vue'

const props = defineProps<{
    form: PipelineForm
    fieldErrors: Record<string, string>
}>()

const { t } = useI18n()

const rangeDraft = ref('')

function addRange() {
    const v = rangeDraft.value.trim()
    if (v && !props.form.rangeNames.includes(v)) props.form.rangeNames.push(v)
    rangeDraft.value = ''
}
function removeRange(name: string) {
    props.form.rangeNames = props.form.rangeNames.filter((x) => x !== name)
}
</script>

<template>
    <div class="col-span-full">
        <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
            {{ t('pipelinesUi.wizard.configure.spreadsheet') }}
        </label>
        <input
            v-model="form.spreadsheet"
            :placeholder="t('pipelinesUi.wizard.configure.spreadsheetPlaceholder')"
            class="h-10 w-full rounded-[10px] border px-[13px] font-mono text-[13px] outline-none"
            style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
        />
        <p v-if="fieldErrors.spreadsheet" class="mt-1.5 text-xs" style="color: var(--err)">
            {{ fieldErrors.spreadsheet }}
        </p>
    </div>

    <div class="col-span-full">
        <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
            {{ t('pipelinesUi.wizard.configure.ranges') }}
        </label>
        <div class="flex flex-wrap items-center gap-2">
            <span
                v-for="r in form.rangeNames"
                :key="r"
                class="flex items-center gap-[7px] rounded-[9px] px-[11px] py-[7px] font-mono text-[13px] font-medium"
                style="background: var(--accent-soft); color: var(--accent-soft-ink)"
            >
                {{ r }}
                <span class="flex cursor-pointer opacity-60" @click="removeRange(r)">
                    <Icon name="x" :size="13" />
                </span>
            </span>
            <input
                v-model="rangeDraft"
                :placeholder="t('pipelinesUi.wizard.configure.rangePlaceholder')"
                class="h-9 w-[170px] rounded-[9px] border px-[11px] font-mono text-[13px] outline-none"
                style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                @keydown.enter.prevent="addRange"
            />
            <button
                class="cursor-pointer rounded-[9px] border border-dashed bg-transparent px-[11px] py-[7px] font-sans text-[13px]"
                style="border-color: var(--line); color: var(--ink-3)"
                @click="addRange"
            >
                + {{ t('pipelinesUi.wizard.configure.addRange') }}
            </button>
        </div>
        <p class="mt-1.5 text-xs" style="color: var(--ink-3)">{{ t('pipelinesUi.wizard.configure.rangesHint') }}</p>
        <p v-if="fieldErrors.rangeNames" class="mt-1.5 text-xs" style="color: var(--err)">
            {{ fieldErrors.rangeNames }}
        </p>
    </div>
</template>
