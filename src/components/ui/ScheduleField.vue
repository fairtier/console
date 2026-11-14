<script setup lang="ts">
// A labelled cron input: validated and spelled out as you type (src/lib/cron.ts
// through useCronText), with the next few run times underneath. The same
// field the transformation form and the pipeline wizard draw inline; `error`
// carries a server-side violation for the field, which wins over the hint.
import { computed } from 'vue'
import { useCronText } from '../../composables/useCronText'
import Icon from './Icon.vue'

const props = defineProps<{
    label: string
    placeholder?: string
    /** Hint shown while the field is empty (an empty schedule = manual runs). */
    emptyHint?: string
    /** Server-side validation message for this field. */
    error?: string
}>()

const model = defineModel<string>({ required: true })

const cronText = useCronText()
const localError = computed(() => cronText.error(model.value))
const shownError = computed(() => props.error || localError.value)
const hint = computed(() => {
    if (shownError.value) return shownError.value
    if (!model.value.trim()) return props.emptyHint ?? ''
    return cronText.describe(model.value)
})
const nextRuns = computed(() => (shownError.value || !model.value.trim() ? '' : cronText.nextRunsText(model.value, 3)))
</script>

<template>
    <label style="display:block;">
        <span style="display:block; font-size:12.5px; font-weight:700; color:var(--ink-2); margin-bottom:6px;">{{ label }}</span>
        <input
            v-model="model"
            type="text"
            :placeholder="placeholder"
            :aria-invalid="!!shownError"
            :style="{
                width: '100%', height: '40px', padding: '0 13px', borderRadius: '11px',
                border: `1px solid ${shownError ? 'var(--err)' : 'var(--line)'}`,
                background: 'var(--surface-2)', color: 'var(--ink)',
                fontFamily: `'JetBrains Mono',monospace`, fontSize: '13px', outline: 'none',
            }"
        />
        <span
            v-if="hint"
            :style="{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '12px', color: shownError ? 'var(--err)' : 'var(--ink-3)' }"
        >
            <Icon :name="shownError ? 'danger' : 'clock'" :size="13" :style="{ flexShrink: 0 }" />{{ hint }}
        </span>
        <span v-if="nextRuns" style="display:block; margin-top:4px; font-size:11.5px; color:var(--ink-3);">{{ nextRuns }}</span>
    </label>
</template>
