<script setup lang="ts">
// What the pipeline reads from: its name, its source type, and whichever form
// that type brings — a guided one, the platform-managed file drop, or the raw
// JSON editor. The per-type knowledge is the registry's
// (src/lib/pipelineSources); the per-type markup is SOURCE_FORMS'. This card
// only decides which of the three to show.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PipelineForm, PipelineSource } from '../../lib/pipelineSources'
import FileDropManager from '../FileDropManager.vue'
import Icon from '../ui/Icon.vue'
import Select from '../ui/Select.vue'
import { SOURCE_FORMS } from './sourceForms'

const props = defineProps<{
    form: PipelineForm
    source: PipelineSource
    options: { value: string; label: string }[]
    fieldErrors: Record<string, string>
    /** Editing an existing pipeline: files are managed here rather than after create. */
    isEdit: boolean
    /** The pipeline being edited, for the file drop. Empty while creating. */
    pipelineId: string
}>()

// Choosing a source is an event, not a two-way binding on the form: selecting
// one applies its defaults, and only the owner of the form can say what a
// *choice* means as against a value that merely changed (an edit prefill, an
// AI draft).
const emit = defineEmits<{ selectSource: [string] }>()

const advancedJson = defineModel<boolean>('advancedJson', { required: true })

const { t } = useI18n()

// By variant key, not by proto type: 'duckdb/mysql' and 'duckdb/gdrive' are
// one source_type and two entirely different forms.
const guidedForm = computed(() => (props.source.guided ? SOURCE_FORMS[props.source.key] : undefined))
</script>

<template>
    <div
        class="mb-4 rounded-2xl border p-[22px]"
        style="background: var(--surface); border-color: var(--line); box-shadow: var(--shadow)"
    >
        <div class="mb-[18px] flex items-center justify-between">
            <h2 class="text-base font-bold">{{ t('pipelinesUi.wizard.configure.sourceTitle') }}</h2>
            <button
                v-if="source.guided"
                class="flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-[5px] font-sans text-xs font-semibold"
                style="background: var(--surface-2); border-color: var(--line); color: var(--ink-3)"
                @click="advancedJson = !advancedJson"
            >
                <Icon name="code" :size="13" />
                {{ advancedJson ? t('pipelinesUi.wizard.configure.guided') : t('pipelinesUi.wizard.configure.advancedJson') }}
            </button>
        </div>

        <div class="grid grid-cols-2 gap-[14px]">
            <div class="col-span-full">
                <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
                    {{ t('pipelines.name') }}
                </label>
                <input
                    v-model="form.name"
                    :placeholder="t('pipelines.namePlaceholder')"
                    class="h-10 w-full rounded-[10px] border px-[13px] font-sans text-sm outline-none"
                    style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                />
            </div>

            <div class="col-span-full">
                <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
                    {{ t('pipelines.sourceType') }}
                </label>
                <Select
                    :model-value="form.sourceKey"
                    :options="options"
                    @update:model-value="emit('selectSource', $event)"
                />
                <!-- "this box does not accept that extension" belongs at the
                     control that chose it, not inside a config the user never
                     typed. -->
                <p v-if="fieldErrors.sourceKey" class="mt-1.5 text-xs" style="color: var(--err)">
                    {{ fieldErrors.sourceKey }}
                </p>
            </div>

            <!-- The selected type's guided form, if it has one and the user has
                 not switched to raw JSON. -->
            <component
                :is="guidedForm"
                v-if="guidedForm && !advancedJson"
                :form="form"
                :field-errors="fieldErrors"
            />

            <!-- file_upload: files are dropped after creation (create) or
                 managed right here (edit) — no JSON, no credentials -->
            <div v-else-if="source.fileDrop" class="col-span-full">
                <FileDropManager v-if="isEdit" :pipeline-id="pipelineId" />
                <div
                    v-else
                    class="flex items-start gap-[11px] rounded-[14px] border px-4 py-[14px]"
                    style="background: var(--inset); border-color: var(--line)"
                >
                    <Icon name="info" :size="18" class="mt-px flex-none" :style="{ color: 'var(--ink-3)' }" />
                    <div class="text-[13.5px] leading-[1.55]" style="color: var(--ink-2)">
                        {{ t('pipelinesUi.fileDrop.createHint') }}
                    </div>
                </div>
            </div>

            <!-- generic / advanced raw JSON -->
            <div v-else class="col-span-full">
                <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
                    {{ t('pipelinesUi.wizard.configure.genericConfig') }}
                </label>
                <textarea
                    v-model="form.sourceConfigRaw"
                    rows="6"
                    :placeholder="source.configPlaceholder"
                    class="w-full resize-y rounded-[10px] border px-[13px] py-[11px] font-mono text-[13px] leading-[1.5] outline-none"
                    style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                ></textarea>
            </div>
        </div>

        <!-- Violations with no field of their own. Outside the grid, so they
             show in guided mode too: this used to render only inside the JSON
             editor's branch, which meant a server rejection of a key the
             guided form does not have a field for — bucket_url,
             tables_config.*, incremental.* — appeared nowhere at all and
             survived only as a toast the user had already dismissed. -->
        <p v-if="fieldErrors.sourceConfigRaw" class="mt-3 text-xs" style="color: var(--err)">
            {{ fieldErrors.sourceConfigRaw }}
        </p>
    </div>
</template>
