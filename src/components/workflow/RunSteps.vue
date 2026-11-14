<script setup lang="ts">
// The step timeline of one workflow run: per step its status, duration, the
// full error, and a way to the pipeline's or transformation's own run history
// (where that run's details live).
import { useI18n } from 'vue-i18n'
import type { WorkflowStepRun } from '../../api/gen/workflow_pb.js'
import Icon from '../ui/Icon.vue'
import Spinner from '../ui/Spinner.vue'
import StatusChip from '../ui/StatusChip.vue'
import StepKindBadge from './StepKindBadge.vue'
import { formatDuration } from '../../lib/workflow'

defineProps<{
    stepRuns: WorkflowStepRun[]
    /** Step run (by position) whose error is being explained right now. */
    explainingPosition?: number | null
    explainBusy?: boolean
}>()
const emit = defineEmits<{ explain: [step: WorkflowStepRun] }>()
const { t } = useI18n()

const DOT: Record<string, string> = {
    success: 'var(--ok)',
    failed: 'var(--err)',
    running: 'var(--info)',
    pending: 'var(--ink-3)',
    skipped: 'var(--line)',
}

// The existing views deep-link to a pipeline's / transformation's run history
// (?pipeline= / ?transformation=), not to a single run.
function historyLink(s: WorkflowStepRun) {
    return s.kind === 'transformation'
        ? { name: 'transformations', query: { transformation: s.refId } }
        : { name: 'pipelines', query: { pipeline: s.refId } }
}
function runId(s: WorkflowStepRun): string {
    return s.kind === 'transformation' ? s.transformationRunId : s.pipelineRunId
}
</script>

<template>
    <ol style="list-style:none; margin:0; padding:4px 0 2px;">
        <li
            v-for="(s, i) in stepRuns"
            :key="s.position"
            data-testid="workflow-step-run"
            style="display:grid; grid-template-columns:18px 1fr; gap:10px;"
        >
            <!-- rail -->
            <div style="display:flex; flex-direction:column; align-items:center;">
                <span
                    :class="s.status === 'running' ? 'animate-pulse' : ''"
                    :style="{ width: '10px', height: '10px', marginTop: '9px', borderRadius: '50%', flex: 'none', background: DOT[s.status] ?? 'var(--ink-3)', boxShadow: '0 0 0 3px var(--inset)' }"
                />
                <span v-if="i < stepRuns.length - 1" style="flex:1; width:2px; background:var(--line); margin-top:2px;" />
            </div>

            <div :style="{ padding: '4px 0 12px', minWidth: 0, opacity: s.status === 'skipped' ? 0.6 : 1 }">
                <div style="display:flex; align-items:center; gap:9px; flex-wrap:wrap;">
                    <span style="font-size:12px; font-weight:700; color:var(--ink-3);">{{ s.position + 1 }}</span>
                    <StepKindBadge :kind="s.kind" :size="22" />
                    <RouterLink
                        :to="historyLink(s)"
                        style="font-weight:600; font-size:13.5px; color:var(--ink); text-decoration:none;"
                        class="hover:underline"
                    >{{ s.name }}</RouterLink>
                    <StatusChip :status="s.status" />
                    <span v-if="s.startedAt" style="display:inline-flex; align-items:center; gap:4px; white-space:nowrap; font-size:12px; color:var(--ink-3); font-variant-numeric:tabular-nums;" :title="s.startedAt">
                        <Icon name="clock" :size="12" />{{ formatDuration(s.startedAt, s.completedAt) }}
                    </span>
                    <RouterLink
                        v-if="s.status !== 'skipped' && s.status !== 'pending'"
                        :to="historyLink(s)"
                        :title="runId(s) || undefined"
                        style="display:inline-flex; align-items:center; gap:3px; font-size:12px; font-weight:600; color:var(--accent); text-decoration:none; margin-left:auto;"
                    >{{ t('workflowsUi.detail.runHistory') }}<Icon name="arrowRight" :size="12" /></RouterLink>
                </div>

                <div
                    v-if="s.errorMessage"
                    style="margin-top:7px; padding:9px 11px; border-radius:10px; background:var(--err-soft); color:var(--err-ink); font-family:'JetBrains Mono',monospace; font-size:12px; line-height:1.5; white-space:pre-wrap; word-break:break-word; max-height:220px; overflow:auto;"
                >{{ s.errorMessage }}</div>
                <button
                    v-if="s.status === 'failed' && runId(s)"
                    type="button"
                    :disabled="explainBusy"
                    style="display:inline-flex; align-items:center; gap:6px; margin-top:6px; padding:3px 8px; border:1px solid var(--line); border-radius:7px; background:var(--surface); cursor:pointer; font-family:inherit; font-size:11.5px; font-weight:600; color:var(--ink-2);"
                    @click="emit('explain', s)"
                >
                    <Spinner v-if="explainBusy && explainingPosition === s.position" :size="11" />
                    <Icon v-else name="sparkle" :size="11" />
                    {{ t('explainUi.button') }}
                </button>
            </div>
        </li>
    </ol>
</template>
