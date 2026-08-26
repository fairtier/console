<script setup lang="ts">
// The guided rest_api form. Multi-root on purpose: its fields are direct
// children of SourceCard's grid, some full-width and some half.
//
// What this form can represent is what restApi.isGuidable accepts
// (src/lib/pipelineSources/restApi.ts). A config carrying anything more opens
// in the JSON editor instead — the two are one decision, so change them
// together.
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PipelineForm } from '../../../lib/pipelineSources'
import Icon from '../../ui/Icon.vue'

const props = defineProps<{
    form: PipelineForm
    fieldErrors: Record<string, string>
}>()

const { t } = useI18n()

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
        <div class="relative">
            <select
                v-model="form.authMethod"
                class="h-10 w-full cursor-pointer appearance-none rounded-[10px] border px-[13px] font-sans text-sm outline-none"
                style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
            >
                <option value="bearer">{{ t('pipelinesUi.wizard.configure.auth.bearer') }}</option>
                <option value="api_key">{{ t('pipelinesUi.wizard.configure.auth.apiKey') }}</option>
                <option value="basic">{{ t('pipelinesUi.wizard.configure.auth.basic') }}</option>
                <option value="none">{{ t('pipelinesUi.wizard.configure.auth.none') }}</option>
            </select>
            <Icon
                name="chevronDown"
                :size="15"
                class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
                :style="{ color: 'var(--ink-3)' }"
            />
        </div>
    </div>

    <div>
        <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
            {{ t('pipelinesUi.wizard.configure.pagination') }}
        </label>
        <div class="relative">
            <select
                v-model="form.pagination"
                class="h-10 w-full cursor-pointer appearance-none rounded-[10px] border px-[13px] font-sans text-sm outline-none"
                style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
            >
                <option value="none">{{ t('pipelinesUi.wizard.configure.paging.none') }}</option>
                <option value="cursor">{{ t('pipelinesUi.wizard.configure.paging.cursor') }}</option>
                <option value="page_number">{{ t('pipelinesUi.wizard.configure.paging.pageNumber') }}</option>
                <option value="offset">{{ t('pipelinesUi.wizard.configure.paging.offset') }}</option>
            </select>
            <Icon
                name="chevronDown"
                :size="15"
                class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
                :style="{ color: 'var(--ink-3)' }"
            />
        </div>
    </div>
</template>
