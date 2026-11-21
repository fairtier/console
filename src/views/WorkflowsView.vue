<script setup lang="ts">
// Workflows: named, ordered, linear lists of pipeline/transformation steps on
// one optional schedule (workspace-api workflow.v1). Same shape as the
// Pipelines and Transformations pages — a table whose rows expand into run
// history — with the editor opening above the table like the transformation
// form. `?workflow=<id>` opens that workflow's detail; the "workflow failed"
// notification links there.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Code, ConnectError } from '@connectrpc/connect'
import { useRoute, useRouter } from 'vue-router'
import { workflowClient, pipelineClient, transformationClient } from '../api'
import { errorMessage } from '../api/errors'
import type { Workflow } from '../api/gen/workflow_pb.js'
import type { Pipeline } from '../api/gen/pipeline_pb.js'
import type { Transformation } from '../api/gen/transformation_pb.js'
import Icon from '../components/ui/Icon.vue'
import StatusChip from '../components/ui/StatusChip.vue'
import Spinner from '../components/ui/Spinner.vue'
import Toggle from '../components/ui/Toggle.vue'
import WorkflowEditor from '../components/workflow/WorkflowEditor.vue'
import WorkflowDetail from '../components/workflow/WorkflowDetail.vue'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import { useCronText } from '../composables/useCronText'
import { chainSummary, formatRelative, isActiveStatus } from '../lib/workflow'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { confirm } = useConfirm()
const cronText = useCronText()

// Same cadence as the demo card's background poll.
const POLL_MS = 4000

const workflows = ref<Workflow[]>([])
const pipelines = ref<Pipeline[]>([])
const transformations = ref<Transformation[]>([])
const loading = ref(true)
// A workspace-api from before workflow.v1 has no WorkflowService: the call
// answers Unimplemented (a 404 from the mux reads the same). That is a box
// whose image is older than this Console's, not an error — say so calmly.
const unavailable = ref(false)

// silent skips the full-section loading state — polls refresh in place.
async function loadWorkflows(silent = false) {
  if (!silent) loading.value = true
  try {
    const resp = await workflowClient.listWorkflows({})
    workflows.value = resp.workflows
    unavailable.value = false
  } catch (err) {
    if (err instanceof ConnectError && err.code === Code.Unimplemented) unavailable.value = true
    else if (!silent) toast.error(errorMessage(err, t('workflowsUi.toast.loadFailed')))
  } finally {
    if (!silent) loading.value = false
  }
}

// The step picker and the double-run warnings need the targets' own
// definitions. Not fatal when they fail: the list still renders from the
// names the workflows carry.
async function loadTargets() {
  const [p, x] = await Promise.all([
    pipelineClient.listPipelines({}).catch(() => null),
    transformationClient.listTransformations({}).catch(() => null),
  ])
  if (p) pipelines.value = p.pipelines
  if (x) transformations.value = x.transformations
}
const hasTargets = computed(() => pipelines.value.length + transformations.value.length > 0)

// --- Row presentation ---------------------------------------------------------
function chain(w: Workflow): string {
  return chainSummary(w.steps.map((s) => s.name))
}
// Which step the last run failed at (workspace-api's failure summary; older
// APIs leave it empty and the row shows the chip alone). Without a step, the
// run's own error's first line.
function failureSummary(w: Workflow): string {
  if (w.lastRunStatus !== 'failed') return ''
  if (w.lastFailedStepPosition !== undefined && w.lastFailedStepName) {
    return t('workflowsUi.failedAtStep', { step: w.lastFailedStepPosition + 1, name: w.lastFailedStepName })
  }
  return w.lastRunError
}
function humanizeSchedule(cron: string): string {
  return cronText.summarize(cron) || t('workflowsUi.manualOnly')
}
function scheduleTooltip(cron: string): string {
  return cronText.error(cron) || cronText.describe(cron) || cron.trim()
}

// --- Detail (expanded row) + deep link ----------------------------------------
const expandedId = ref<string | null>(null)
const detailRef = ref<{ refresh: () => Promise<void> } | null>(null)
const detailActive = ref(false)
// A function ref: a plain `ref="…"` inside v-for collects an array.
function setDetailRef(el: unknown) {
  detailRef.value = (el as { refresh: () => Promise<void> } | null) ?? null
}

function setQuery(id: string | null) {
  const query = { ...route.query }
  if (id) query.workflow = id
  else delete query.workflow
  router.replace({ query }).catch(() => {})
}

function toggleExpand(id: string) {
  const next = expandedId.value === id ? null : id
  expandedId.value = next
  detailActive.value = false
  setQuery(next)
}

// Opens the workflow the URL names: on load, and when a notification is
// clicked while this page is already open (same route, new query).
async function openFromQuery() {
  const id = route.query.workflow
  if (unavailable.value || typeof id !== 'string' || !id || expandedId.value === id) return
  if (!workflows.value.some((w) => w.id === id)) {
    toast.error(t('workflowsUi.detail.notFound'))
    setQuery(null)
    return
  }
  expandedId.value = id
  detailActive.value = false
  await nextTick()
  document.querySelector(`[data-workflow-row="${id}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}
watch(() => route.query.workflow, () => {
  if (!loading.value) void openFromQuery()
})

// --- Polling while anything is in flight ----------------------------------------
const listActive = computed(() => workflows.value.some((w) => isActiveStatus(w.lastRunStatus)))
const shouldPoll = computed(() => listActive.value || detailActive.value)
let pollTimer: ReturnType<typeof setInterval> | undefined
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = undefined
}
watch(shouldPoll, (on) => {
  if (!on) return stopPolling()
  if (pollTimer) return
  pollTimer = setInterval(() => {
    void loadWorkflows(true)
    void detailRef.value?.refresh()
  }, POLL_MS)
})

// --- Row menu (same teleport pattern as PipelinesView) -------------------------
const openMenuId = ref<string | null>(null)
const MENU_WIDTH = 172
const menuPos = ref<{ top: number; left: number }>({ top: 0, left: 0 })
function toggleMenu(id: string, event: MouseEvent) {
  if (openMenuId.value === id) {
    openMenuId.value = null
    return
  }
  const btn = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const left = Math.max(8, Math.min(btn.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
  menuPos.value = { top: btn.bottom + 4, left }
  openMenuId.value = id
}
function closeMenus() {
  openMenuId.value = null
}

onMounted(async () => {
  document.addEventListener('click', closeMenus)
  window.addEventListener('scroll', closeMenus, true)
  window.addEventListener('resize', closeMenus)
  await Promise.all([loadWorkflows(), loadTargets()])
  await openFromQuery()
})
onBeforeUnmount(() => {
  stopPolling()
  document.removeEventListener('click', closeMenus)
  window.removeEventListener('scroll', closeMenus, true)
  window.removeEventListener('resize', closeMenus)
})

// --- Actions ------------------------------------------------------------------
const triggering = ref<Set<string>>(new Set())

async function runNow(w: Workflow) {
  closeMenus()
  if (triggering.value.has(w.id)) return
  triggering.value = new Set([...triggering.value, w.id])
  try {
    const resp = await workflowClient.triggerWorkflow({ id: w.id })
    toast.success(t('workflowsUi.toast.triggered'))
    // Show it queued now; the poll that this starts takes it from there.
    const run = resp.run
    if (run) {
      w.lastRunStatus = run.status
      w.lastRunAt = run.createdAt || run.startedAt
    }
    if (expandedId.value === w.id) await detailRef.value?.refresh()
  } catch (err) {
    toast.error(errorMessage(err, t('workflowsUi.toast.triggerFailed')))
  } finally {
    const next = new Set(triggering.value)
    next.delete(w.id)
    triggering.value = next
  }
}

// Enabled goes through SetWorkflowEnabled, flipped optimistically and rolled
// back on failure. An API older than that RPC answers Unimplemented; then it
// falls back to a full-definition UpdateWorkflow, as before.
const toggling = ref<Set<string>>(new Set())
async function setEnabled(w: Workflow, enabled: boolean) {
  if (toggling.value.has(w.id)) return
  toggling.value = new Set([...toggling.value, w.id])
  const before = w.enabled
  w.enabled = enabled
  try {
    const saved = await setWorkflowEnabled(w, enabled)
    if (saved) replaceWorkflow(saved)
  } catch (err) {
    w.enabled = before
    toast.error(errorMessage(err, t('workflowsUi.toast.updateFailed')))
  } finally {
    const next = new Set(toggling.value)
    next.delete(w.id)
    toggling.value = next
  }
}

async function setWorkflowEnabled(w: Workflow, enabled: boolean): Promise<Workflow | undefined> {
  try {
    return (await workflowClient.setWorkflowEnabled({ id: w.id, enabled })).workflow
  } catch (err) {
    if (!(err instanceof ConnectError && err.code === Code.Unimplemented)) throw err
  }
  const resp = await workflowClient.updateWorkflow({
    id: w.id,
    name: w.name,
    description: w.description,
    schedule: w.schedule,
    enabled,
    steps: w.steps.map((s) => ({ kind: s.kind, refId: s.refId })),
  })
  return resp.workflow
}

function replaceWorkflow(w: Workflow) {
  const i = workflows.value.findIndex((x) => x.id === w.id)
  if (i >= 0) workflows.value.splice(i, 1, w)
  else workflows.value = [...workflows.value, w].sort((a, b) => a.name.localeCompare(b.name))
}

async function deleteWorkflow(w: Workflow) {
  closeMenus()
  const ok = await confirm({
    title: t('workflowsUi.deleteConfirm.title'),
    body: t('workflowsUi.deleteConfirm.body'),
    confirmLabel: t('workflowsUi.deleteConfirm.confirm'),
    danger: true,
  })
  if (!ok) return
  try {
    await workflowClient.deleteWorkflow({ id: w.id })
    workflows.value = workflows.value.filter((x) => x.id !== w.id)
    if (expandedId.value === w.id) toggleExpand(w.id)
    toast.success(t('workflowsUi.toast.deleted'))
  } catch (err) {
    toast.error(errorMessage(err, t('workflowsUi.toast.deleteFailed')))
  }
}

// --- Editor -------------------------------------------------------------------
const editorOpen = ref(false)
const editing = ref<Workflow | null>(null)
const editorKey = ref(0)
const editorEl = ref<HTMLElement | null>(null)

async function openEditor(w: Workflow | null) {
  closeMenus()
  editing.value = w
  editorKey.value++
  editorOpen.value = true
  // Fresh targets: a schedule cleared in another tab should clear its warning.
  void loadTargets()
  await nextTick()
  // Not smooth: an open dropdown closes on scroll, and a smooth scroll is
  // still running when the first click lands in the form.
  editorEl.value?.scrollIntoView({ block: 'start' })
}
function onSaved(w: Workflow) {
  editorOpen.value = false
  replaceWorkflow(w)
  expandedId.value = w.id
  setQuery(w.id)
}
</script>

<template>
  <div style="max-width:1080px; margin:0 auto; padding:34px 34px 80px;">
    <div ref="editorEl" style="display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:22px; scroll-margin-top:16px;">
      <div>
        <h1 style="margin:0 0 5px; font-size:25px; font-weight:700; letter-spacing:-.02em;">{{ t('workflowsUi.heading') }}</h1>
        <div style="font-size:13.5px; color:var(--ink-2);">{{ t('workflowsUi.subtitle') }}</div>
      </div>
      <button
        v-if="!loading && !unavailable && !editorOpen && workflows.length > 0"
        @click="openEditor(null)"
        style="display:flex; align-items:center; gap:8px; height:40px; padding:0 16px; border:none; border-radius:11px; background:var(--accent); color:var(--accent-ink); font-family:inherit; font-size:14px; font-weight:600; cursor:pointer; box-shadow:var(--shadow); flex:none;"
      >
        <Icon name="plus" :size="16" />{{ t('workflowsUi.new') }}
      </button>
    </div>

    <WorkflowEditor
      v-if="editorOpen"
      :key="editorKey"
      :workflow="editing"
      :pipelines="pipelines"
      :transformations="transformations"
      @saved="onSaved"
      @cancel="editorOpen = false"
    />

    <!-- Loading -->
    <div v-if="loading" style="display:flex; align-items:center; justify-content:center; padding:60px 0;">
      <Spinner />
    </div>

    <!-- Not served by this workspace's API (older than workflow.v1) -->
    <div
      v-else-if="unavailable"
      data-testid="workflows-unavailable"
      style="background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); padding:48px 34px; text-align:center;"
    >
      <div style="width:48px; height:48px; margin:0 auto 16px; border-radius:13px; background:var(--accent-soft); color:var(--accent-soft-ink); display:flex; align-items:center; justify-content:center;">
        <Icon name="workflow" :size="24" />
      </div>
      <h2 style="margin:0 0 6px; font-size:18px; font-weight:700; letter-spacing:-.01em;">{{ t('workflowsUi.unavailable.title') }}</h2>
      <div style="font-size:13.5px; color:var(--ink-2); max-width:470px; margin:0 auto; line-height:1.55;">{{ t('workflowsUi.unavailable.body') }}</div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="workflows.length === 0 && !editorOpen"
      data-testid="workflows-empty"
      style="background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); padding:48px 34px; text-align:center;"
    >
      <div style="width:48px; height:48px; margin:0 auto 16px; border-radius:13px; background:var(--accent-soft); color:var(--accent-soft-ink); display:flex; align-items:center; justify-content:center;">
        <Icon name="workflow" :size="24" />
      </div>
      <h2 style="margin:0 0 6px; font-size:18px; font-weight:700; letter-spacing:-.01em;">{{ t('workflowsUi.empty.title') }}</h2>
      <div style="font-size:13.5px; color:var(--ink-2); max-width:470px; margin:0 auto 22px; line-height:1.55;">{{ t('workflowsUi.empty.body') }}</div>
      <button
        v-if="hasTargets"
        @click="openEditor(null)"
        style="display:inline-flex; align-items:center; gap:8px; height:42px; padding:0 20px; border:none; border-radius:11px; background:var(--accent); color:var(--accent-ink); font-family:inherit; font-size:14px; font-weight:600; cursor:pointer; box-shadow:var(--shadow);"
      >
        <Icon name="plus" :size="16" />{{ t('workflowsUi.empty.cta') }}
      </button>
      <template v-else>
        <div style="font-size:13px; color:var(--ink-3); margin-bottom:14px;">{{ t('workflowsUi.empty.needTargets') }}</div>
        <RouterLink
          :to="{ name: 'pipeline-new' }"
          style="display:inline-flex; align-items:center; gap:8px; height:42px; padding:0 20px; border-radius:11px; background:var(--accent); color:var(--accent-ink); font-size:14px; font-weight:600; text-decoration:none; box-shadow:var(--shadow);"
        >
          <Icon name="plus" :size="16" />{{ t('pipelinesUi.new') }}
        </RouterLink>
      </template>
    </div>

    <!-- Table -->
    <div
      v-else-if="workflows.length > 0"
      style="background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); overflow:hidden;"
    >
      <div style="display:grid; grid-template-columns:2.2fr 1fr 64px 1.15fr 34px 40px; gap:14px; padding:11px 20px; border-bottom:1px solid var(--line); font-size:11.5px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3);">
        <div>{{ t('workflowsUi.cols.workflow') }}</div>
        <div>{{ t('workflowsUi.cols.schedule') }}</div>
        <div>{{ t('workflowsUi.cols.enabled') }}</div>
        <div>{{ t('workflowsUi.cols.lastRun') }}</div>
        <div></div>
        <div></div>
      </div>

      <template v-for="w in workflows" :key="w.id">
        <div
          :data-workflow-row="w.id"
          data-testid="workflow-row"
          :aria-expanded="expandedId === w.id"
          style="display:grid; grid-template-columns:2.2fr 1fr 64px 1.15fr 34px 40px; gap:14px; align-items:center; padding:14px 20px; border-top:1px solid var(--line-2); cursor:pointer; scroll-margin-top:16px;"
          :style="{ background: expandedId === w.id ? 'var(--surface-2)' : 'transparent' }"
          @click="toggleExpand(w.id)"
        >
          <!-- Name + chain -->
          <div style="display:flex; align-items:center; gap:11px; min-width:0;">
            <div style="width:32px; height:32px; border-radius:9px; border:1px solid var(--line); background:var(--accent-soft); color:var(--accent-soft-ink); display:flex; align-items:center; justify-content:center; flex:none;">
              <Icon name="workflow" :size="17" />
            </div>
            <div style="min-width:0;">
              <div style="font-weight:600; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ w.name }}</div>
              <div
                v-if="w.steps.length"
                data-testid="workflow-chain"
                :title="w.steps.map((s) => s.name).join(' → ')"
                style="display:flex; align-items:center; gap:5px; font-size:11.5px; color:var(--ink-3); font-family:'JetBrains Mono',monospace; min-width:0;"
              >
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ chain(w) }}</span>
              </div>
              <div v-else style="display:flex; align-items:center; gap:5px; font-size:11.5px; color:var(--warn-ink);">
                <Icon name="danger" :size="12" />{{ t('workflowsUi.noSteps') }}
              </div>
            </div>
          </div>

          <!-- Schedule -->
          <div
            :title="scheduleTooltip(w.schedule)"
            style="font-size:13px; color:var(--ink-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"
          >{{ humanizeSchedule(w.schedule) }}</div>

          <!-- Enabled -->
          <div @click.stop>
            <Toggle
              :model-value="w.enabled"
              :disabled="toggling.has(w.id)"
              :aria-label="t('workflowsUi.cols.enabled')"
              @update:model-value="(v: boolean) => setEnabled(w, v)"
            />
          </div>

          <!-- Last run -->
          <div v-if="w.lastRunStatus" style="min-width:0;">
            <div style="display:flex; align-items:center; gap:8px; min-width:0;">
              <StatusChip :status="w.lastRunStatus" />
              <span v-if="w.lastRunAt" :title="w.lastRunAt" style="font-size:12px; color:var(--ink-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ formatRelative(w.lastRunAt, Date.now(), locale) }}</span>
            </div>
            <div
              v-if="failureSummary(w)"
              data-testid="workflow-failed-step"
              :title="w.lastRunError"
              style="margin-top:4px; font-size:11.5px; color:var(--err-ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"
            >{{ failureSummary(w) }}</div>
          </div>
          <div v-else style="display:flex; align-items:center; gap:7px;">
            <span style="width:8px; height:8px; border-radius:50%; flex:none; background:var(--ink-3);"></span>
            <span style="font-size:12.5px; color:var(--ink-3);">{{ t('workflowsUi.neverRun') }}</span>
          </div>

          <!-- Run now -->
          <div @click.stop>
            <button
              type="button"
              data-testid="workflow-run-now"
              :title="t('workflowsUi.menu.runNow')"
              :aria-label="t('workflowsUi.menu.runNow')"
              :disabled="triggering.has(w.id) || w.steps.length === 0"
              :style="{
                width: '30px', height: '30px', border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)',
                cursor: (triggering.has(w.id) || w.steps.length === 0) ? 'not-allowed' : 'pointer',
                opacity: w.steps.length === 0 ? 0.45 : 1,
              }"
              @click="runNow(w)"
            >
              <Spinner v-if="triggering.has(w.id)" :size="13" />
              <Icon v-else name="play" :size="13" />
            </button>
          </div>

          <!-- Row menu -->
          <div style="position:relative; display:flex; justify-content:flex-end;" @click.stop>
            <button
              type="button"
              :aria-label="t('workflowsUi.menu.more')"
              @click="toggleMenu(w.id, $event)"
              style="width:30px; height:30px; border:none; background:transparent; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--ink-3);"
            >
              <Icon name="dots" :size="16" />
            </button>
            <Teleport to="body">
              <div
                v-if="openMenuId === w.id"
                :style="{ position:'fixed', top: menuPos.top + 'px', left: menuPos.left + 'px', zIndex:60, width: MENU_WIDTH + 'px', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:'12px', boxShadow:'var(--shadow-lg)', padding:'5px' }"
                @click.stop
              >
                <button
                  @click="runNow(w)"
                  :disabled="w.steps.length === 0"
                  style="display:flex; align-items:center; gap:10px; width:100%; padding:8px 10px; border:none; border-radius:8px; background:transparent; cursor:pointer; font-family:inherit; font-size:13px; font-weight:600; color:var(--ink); text-align:left;"
                >
                  <Icon name="play" :size="15" />{{ t('workflowsUi.menu.runNow') }}
                </button>
                <button
                  @click="openEditor(w)"
                  style="display:flex; align-items:center; gap:10px; width:100%; padding:8px 10px; border:none; border-radius:8px; background:transparent; cursor:pointer; font-family:inherit; font-size:13px; font-weight:600; color:var(--ink); text-align:left;"
                >
                  <Icon name="edit" :size="15" />{{ t('workflowsUi.menu.edit') }}
                </button>
                <div style="height:1px; background:var(--line-2); margin:4px 6px;"></div>
                <button
                  @click="deleteWorkflow(w)"
                  style="display:flex; align-items:center; gap:10px; width:100%; padding:8px 10px; border:none; border-radius:8px; background:transparent; cursor:pointer; font-family:inherit; font-size:13px; font-weight:600; color:var(--err); text-align:left;"
                >
                  <Icon name="trash" :size="15" />{{ t('workflowsUi.menu.delete') }}
                </button>
              </div>
            </Teleport>
          </div>
        </div>

        <WorkflowDetail
          v-if="expandedId === w.id"
          :ref="setDetailRef"
          :key="'detail-' + w.id"
          :workflow="w"
          :triggering="triggering.has(w.id)"
          @run-now="runNow(w)"
          @edit="openEditor(w)"
          @delete="deleteWorkflow(w)"
          @active-change="(a: boolean) => (detailActive = a)"
        />
      </template>
    </div>
  </div>
</template>
