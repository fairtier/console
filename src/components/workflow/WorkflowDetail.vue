<script setup lang="ts">
// The expanded row of one workflow: its steps, actions, and run history
// (paginated through ListWorkflowRuns). A failed run says which step failed
// and why on its collapsed row; expanding it shows the whole step timeline.
// Polling is the parent's: it calls refresh() while anything is in flight,
// and this component reports whether it has an active run.
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { workflowClient } from '../../api'
import { errorMessage } from '../../api/errors'
import type { Workflow, WorkflowRun, WorkflowStepRun } from '../../api/gen/workflow_pb.js'
import Icon from '../ui/Icon.vue'
import Spinner from '../ui/Spinner.vue'
import StatusChip from '../ui/StatusChip.vue'
import ExplainPanel from '../ExplainPanel.vue'
import StepKindBadge from './StepKindBadge.vue'
import StepProgress from './StepProgress.vue'
import RunSteps from './RunSteps.vue'
import { useToast } from '../../composables/useToast'
import { useExplain } from '../../composables/useExplain'
import { failedStep, firstLine, formatDuration, formatRelative, isActiveStatus, mergeRuns } from '../../lib/workflow'

const PAGE_SIZE = 10

const props = defineProps<{
  workflow: Workflow
  triggering: boolean
}>()
const emit = defineEmits<{
  'run-now': []
  edit: []
  delete: []
  'active-change': [active: boolean]
}>()

const { t, locale } = useI18n()
const toast = useToast()

const runs = ref<WorkflowRun[]>([])
const nextPageToken = ref('')
const loading = ref(true)
const loadingMore = ref(false)
const expanded = ref<Set<string>>(new Set())

const active = computed(() => runs.value.some((r) => isActiveStatus(r.status)))
watch(active, (a) => emit('active-change', a), { immediate: true })

async function loadFirstPage(initial: boolean) {
  try {
    const resp = await workflowClient.listWorkflowRuns({ workflowId: props.workflow.id, pageSize: PAGE_SIZE })
    if (initial) {
      runs.value = resp.runs
      nextPageToken.value = resp.nextPageToken
      // Open the newest run straight away when it is the interesting one: a
      // failure (the notification deep link lands here) or one in flight.
      const newest = resp.runs[0]
      if (newest && (newest.status === 'failed' || isActiveStatus(newest.status))) {
        expanded.value = new Set([newest.id])
      }
    } else {
      // A poll: keep pages already loaded with "load more" below the fresh
      // one, and their token with them. (A run that slid across the page
      // boundary may come back on "load more"; loadMore() drops duplicates.)
      const onlyFirstPage = runs.value.length <= PAGE_SIZE
      runs.value = mergeRuns(runs.value, resp.runs)
      if (onlyFirstPage) nextPageToken.value = resp.nextPageToken
    }
  } catch (err) {
    if (initial) toast.error(errorMessage(err, t('workflowsUi.toast.loadRunsFailed')))
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!nextPageToken.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const resp = await workflowClient.listWorkflowRuns({
      workflowId: props.workflow.id,
      pageSize: PAGE_SIZE,
      pageToken: nextPageToken.value,
    })
    const known = new Set(runs.value.map((r) => r.id))
    runs.value = [...runs.value, ...resp.runs.filter((r) => !known.has(r.id))]
    nextPageToken.value = resp.nextPageToken
  } catch (err) {
    toast.error(errorMessage(err, t('workflowsUi.toast.loadRunsFailed')))
  } finally {
    loadingMore.value = false
  }
}

onMounted(() => loadFirstPage(true))
defineExpose({ refresh: () => loadFirstPage(false) })

function toggleRun(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

// --- Row summary: the one line that has to answer "what happened?" ----------
interface Summary {
  text: string
  detail: string
  tone: 'err' | 'ok' | 'info' | 'muted'
}
function summary(run: WorkflowRun): Summary {
  if (run.status === 'failed') {
    const step = failedStep(run.stepRuns)
    const why = firstLine(step?.errorMessage || run.errorMessage)
    if (step) return { text: t('workflowsUi.detail.failedAt', { step: step.position + 1, name: step.name }), detail: why, tone: 'err' }
    return { text: why, detail: '', tone: 'err' }
  }
  if (run.status === 'running') {
    const step = run.stepRuns.find((s) => s.status === 'running')
    if (step) return { text: t('workflowsUi.detail.runningStep', { step: step.position + 1, name: step.name }), detail: '', tone: 'info' }
    return { text: '', detail: '', tone: 'info' }
  }
  if (run.status === 'pending') return { text: t('workflowsUi.detail.queued'), detail: '', tone: 'muted' }
  if (run.status === 'success') {
    return { text: t('workflowsUi.detail.succeeded', { count: run.stepRuns.length }), detail: '', tone: 'ok' }
  }
  return { text: firstLine(run.errorMessage), detail: '', tone: 'muted' }
}
const TONE: Record<Summary['tone'], string> = {
  err: 'var(--err-ink)',
  ok: 'var(--ink-3)',
  info: 'var(--info-ink)',
  muted: 'var(--ink-3)',
}

function absolute(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(locale.value)
}

function stepLink(kind: string, refId: string) {
  return kind === 'transformation'
    ? { name: 'transformations', query: { transformation: refId } }
    : { name: 'pipelines', query: { pipeline: refId } }
}

// --- AI explain on a failed step: the step's own pipeline/dbt run ------------
const { open: explainOpen, loading: explaining, result: explainResult, explain, close: closeExplain } = useExplain()
const explainingPosition = ref<number | null>(null)
async function explainStep(s: WorkflowStepRun) {
  explainingPosition.value = s.position
  try {
    if (s.kind === 'transformation') {
      await explain({ case: 'transformationRun', value: { transformationId: s.refId, runId: s.transformationRunId } })
    } else {
      await explain({ case: 'pipelineRun', value: { pipelineId: s.refId, runId: s.pipelineRunId } })
    }
  } finally {
    explainingPosition.value = null
  }
}

const btn = 'display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 13px; border:1px solid var(--line); border-radius:10px; background:var(--surface); font-family:inherit; font-size:13px; font-weight:600; cursor:pointer;'
</script>

<template>
  <div data-testid="workflow-detail" style="padding:16px 20px 18px; border-top:1px dashed var(--line-2); background:var(--inset);">
    <!-- Steps + actions -->
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px;">
      <div style="min-width:0; flex:1;">
        <div v-if="workflow.description" style="font-size:13px; color:var(--ink-2); line-height:1.5; margin-bottom:10px; white-space:pre-line;">{{ workflow.description }}</div>
        <div style="font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3); margin-bottom:7px;">{{ t('workflowsUi.detail.steps') }}</div>
        <div v-if="workflow.steps.length" style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
          <template v-for="(s, i) in workflow.steps" :key="s.kind + s.refId">
            <RouterLink
              :to="stepLink(s.kind, s.refId)"
              style="display:inline-flex; align-items:center; gap:7px; padding:4px 10px 4px 5px; border:1px solid var(--line); border-radius:9px; background:var(--surface); color:var(--ink); text-decoration:none; font-size:12.5px; font-weight:600;"
            >
              <StepKindBadge :kind="s.kind" :size="20" />{{ s.name }}
            </RouterLink>
            <Icon v-if="i < workflow.steps.length - 1" name="arrowRight" :size="13" :style="{ color: 'var(--ink-3)' }" />
          </template>
        </div>
        <div
          v-else
          style="display:flex; align-items:flex-start; gap:8px; padding:9px 12px; border-radius:10px; background:var(--warn-soft); color:var(--warn-ink); font-size:12.5px; line-height:1.5;"
        >
          <Icon name="danger" :size="14" :style="{ flex: 'none', marginTop: '2px' }" />{{ t('workflowsUi.detail.noStepsWarning') }}
        </div>
      </div>
      <div style="display:flex; gap:8px; flex:none;">
        <button
          type="button"
          data-testid="workflow-detail-run"
          :disabled="triggering || workflow.steps.length === 0"
          :style="btn + 'color:var(--ink);' + ((triggering || workflow.steps.length === 0) ? 'opacity:.55; cursor:not-allowed;' : '')"
          @click="emit('run-now')"
        >
          <Spinner v-if="triggering" :size="14" /><Icon v-else name="play" :size="14" />{{ t('workflowsUi.menu.runNow') }}
        </button>
        <button type="button" :style="btn + 'color:var(--ink);'" @click="emit('edit')">
          <Icon name="edit" :size="14" />{{ t('workflowsUi.menu.edit') }}
        </button>
        <button type="button" :style="btn + 'color:var(--err);'" @click="emit('delete')">
          <Icon name="trash" :size="14" />{{ t('workflowsUi.menu.delete') }}
        </button>
      </div>
    </div>

    <!-- Runs -->
    <div style="font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3); margin:18px 0 6px;">{{ t('workflowsUi.detail.runs') }}</div>
    <div v-if="loading" style="display:flex; justify-content:center; padding:18px 0;"><Spinner :size="18" /></div>
    <div v-else-if="runs.length === 0" style="padding:10px 0; font-size:13px; color:var(--ink-3);">{{ t('workflowsUi.detail.runsEmpty') }}</div>
    <div v-else style="border:1px solid var(--line); border-radius:12px; background:var(--surface); overflow:hidden;">
      <div v-for="(run, ri) in runs" :key="run.id" data-testid="workflow-run" :style="{ borderTop: ri === 0 ? 'none' : '1px solid var(--line-2)' }">
        <button
          type="button"
          :aria-expanded="expanded.has(run.id)"
          style="display:grid; grid-template-columns:92px 132px 64px 120px minmax(0,1fr) 16px; gap:14px; align-items:center; width:100%; padding:10px 14px; border:none; background:transparent; cursor:pointer; text-align:left; font-family:inherit; color:var(--ink);"
          @click="toggleRun(run.id)"
        >
          <span><StatusChip :status="run.status" /></span>
          <span style="min-width:0;">
            <span style="display:block; font-size:12.5px; color:var(--ink-2); white-space:nowrap;" :title="absolute(run.startedAt || run.createdAt)">{{ formatRelative(run.startedAt || run.createdAt, Date.now(), locale) }}</span>
            <span style="display:block; font-size:11px; color:var(--ink-3);">{{ run.trigger === 'manual' ? t('workflowsUi.trigger.manual') : t('workflowsUi.trigger.schedule') }}</span>
          </span>
          <span style="font-size:12px; color:var(--ink-3); font-variant-numeric:tabular-nums;">{{ formatDuration(run.startedAt, run.completedAt) }}</span>
          <StepProgress :step-runs="run.stepRuns" />
          <span style="min-width:0;">
            <span
              style="display:block; font-size:12.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"
              :style="{ color: TONE[summary(run).tone] }"
            >{{ summary(run).text }}</span>
            <span
              v-if="summary(run).detail"
              :title="summary(run).detail"
              style="display:block; font-size:12px; color:var(--err); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family:'JetBrains Mono',monospace;"
            >{{ summary(run).detail }}</span>
          </span>
          <Icon name="chevronDown" :size="15" :style="{ color: 'var(--ink-3)', transform: expanded.has(run.id) ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }" />
        </button>
        <div v-if="expanded.has(run.id)" style="padding:2px 16px 8px 18px; border-top:1px dashed var(--line-2); background:var(--surface-2);">
          <div v-if="run.stepRuns.length === 0" style="padding:10px 0; font-size:12.5px; color:var(--ink-3);">{{ t('workflowsUi.detail.queued') }}</div>
          <RunSteps
            v-else
            :step-runs="run.stepRuns"
            :explaining-position="explainingPosition"
            :explain-busy="explaining"
            @explain="explainStep"
          />
          <div
            v-if="run.errorMessage && !failedStep(run.stepRuns)"
            style="margin:4px 0 6px; font-size:12px; color:var(--err); white-space:pre-wrap; word-break:break-word;"
          >{{ run.errorMessage }}</div>
        </div>
      </div>
    </div>
    <div v-if="nextPageToken" style="display:flex; justify-content:center; margin-top:10px;">
      <button
        type="button"
        :disabled="loadingMore"
        :style="btn + 'color:var(--ink-2);'"
        @click="loadMore"
      >
        <Spinner v-if="loadingMore" :size="14" />{{ t('workflowsUi.detail.loadMore') }}
      </button>
    </div>

    <ExplainPanel :open="explainOpen" :result="explainResult" @close="closeExplain" />
  </div>
</template>
