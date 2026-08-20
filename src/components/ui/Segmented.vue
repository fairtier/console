<script setup lang="ts" generic="T extends string">
defineProps<{ options: { value: T; label: string }[] }>()
const model = defineModel<T>({ required: true })
</script>

<template>
    <div
        class="flex gap-1 rounded-[10px] border p-[3px]"
        style="background: var(--surface-2); border-color: var(--line)"
    >
        <button
            v-for="opt in options"
            :key="opt.value"
            type="button"
            class="h-8 rounded-[7px] border-none px-3.5 text-[13px] font-semibold"
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
