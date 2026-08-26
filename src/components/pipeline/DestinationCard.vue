<script setup lang="ts">
// Where the pipeline writes and when it runs. Mutates the wizard's form in
// place: the form is one object for the whole wizard (see PipelineWizardView),
// because the exclusions between its fields only make sense over all of it.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCronText } from '../../composables/useCronText'
import type { PipelineForm } from '../../lib/pipelineSources'
import Icon from '../ui/Icon.vue'

const props = defineProps<{
    form: PipelineForm
    /** False for a source that runs manually (file_upload): no schedule field. */
    schedulable: boolean
    fieldErrors: Record<string, string>
}>()

const { t } = useI18n()

const cronText = useCronText()
const scheduleError = computed(() => cronText.error(props.form.schedule))
const scheduleHint = computed(() => {
    if (!props.form.schedule.trim()) return t('pipelinesUi.wizard.configure.scheduleHint.manual')
    return scheduleError.value || cronText.describe(props.form.schedule)
})
// The box evaluates cron in UTC, so the preview is labelled UTC rather than
// silently shown in the browser's timezone.
const scheduleNextRuns = computed(() => (scheduleError.value ? '' : cronText.nextRunsText(props.form.schedule, 3)))
</script>

<template>
    <div
        class="mb-4 rounded-2xl border p-[22px]"
        style="background: var(--surface); border-color: var(--line); box-shadow: var(--shadow)"
    >
        <h2 class="mb-4 text-base font-bold">{{ t('pipelinesUi.wizard.configure.destinationTitle') }}</h2>
        <div class="grid grid-cols-2 gap-[14px]">
            <div>
                <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
                    {{ t('pipelines.datasetName') }}
                </label>
                <input
                    v-model="form.datasetName"
                    :placeholder="t('pipelines.datasetNamePlaceholder')"
                    class="h-10 w-full rounded-[10px] border px-[13px] font-mono text-[13px] outline-none"
                    style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                />
                <p v-if="fieldErrors.datasetName" class="mt-1.5 text-xs" style="color: var(--err)">
                    {{ fieldErrors.datasetName }}
                </p>
            </div>
            <div>
                <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
                    {{ t('pipelines.writeDisposition') }}
                </label>
                <div class="relative">
                    <select
                        v-model="form.writeDisposition"
                        class="h-10 w-full cursor-pointer appearance-none rounded-[10px] border px-[13px] font-sans text-sm outline-none"
                        style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                    >
                        <option value="append">{{ t('pipelines.writeDispositions.append') }}</option>
                        <option value="replace">{{ t('pipelines.writeDispositions.replace') }}</option>
                        <option value="merge">{{ t('pipelines.writeDispositions.merge') }}</option>
                    </select>
                    <Icon
                        name="chevronDown"
                        :size="15"
                        class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
                        :style="{ color: 'var(--ink-3)' }"
                    />
                </div>
            </div>

            <div v-if="form.writeDisposition === 'merge'">
                <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
                    {{ t('pipelines.mergeStrategy') }}
                </label>
                <div class="relative">
                    <select
                        v-model="form.mergeStrategy"
                        class="h-10 w-full cursor-pointer appearance-none rounded-[10px] border px-[13px] font-sans text-sm outline-none"
                        style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                    >
                        <option value="">{{ t('pipelines.mergeStrategies.default') }}</option>
                        <option value="upsert">{{ t('pipelines.mergeStrategies.upsert') }}</option>
                    </select>
                    <Icon
                        name="chevronDown"
                        :size="15"
                        class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
                        :style="{ color: 'var(--ink-3)' }"
                    />
                </div>
            </div>

            <!-- file_upload runs manually: drop a file, run the pipeline -->
            <div v-if="schedulable" class="col-span-full">
                <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
                    {{ t('pipelines.schedule') }}
                </label>
                <div class="flex flex-wrap items-center gap-[11px]">
                    <input
                        v-model="form.schedule"
                        :placeholder="t('pipelines.schedulePlaceholder')"
                        class="h-10 w-[130px] rounded-[10px] border px-[13px] font-mono text-[13px] outline-none"
                        :style="{
                            borderColor: scheduleError ? 'var(--err)' : 'var(--line)',
                            background: 'var(--surface-2)',
                            color: 'var(--ink)',
                        }"
                    />
                    <span
                        class="flex items-center gap-[7px] text-[13px]"
                        :style="{ color: scheduleError ? 'var(--err)' : 'var(--ink-2)' }"
                    >
                        <Icon
                            :name="scheduleError ? 'danger' : 'clock'"
                            :size="15"
                            class="shrink-0"
                            :style="{ color: scheduleError ? 'var(--err)' : 'var(--accent)' }"
                        />{{ scheduleHint }}
                    </span>
                </div>
                <p v-if="scheduleNextRuns" class="mt-[7px] text-xs" style="color: var(--ink-3)">
                    {{ scheduleNextRuns }}
                </p>
            </div>
        </div>
    </div>
</template>
