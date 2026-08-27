<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { pipelineClient } from '../api'
import { errorMessage } from '../api/errors'
import type { Pipeline, PipelineRun } from '../api/gen/pipeline_pb.js'
import Icon from '../components/ui/Icon.vue'
import StatusChip from '../components/ui/StatusChip.vue'
import Spinner from '../components/ui/Spinner.vue'
import DemoProjectCard from '../components/DemoProjectCard.vue'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import { useCronText } from '../composables/useCronText'
import { useExplain } from '../composables/useExplain'
import { parseConfigObject } from '../lib/pipelineConfig'
import { sourceFor } from '../lib/pipelineSources'
import ExplainPanel from '../components/ExplainPanel.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const toast = useToast()
const { confirm } = useConfirm()

const pipelines = ref<Pipeline[]>([])
const loading = ref(false)
const openMenuId = ref<string | null>(null)

// Expanded pipeline's run history. Runs are loaded lazily on expand from
// getPipeline().recentRuns — the failing run's full error lives in run.errorMessage.
const expandedId = ref<string | null>(null)
const runs = ref<PipelineRun[]>([])
const runsLoading = ref(false)

// AI "Explain" on a failed run: the server assembles the context from its
// own rows by id — only ids leave the browser.
const { open: explainOpen, loading: explaining, result: explainResult, explain, close: closeExplain } = useExplain()
const explainingRunId = ref('')

async function explainRun(pipelineId: string, runId: string) {
  explainingRunId.value = runId
  try {
    await explain({ case: 'pipelineRun', value: { pipelineId, runId } })
  } finally {
    explainingRunId.value = ''
  }
}
// Menu is teleported to <body> so it escapes the table card's overflow:hidden
// clip; position is computed from the trigger button on open.
const MENU_WIDTH = 172
const menuPos = ref<{ top: number; left: number }>({ top: 0, left: 0 })

// silent skips the full-section loading state — used by the demo card's
// background poll so a refresh every few seconds doesn't flash the list.
async function loadPipelines(silent = false) {
  if (!silent) loading.value = true
  try {
    const resp = await pipelineClient.listPipelines({})
    pipelines.value = resp.pipelines
  } finally {
    if (!silent) loading.value = false
  }
}

// --- Source-type presentation (abbr / colours), from the shared registry:
// the same module the wizard reads, so a new source type is one file and both
// views follow. An unknown type still renders — a neutral badge abbreviated
// from the type itself, and the raw type as its label.
function sourceMeta(type: string) {
  return sourceFor(type).badge
}
// The label reads the config too, so a duckdb pipeline says what it actually
// reads — "MySQL", "Google Drive file" — rather than naming the extension
// mechanism it happens to travel through. The badge stays DDB either way:
// that IS the shared thing about them.
function sourceLabel(type: string, sourceConfig: string): string {
  const { labelKey } = sourceFor(type, parseConfigObject(sourceConfig))
  return labelKey ? t(labelKey) : type
}

// --- Relative-time formatter for the last-run column. Best-effort buckets
// (seconds → days); falls back to empty string on an unparseable timestamp.
function formatRelative(iso: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const sec = Math.round((Date.now() - then) / 1000)
  const min = Math.round(sec / 60)
  const hr = Math.round(min / 60)
  const day = Math.round(hr / 24)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (Math.abs(sec) < 60) return rtf.format(-sec, 'second')
  if (Math.abs(min) < 60) return rtf.format(-min, 'minute')
  if (Math.abs(hr) < 24) return rtf.format(-hr, 'hour')
  return rtf.format(-day, 'day')
}

// --- Cron rendering (src/lib/cron.ts): a short label in the cell, the full
// sentence (or the validation problem) as its tooltip.
const cronText = useCronText()
function humanizeSchedule(cron: string): string {
  return cronText.summarize(cron) || t('pipelinesUi.manualOnly')
}
function scheduleTooltip(cron: string): string {
  return cronText.error(cron) || cronText.describe(cron) || cron.trim()
}

function toggleMenu(id: string, event: MouseEvent) {
  if (openMenuId.value === id) {
    openMenuId.value = null
    return
  }
  const btn = (event.currentTarget as HTMLElement).getBoundingClientRect()
  // Right-align the menu under the trigger, clamped to the viewport.
  const left = Math.max(8, Math.min(btn.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
  menuPos.value = { top: btn.bottom + 4, left }
  openMenuId.value = id
}
function closeMenus() {
  openMenuId.value = null
}

// Toggle a pipeline's run-history row, loading its recent runs on open.
async function toggleExpand(id: string) {
  if (expandedId.value === id) {
    expandedId.value = null
    return
  }
  expandedId.value = id
  runs.value = []
  runsLoading.value = true
  try {
    const resp = await pipelineClient.getPipeline({ id })
    runs.value = resp.recentRuns
  } catch (err) {
    toast.error(errorMessage(err, t('pipelinesUi.toast.loadRunsFailed')))
  } finally {
    runsLoading.value = false
  }
}

function onDocClick() {
  closeMenus()
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  // A fixed-positioned menu would detach visually from its row on scroll, so
  // close it instead (capture to catch the scroll container too).
  window.addEventListener('scroll', closeMenus, true)
  window.addEventListener('resize', closeMenus)
  loadPipelines()
  // Deep-link from a failed-run notification (/pipelines?pipeline=<id>) opens
  // that pipeline's run history straight on the error.
  const target = route.query.pipeline
  if (typeof target === 'string' && target) void toggleExpand(target)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('scroll', closeMenus, true)
  window.removeEventListener('resize', closeMenus)
})

async function runNow(id: string) {
  closeMenus()
  try {
    await pipelineClient.triggerPipeline({ id })
    toast.success(t('pipelinesUi.toast.triggered'))
  } catch (err) {
    toast.error(errorMessage(err, t('pipelinesUi.toast.triggerFailed')))
  }
}

function editPipeline(id: string) {
  closeMenus()
  router.push({ name: 'pipeline-new', query: { id } })
}

async function deletePipeline(id: string) {
  closeMenus()
  const ok = await confirm({
    title: t('pipelinesUi.deleteConfirm.title'),
    body: t('pipelinesUi.deleteConfirm.body'),
    confirmLabel: t('pipelinesUi.deleteConfirm.confirm'),
    danger: true,
  })
  if (!ok) return
  try {
    await pipelineClient.deletePipeline({ id })
    await loadPipelines()
    toast.success(t('pipelinesUi.toast.deleted'))
  } catch (err) {
    toast.error(errorMessage(err, t('pipelinesUi.toast.deleteFailed')))
  }
}
</script>

<template>
  <div style="max-width:1080px; margin:0 auto; padding:34px 34px 80px;">
    <div style="display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:22px;">
      <div>
        <h1 style="margin:0 0 5px; font-size:25px; font-weight:700; letter-spacing:-.02em;">{{ t('pipelinesUi.heading') }}</h1>
        <div style="font-size:13.5px; color:var(--ink-2);">{{ t('pipelinesUi.subtitle') }}</div>
      </div>
      <button
        v-if="!loading && pipelines.length > 0"
        @click="router.push({ name: 'pipeline-new' })"
        style="display:flex; align-items:center; gap:8px; height:40px; padding:0 16px; border:none; border-radius:11px; background:var(--accent); color:var(--accent-ink); font-family:inherit; font-size:14px; font-weight:600; cursor:pointer; box-shadow:var(--shadow); flex:none;"
      >
        <Icon name="plus" :size="16" />{{ t('pipelinesUi.new') }}
      </button>
    </div>

    <!-- Starter demo (Load when empty / Remove when loaded) -->
    <DemoProjectCard v-if="!loading" :workspace-empty="pipelines.length === 0" @changed="() => loadPipelines(true)" />

    <!-- Loading -->
    <div v-if="loading" style="display:flex; align-items:center; justify-content:center; padding:60px 0;">
      <Spinner />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="pipelines.length === 0"
      style="background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); padding:48px 34px; text-align:center;"
    >
      <div style="width:48px; height:48px; margin:0 auto 16px; border-radius:13px; background:var(--accent-soft); color:var(--accent-soft-ink); display:flex; align-items:center; justify-content:center;">
        <Icon name="pipelines" :size="24" />
      </div>
      <h2 style="margin:0 0 6px; font-size:18px; font-weight:700; letter-spacing:-.01em;">{{ t('pipelinesUi.empty.title') }}</h2>
      <div style="font-size:13.5px; color:var(--ink-2); max-width:420px; margin:0 auto 22px; line-height:1.55;">{{ t('pipelinesUi.empty.body') }}</div>
      <button
        @click="router.push({ name: 'pipeline-new' })"
        style="display:inline-flex; align-items:center; gap:8px; height:42px; padding:0 20px; border:none; border-radius:11px; background:var(--accent); color:var(--accent-ink); font-family:inherit; font-size:14px; font-weight:600; cursor:pointer; box-shadow:var(--shadow);"
      >
        <Icon name="plus" :size="16" />{{ t('pipelinesUi.empty.cta') }}
      </button>
    </div>

    <!-- Pipeline table -->
    <div
      v-else
      style="background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); overflow:hidden;"
    >
      <div style="display:grid; grid-template-columns:1.7fr 1fr 1.1fr .9fr 1fr 40px; gap:14px; padding:11px 20px; border-bottom:1px solid var(--line); font-size:11.5px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3);">
        <div>{{ t('pipelinesUi.cols.pipeline') }}</div>
        <div>{{ t('pipelinesUi.cols.dataset') }}</div>
        <div>{{ t('pipelinesUi.cols.schedule') }}</div>
        <div>{{ t('pipelinesUi.cols.state') }}</div>
        <div>{{ t('pipelinesUi.cols.lastRun') }}</div>
        <div></div>
      </div>

      <template v-for="p in pipelines" :key="p.id">
      <div
        style="display:grid; grid-template-columns:1.7fr 1fr 1.1fr .9fr 1fr 40px; gap:14px; align-items:center; padding:14px 20px; border-top:1px solid var(--line-2); cursor:pointer;"
        @click="toggleExpand(p.id)"
      >
        <!-- Pipeline (icon + name + source) -->
        <div style="display:flex; align-items:center; gap:11px; min-width:0;">
          <div
            style="width:32px; height:32px; border-radius:9px; border:1px solid var(--line); display:flex; align-items:center; justify-content:center; flex:none; font-size:10px; font-weight:700; letter-spacing:.03em;"
            :style="{ background: sourceMeta(p.sourceType).bg, color: sourceMeta(p.sourceType).fg }"
          >{{ sourceMeta(p.sourceType).abbr }}</div>
          <div style="min-width:0;">
            <div style="font-weight:600; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ p.name }}</div>
            <div style="font-size:11.5px; color:var(--ink-3);">{{ sourceLabel(p.sourceType, p.sourceConfig) }}</div>
          </div>
        </div>

        <!-- Dataset -->
        <div style="font-family:'JetBrains Mono',monospace; font-size:12.5px; color:var(--ink-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ p.datasetName }}</div>

        <!-- Schedule -->
        <div
          :title="scheduleTooltip(p.schedule)"
          style="font-size:13px; color:var(--ink-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"
        >{{ humanizeSchedule(p.schedule) }}</div>

        <!-- State (enabled) -->
        <div>
          <StatusChip
            :status="p.enabled ? 'active' : 'off'"
            :label="p.enabled ? t('pipelinesUi.state.on') : t('pipelinesUi.state.paused')"
          />
        </div>

        <!-- Last run: real status + relative time from the list payload. -->
        <div v-if="p.lastRunStatus" style="display:flex; align-items:center; gap:8px; min-width:0;">
          <StatusChip :status="p.lastRunStatus" />
          <span v-if="p.lastRunAt" style="font-size:12px; color:var(--ink-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ formatRelative(p.lastRunAt) }}</span>
        </div>
        <div v-else style="display:flex; align-items:center; gap:7px;">
          <span style="width:8px; height:8px; border-radius:50%; flex:none; background:var(--ink-3);"></span>
          <span style="font-size:12.5px; color:var(--ink-3);">{{ t('pipelinesUi.neverRun') }}</span>
        </div>

        <!-- Row menu -->
        <div style="position:relative; display:flex; justify-content:flex-end;" @click.stop>
          <button
            @click="toggleMenu(p.id, $event)"
            style="width:30px; height:30px; border:none; background:transparent; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--ink-3);"
          >
            <Icon name="dots" :size="16" />
          </button>
          <Teleport to="body">
            <div
              v-if="openMenuId === p.id"
              :style="{ position:'fixed', top: menuPos.top + 'px', left: menuPos.left + 'px', zIndex:60, width: MENU_WIDTH + 'px', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:'12px', boxShadow:'var(--shadow-lg)', padding:'5px' }"
              @click.stop
            >
              <button
                @click="runNow(p.id)"
                style="display:flex; align-items:center; gap:10px; width:100%; padding:8px 10px; border:none; border-radius:8px; background:transparent; cursor:pointer; font-family:inherit; font-size:13px; font-weight:600; color:var(--ink); text-align:left;"
              >
                <Icon name="play" :size="15" />{{ t('pipelinesUi.menu.runNow') }}
              </button>
              <button
                @click="editPipeline(p.id)"
                style="display:flex; align-items:center; gap:10px; width:100%; padding:8px 10px; border:none; border-radius:8px; background:transparent; cursor:pointer; font-family:inherit; font-size:13px; font-weight:600; color:var(--ink); text-align:left;"
              >
                <Icon name="edit" :size="15" />{{ t('pipelinesUi.menu.edit') }}
              </button>
              <div style="height:1px; background:var(--line-2); margin:4px 6px;"></div>
              <button
                @click="deletePipeline(p.id)"
                style="display:flex; align-items:center; gap:10px; width:100%; padding:8px 10px; border:none; border-radius:8px; background:transparent; cursor:pointer; font-family:inherit; font-size:13px; font-weight:600; color:var(--err); text-align:left;"
              >
                <Icon name="trash" :size="15" />{{ t('pipelinesUi.menu.delete') }}
              </button>
            </div>
          </Teleport>
        </div>
      </div>

      <!-- Expanded: recent runs (full error lives in run.errorMessage) -->
      <div v-if="expandedId === p.id" style="padding:0 20px 16px; border-top:1px dashed var(--line-2); background:var(--inset);">
        <div v-if="runsLoading" style="display:flex; justify-content:center; padding:20px 0;">
          <Spinner :size="18" />
        </div>
        <div v-else-if="runs.length === 0" style="padding:16px 0; font-size:13px; color:var(--ink-3);">{{ t('pipelinesUi.runs.empty') }}</div>
        <div v-else>
          <div style="display:grid; grid-template-columns:.9fr 1fr .8fr 2.5fr; gap:12px; padding:12px 0 6px; font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3);">
            <div>{{ t('pipelinesUi.runs.status') }}</div>
            <div>{{ t('pipelinesUi.runs.started') }}</div>
            <div>{{ t('pipelinesUi.runs.rows') }}</div>
            <div>{{ t('pipelinesUi.runs.error') }}</div>
          </div>
          <div
            v-for="run in runs"
            :key="run.id"
            style="display:grid; grid-template-columns:.9fr 1fr .8fr 2.5fr; gap:12px; align-items:start; padding:8px 0; border-top:1px solid var(--line-2); font-size:12.5px;"
          >
            <div><StatusChip :status="run.status" /></div>
            <div style="color:var(--ink-2);">{{ formatRelative(run.startedAt) }}</div>
            <div style="color:var(--ink-2);">{{ run.rowsLoaded }}</div>
            <div style="min-width:0;">
              <div style="color:var(--err); white-space:pre-line; word-break:break-word;" :title="run.errorMessage">{{ run.errorMessage }}</div>
              <button
                v-if="run.errorMessage"
                :disabled="explaining"
                style="display:inline-flex; align-items:center; gap:6px; margin-top:4px; padding:3px 8px; border:1px solid var(--line); border-radius:7px; background:var(--surface); cursor:pointer; font-family:inherit; font-size:11.5px; font-weight:600; color:var(--ink-2);"
                @click="explainRun(p.id, run.id)"
              >
                <Spinner v-if="explaining && explainingRunId === run.id" :size="11" />
                <Icon v-else name="sparkle" :size="11" />
                {{ t('explainUi.button') }}
              </button>
            </div>
          </div>
        </div>
      </div>
      </template>
    </div>

    <ExplainPanel :open="explainOpen" :result="explainResult" @close="closeExplain" />
  </div>
</template>
