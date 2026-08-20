<script setup lang="ts">
defineProps<{
    steps: string[]
    /** Zero-based index of the active step. */
    current: number
}>()
</script>

<template>
    <div class="flex items-center">
        <template v-for="(label, i) in steps" :key="i">
            <div class="flex flex-none items-center gap-[9px]">
                <div
                    class="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] text-xs font-bold"
                    :style="{
                        background: i === current ? 'var(--accent)' : i < current ? 'var(--accent-soft)' : 'var(--surface-2)',
                        color: i === current ? 'var(--accent-ink)' : i < current ? 'var(--accent-soft-ink)' : 'var(--ink-3)',
                        borderColor: i <= current ? 'transparent' : 'var(--line)',
                    }"
                >
                    <span v-if="i < current">✓</span>
                    <span v-else>{{ i + 1 }}</span>
                </div>
                <span
                    class="text-[13px] font-semibold"
                    :style="{ color: i === current ? 'var(--ink)' : 'var(--ink-3)' }"
                >{{ label }}</span>
            </div>
            <div
                v-if="i < steps.length - 1"
                class="mx-3 h-[1.5px] min-w-[18px] flex-1"
                style="background: var(--line)"
            />
        </template>
    </div>
</template>
