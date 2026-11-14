<script setup lang="ts">
// One segment per step, coloured by the step's status: a run's shape at a
// glance — how far it got and where it stopped — without expanding it.
import { useI18n } from 'vue-i18n'
import type { WorkflowStepRun } from '../../api/gen/workflow_pb.js'

defineProps<{ stepRuns: WorkflowStepRun[] }>()
const { t } = useI18n()

const COLORS: Record<string, string> = {
    success: 'var(--ok)',
    failed: 'var(--err)',
    running: 'var(--info)',
    pending: 'var(--line)',
    skipped: 'var(--line-2)',
}
</script>

<template>
    <div style="display:flex; gap:3px; align-items:center; min-width:0;" aria-hidden="true">
        <span
            v-for="s in stepRuns"
            :key="s.position"
            :title="`${s.position + 1} · ${s.name}: ${t(`status.${s.status}`)}`"
            :class="s.status === 'running' ? 'animate-pulse' : ''"
            :style="{
                flex: '1 1 0', maxWidth: '28px', minWidth: '6px', height: '7px', borderRadius: '4px',
                background: COLORS[s.status] ?? 'var(--line)',
                outline: s.status === 'skipped' ? '1px dashed var(--line)' : 'none',
                outlineOffset: '-1px',
            }"
        />
    </div>
</template>
