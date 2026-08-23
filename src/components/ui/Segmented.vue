<script setup lang="ts" generic="T extends string">
defineProps<{
    options: { value: T; label: string }[]
    /**
     * Fill the available width, splitting it evenly between the options,
     * instead of sizing each to its label. For narrow containers — the sidebar
     * user menu — where content-sized segments would overflow.
     */
    block?: boolean
}>()
const model = defineModel<T>({ required: true })
</script>

<template>
    <div
        class="flex gap-1 rounded-[10px] border p-[3px]"
        :class="block ? 'w-full' : ''"
        style="background: var(--surface-2); border-color: var(--line)"
    >
        <button
            v-for="opt in options"
            :key="opt.value"
            type="button"
            class="h-8 truncate rounded-[7px] border-none text-[13px] font-semibold"
            :class="block ? 'min-w-0 flex-1 px-1.5' : 'px-3.5'"
            :style="{
                background: model === opt.value ? 'var(--surface)' : 'transparent',
                color: model === opt.value ? 'var(--ink)' : 'var(--ink-3)',
                cursor: 'pointer',
            }"
            @click="model = opt.value"
        >
            {{ opt.label }}
        </button>
    </div>
</template>
