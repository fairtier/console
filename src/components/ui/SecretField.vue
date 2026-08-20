<script setup lang="ts">
import { ref, computed } from 'vue'
import Icon from './Icon.vue'
import CopyButton from './CopyButton.vue'

const props = withDefaults(
    defineProps<{
        label: string
        value: string
        /** When true the value is masked until revealed. */
        secret?: boolean
        mono?: boolean
    }>(),
    { secret: false, mono: true },
)

const revealed = ref(false)
const shown = computed(() =>
    props.secret && !revealed.value ? '•'.repeat(26) : props.value,
)
</script>

<template>
    <div class="flex items-center gap-3.5 border-b py-[9px]" style="border-color: var(--line-2)">
        <div class="w-40 flex-none text-[12.5px] font-semibold text-ink-3">{{ label }}</div>
        <div
            class="min-w-0 flex-1 truncate text-[12.5px] text-ink"
            :class="mono ? 'font-mono' : ''"
        >
            {{ shown }}
        </div>
        <button
            v-if="secret"
            type="button"
            class="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg border bg-surface-2 text-ink-2 hover:border-accent hover:text-accent"
            style="border-color: var(--line)"
            :title="revealed ? 'Hide' : 'Reveal'"
            @click="revealed = !revealed"
        >
            <Icon name="eye" :size="15" />
        </button>
        <CopyButton :value="value" />
    </div>
</template>
