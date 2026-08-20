<script setup lang="ts">
const model = defineModel<boolean>({ required: true })
defineProps<{ disabled?: boolean }>()
</script>

<template>
    <button
        type="button"
        role="switch"
        :aria-checked="model"
        :disabled="disabled"
        class="relative h-6 w-[46px] flex-none rounded-full border-none p-0 transition-[background] disabled:cursor-not-allowed disabled:opacity-50"
        :style="{ background: model ? 'var(--accent)' : 'var(--line)', cursor: disabled ? 'not-allowed' : 'pointer' }"
        @click="!disabled && (model = !model)"
    >
        <span
            class="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-[left] duration-150"
            :style="{ left: model ? '25px' : '3px' }"
        />
    </button>
</template>
