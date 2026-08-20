<script setup lang="ts">
import { ref } from 'vue'
import Icon from './Icon.vue'

const props = defineProps<{ value: string; size?: number }>()
const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function doCopy() {
    try {
        await navigator.clipboard.writeText(props.value)
    } catch {
        /* ignore */
    }
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (copied.value = false), 1400)
}
</script>

<template>
    <button
        type="button"
        class="flex flex-none items-center justify-center rounded-lg border bg-surface-2 transition-colors hover:border-accent hover:text-accent"
        :style="{
            width: `${size ?? 30}px`,
            height: `${size ?? 30}px`,
            borderColor: 'var(--line)',
            color: copied ? 'var(--ok)' : 'var(--ink-2)',
        }"
        :title="copied ? 'Copied' : 'Copy'"
        @click="doCopy"
    >
        <Icon :name="copied ? 'check' : 'copy'" :size="15" />
    </button>
</template>
