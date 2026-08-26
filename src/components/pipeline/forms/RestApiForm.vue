<script setup lang="ts">
// The guided rest_api form. Multi-root on purpose: its fields are direct
// children of SourceCard's grid, some full-width and some half.
//
// What this form can represent is what restApi.isGuidable accepts
// (src/lib/pipelineSources/restApi.ts). A config carrying anything more opens
// in the JSON editor instead — the two are one decision, so change them
// together.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PipelineForm } from '../../../lib/pipelineSources'
import Icon from '../../ui/Icon.vue'
import Select from '../../ui/Select.vue'

const props = defineProps<{
    form: PipelineForm
    fieldErrors: Record<string, string>
}>()

const { t } = useI18n()

const authMethods = computed(() => [
    { value: 'bearer', label: t('pipelinesUi.wizard.configure.auth.bearer') },
    { value: 'api_key', label: t('pipelinesUi.wizard.configure.auth.apiKey') },
    { value: 'basic', label: t('pipelinesUi.wizard.configure.auth.basic') },
    { value: 'none', label: t('pipelinesUi.wizard.configure.auth.none') },
])
const paginations = computed(() => [
    { value: 'none', label: t('pipelinesUi.wizard.configure.paging.none') },
    { value: 'cursor', label: t('pipelinesUi.wizard.configure.paging.cursor') },
    { value: 'page_number', label: t('pipelinesUi.wizard.configure.paging.pageNumber') },
    { value: 'offset', label: t('pipelinesUi.wizard.configure.paging.offset') },
])

const resourceDraft = ref('')

function addResource() {
    const v = resourceDraft.value.trim()
    if (v && !props.form.resources.some((x) => x.name === v)) {
        props.form.resources.push({ name: v, endpoint: '/' + v.replace(/^\/+/, '') })
    }
    resourceDraft.value = ''
}
function removeResource(name: string) {
    props.form.resources = props.form.resources.filter((x) => x.name !== name)
}
</script>

<template>
    <div class="col-span-full">
        <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
            {{ t('pipelinesUi.wizard.configure.baseUrl') }}
        </label>
        <input
            v-model="form.baseUrl"
            :placeholder="t('pipelinesUi.wizard.configure.baseUrlPlaceholder')"
            class="h-10 w-full rounded-[10px] border px-[13px] font-mono text-[13px] outline-none"
            style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
        />
        <p v-if="fieldErrors.baseUrl" class="mt-1.5 text-xs" style="color: var(--err)">{{ fieldErrors.baseUrl }}</p>
    </div>

    <div class="col-span-full">
        <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
            {{ t('pipelinesUi.wizard.configure.resources') }}
        </label>
        <div class="flex flex-wrap items-center gap-2">
            <span
                v-for="r in form.resources"
                :key="r.name"
                :title="r.endpoint"
                class="flex items-center gap-[7px] rounded-[9px] px-[11px] py-[7px] font-mono text-[13px] font-medium"
                style="background: var(--accent-soft); color: var(--accent-soft-ink)"
            >
                {{ r.name }}
                <span class="flex cursor-pointer opacity-60" @click="removeResource(r.name)">
                    <Icon name="x" :size="13" />
                </span>
            </span>
            <input
                v-model="resourceDraft"
                :placeholder="t('pipelinesUi.wizard.configure.resourcePlaceholder')"
                class="h-9 w-[150px] rounded-[9px] border px-[11px] font-mono text-[13px] outline-none"
                style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                @keydown.enter.prevent="addResource"
            />
            <button
                class="cursor-pointer rounded-[9px] border border-dashed bg-transparent px-[11px] py-[7px] font-sans text-[13px]"
                style="border-color: var(--line); color: var(--ink-3)"
                @click="addResource"
            >
                + {{ t('pipelinesUi.wizard.configure.addResource') }}
            </button>
        </div>
        <p v-if="fieldErrors.resources" class="mt-1.5 text-xs" style="color: var(--err)">
            {{ fieldErrors.resources }}
        </p>
    </div>

    <div>
        <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
            {{ t('pipelinesUi.wizard.configure.authMethod') }}
        </label>
        <Select v-model="form.authMethod" :options="authMethods" />
    </div>

    <div>
        <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
            {{ t('pipelinesUi.wizard.configure.pagination') }}
        </label>
        <Select v-model="form.pagination" :options="paginations" />
    </div>
</template>
