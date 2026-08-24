<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import { ConnectError, Code } from '@connectrpc/connect'
import { transformationClient, assistClient, pipelineClient, boxRepoClient } from '../api'
import { errorMessage } from '../api/errors'
import type { Transformation, TransformationRun } from '../api/gen/transformation_pb.js'
import type { FileEntry } from '../api/gen/boxrepo_pb.js'
import type { DraftFile } from '../api/gen/assist_pb.js'
import type { Pipeline } from '../api/gen/pipeline_pb.js'
import Icon from '../components/ui/Icon.vue'
import StatusChip from '../components/ui/StatusChip.vue'
import Spinner from '../components/ui/Spinner.vue'
import DemoProjectCard from '../components/DemoProjectCard.vue'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import { useCronText } from '../composables/useCronText'
import { useExplain } from '../composables/useExplain'
import ExplainPanel from '../components/ExplainPanel.vue'

const { t } = useI18n()
const toast = useToast()
const { confirm } = useConfirm()

// The hosted dbt project files editor. Lazy so the CodeMirror bundle only loads
// when a user expands the Files panel. Points at the box `transformations` repo
// (shared by all hosted transformations); it self-gates to an "unavailable"
// state on non-VM / hosted-disabled workspaces.
const BoxRepoEditor = defineAsyncComponent(() => import('../components/BoxRepoEditor.vue'))
const filesOpen = ref(false)
// Defensive: the panel is unmounted while the form is open (v-if !formOpen) and
// remounts with a fresh loadFiles(), so this reload() is a no-op today — but it
// keeps the tree fresh if that gating ever changes.
const repoEditorRef = ref<{ reload: () => void } | null>(null)
// Same lazy-load rationale as BoxRepoEditor: keep CodeMirror out of the
// initial bundle until a hosted form actually needs the inline editor.
const SqlEditor = defineAsyncComponent(() => import('../components/sql/SqlEditor.vue'))

function draftDbtFiles(prompt: string, _existingPaths: string[]) {
  return assistClient
    .draftTransformation({ prompt })
    .then((r) => ({ files: r.files, notes: r.notes }))
}

const transformations = ref<Transformation[]>([])
const pipelines = ref<Pipeline[]>([])
const loading = ref(false)
const openMenuId = ref<string | null>(null)
const MENU_WIDTH = 172
const menuPos = ref<{ top: number; left: number }>({ top: 0, left: 0 })

// Expanded row: recent runs fetched lazily per transformation.
const expandedId = ref<string | null>(null)
const runs = ref<TransformationRun[]>([])
const runsLoading = ref(false)

// --- Create/edit form -------------------------------------------------------
const formOpen = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const form = reactive({
  name: '',
  hosted: true,
  repoUrl: '',
  gitCredentials: '',
  repoRef: 'main',
  schedule: '',
  triggerAfterPipelineId: '',
  dbtSelector: '',
})

// --- Inline model editor (1 hosted transformation = 1 model file) -----------
// A hosted transformation owns models/<slug>.sql by convention: create writes
// the file + the config (selector = slug), edit loads config + that file.
// Custom selectors, connected repos and non-VM boxes fall back to config-only.
const modelSql = ref('')
const modelSha = ref('') // '' = new file; blob sha after getFile/putFile
const modelPath = ref('') // resolved path in edit mode (frozen after creation)
const modelFileCommitted = ref(false) // putFile landed but create failed → skip re-put on retry
const modelError = ref('') // inline form error (name collision)
const customSelector = ref(false) // user opted into a free-text selector (config-only)
const repoFiles = ref<FileEntry[]>([])
const boxRepoState = ref<'unknown' | 'ready' | 'unavailable' | 'error'>('unknown')
const modelLoading = ref(false)
// Initial content in edit mode, to skip no-op commits on save.
let modelLoadedContent = ''

const PLAIN_MODEL_SELECTOR = /^[A-Za-z0-9_]+$/

const modelSlug = computed(() =>
  form.name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, ''),
)
const createModelPath = computed(() => `models/${modelSlug.value}.sql`)

// The unified form shows the SQL editor when the transformation really owns a
// single model file: hosted, plain selector, box repo reachable, and (in edit
// mode) exactly one matching file resolved.
const inlineMode = computed(
  () =>
    form.hosted &&
    !customSelector.value &&
    boxRepoState.value === 'ready' &&
    (!editingId.value || modelPath.value !== ''),
)

// The free-text selector input shows whenever the form is config-only:
// connected repos, opted-out custom selectors, and box-repo fallbacks.
const showSelectorInput = computed(
  () =>
    !form.hosted ||
    customSelector.value ||
    boxRepoState.value === 'unavailable' ||
    boxRepoState.value === 'error',
)

// --- Schedule: validated + spelled out (src/lib/cron.ts). An empty schedule
// is fine here — the transformation then runs manually or after a pipeline.
const cronText = useCronText()
const scheduleError = computed(() => cronText.error(form.schedule))
const scheduleHint = computed(() => scheduleError.value || cronText.describe(form.schedule))
const scheduleNextRuns = computed(() =>
  scheduleError.value ? '' : cronText.nextRunsText(form.schedule, 3),
)

const submitDisabled = computed(
  () =>
    !form.name.trim() ||
    saving.value ||
    !!scheduleError.value ||
    (inlineMode.value && (!modelSlug.value || !modelSql.value.trim())),
)

// SQL edited after a partial-failure commit → the retry must re-put (with the
// stored sha of our own commit, never sha:'' again).
watch(modelSql, () => {
  modelFileCommitted.value = false
  modelError.value = ''
})
watch(() => form.name, () => {
  modelError.value = ''
})
// Flipping a connected row to hosted mid-edit has no resolved model file —
// stay config-only (editable selector); also probe if it never ran (edit of a
// connected row skips the probe on open).
watch(
  () => form.hosted,
  (hosted) => {
    if (!hosted) return
    if (editingId.value && !modelPath.value) customSelector.value = true
    if (boxRepoState.value === 'unknown') probeBoxRepo()
  },
)

function modelBasenameMatches(f: FileEntry, name: string): boolean {
  return f.path.startsWith('models/') && f.path.split('/').pop() === `${name}.sql`
}

// Probe the box transformations repo: feeds the availability gate and the
// create-time collision check. Refetched on every form open — never cached.
async function probeBoxRepo() {
  boxRepoState.value = 'unknown'
  try {
    const resp = await boxRepoClient.listFiles({ repo: 'transformations' })
    repoFiles.value = resp.files
    boxRepoState.value = 'ready'
  } catch (err) {
    // FAILED_PRECONDITION = non-VM box / hosted editing disabled / editor
    // credentials not deposited yet (same gate BoxRepoEditor uses).
    if (err instanceof ConnectError && err.code === Code.FailedPrecondition) {
      boxRepoState.value = 'unavailable'
    } else {
      boxRepoState.value = 'error'
    }
  }
}

// --- AI describe panel ------------------------------------------------------
const aiPrompt = ref('')
const drafting = ref(false)
const draftNotes = ref('')
const draftFiles = ref<DraftFile[]>([])

// silent skips the full-section loading state — used by the demo card's
// background poll so a refresh every few seconds doesn't flash the list.
async function loadTransformations(silent = false) {
  if (!silent) loading.value = true
  try {
    const resp = await transformationClient.listTransformations({})
    transformations.value = resp.transformations
  } finally {
    if (!silent) loading.value = false
  }
}

async function loadPipelines() {
  try {
    const resp = await pipelineClient.listPipelines({})
    pipelines.value = resp.pipelines
  } catch {
    // The trigger-after select just stays empty — not fatal for this view.
  }
}

function repoHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

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

// --- Row menu (same teleport pattern as PipelinesView) ----------------------
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
function onDocClick() {
  closeMenus()
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  window.addEventListener('scroll', closeMenus, true)
  window.addEventListener('resize', closeMenus)
  loadTransformations()
  loadPipelines()
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('scroll', closeMenus, true)
  window.removeEventListener('resize', closeMenus)
})

// AI "Explain" on a failed run: ids only leave the browser; the server
// assembles the trusted context (config, failed dbt nodes, error) itself.
const { open: explainOpen, loading: explaining, result: explainResult, explain, close: closeExplain } = useExplain()
const explainingRunId = ref('')

async function explainRun(transformationId: string, runId: string) {
  explainingRunId.value = runId
  try {
    await explain({ case: 'transformationRun', value: { transformationId, runId } })
  } finally {
    explainingRunId.value = ''
  }
}

async function toggleRuns(id: string) {
  if (expandedId.value === id) {
    expandedId.value = null
    return
  }
  expandedId.value = id
  runs.value = []
  runsLoading.value = true
  try {
    const resp = await transformationClient.getTransformation({ id })
    runs.value = resp.recentRuns
  } catch (err) {
    toast.error(errorMessage(err, t('transformationsUi.toast.loadRunsFailed')))
  } finally {
    runsLoading.value = false
  }
}

async function triggerNow(id: string) {
  closeMenus()
  try {
    await transformationClient.triggerTransformation({ id })
    toast.success(t('transformationsUi.toast.triggered'))
  } catch (err) {
    toast.error(errorMessage(err, t('transformationsUi.toast.triggerFailed')))
  }
}

async function toggleEnabled(tr: Transformation) {
  closeMenus()
  try {
    // Update requires the full field set; git_credentials "" = keep existing.
    await transformationClient.updateTransformation({
      id: tr.id,
      name: tr.name,
      repoUrl: tr.repoUrl,
      repoRef: tr.repoRef,
      gitCredentials: '',
      schedule: tr.schedule,
      triggerAfterPipelineId: tr.triggerAfterPipelineId,
      dbtSelector: tr.dbtSelector,
      enabled: !tr.enabled,
    })
    await loadTransformations()
  } catch (err) {
    toast.error(errorMessage(err, t('transformationsUi.toast.updateFailed')))
  }
}

function resetModelState() {
  modelSql.value = ''
  modelSha.value = ''
  modelPath.value = ''
  modelFileCommitted.value = false
  modelError.value = ''
  customSelector.value = false
  modelLoadedContent = ''
}

function startCreate() {
  editingId.value = null
  form.name = ''
  form.hosted = true
  form.repoUrl = ''
  form.gitCredentials = ''
  form.repoRef = 'main'
  form.schedule = ''
  form.triggerAfterPipelineId = ''
  form.dbtSelector = ''
  draftNotes.value = ''
  draftFiles.value = []
  aiPrompt.value = ''
  resetModelState()
  formOpen.value = true
  probeBoxRepo()
}

function startEdit(tr: Transformation) {
  closeMenus()
  editingId.value = tr.id
  form.name = tr.name
  form.hosted = !tr.repoUrl
  form.repoUrl = tr.repoUrl
  form.gitCredentials = ''
  form.repoRef = tr.repoRef || 'main'
  form.schedule = tr.schedule
  form.triggerAfterPipelineId = tr.triggerAfterPipelineId
  form.dbtSelector = tr.dbtSelector
  draftNotes.value = ''
  draftFiles.value = []
  resetModelState()
  formOpen.value = true
  // Connected repos and custom selectors have no single model file — stay
  // config-only. A plain selector resolves to models/**/<selector>.sql.
  if (!tr.repoUrl && PLAIN_MODEL_SELECTOR.test(tr.dbtSelector)) {
    loadModelForEdit(tr.dbtSelector)
  } else if (!tr.repoUrl) {
    customSelector.value = true
  }
}

async function loadModelForEdit(selector: string) {
  modelLoading.value = true
  try {
    await probeBoxRepo()
    if (boxRepoState.value !== 'ready') return
    // Match on the literal selector string (externally-created selectors may
    // differ from the name slug). 0 or ≥2 matches → config-only fallback.
    const matches = repoFiles.value.filter((f) => modelBasenameMatches(f, selector))
    if (matches.length !== 1) {
      customSelector.value = true
      return
    }
    const path = matches[0]!.path
    const resp = await boxRepoClient.getFile({ repo: 'transformations', path })
    modelSql.value = resp.content
    modelSha.value = resp.sha
    modelPath.value = path
    modelLoadedContent = resp.content
    modelFileCommitted.value = false
  } catch {
    customSelector.value = true
    toast.info(t('transformationsUi.toast.modelLoadFailed'))
  } finally {
    modelLoading.value = false
  }
}

// Conflict recovery in edit mode: re-fetch the repo version of the model.
async function reloadModelFromRepo() {
  if (!modelPath.value) return
  if (modelSql.value !== modelLoadedContent) {
    const ok = await confirm({
      title: t('transformationsUi.editor.reloadConfirm.title'),
      body: t('transformationsUi.editor.reloadConfirm.body'),
      confirmLabel: t('transformationsUi.editor.reloadConfirm.confirm'),
    })
    if (!ok) return
  }
  modelLoading.value = true
  try {
    const resp = await boxRepoClient.getFile({ repo: 'transformations', path: modelPath.value })
    modelSql.value = resp.content
    modelSha.value = resp.sha
    modelLoadedContent = resp.content
  } catch (err) {
    toast.error(errorMessage(err, t('transformationsUi.editor.toast.openFailed')))
  } finally {
    modelLoading.value = false
  }
}

// Commit the model file for the transformation being saved. Returns false when
// the file write failed (config write must not proceed). File first, config
// second: a stale-sha conflict has to block the config update.
async function commitModelFile(path: string, message: string, creating: boolean): Promise<boolean> {
  try {
    const put = await boxRepoClient.putFile({
      repo: 'transformations',
      path,
      content: modelSql.value,
      sha: modelSha.value,
      message,
    })
    modelSha.value = put.sha
    modelFileCommitted.value = true
    modelLoadedContent = modelSql.value
    return true
  } catch (err) {
    if (err instanceof ConnectError && err.code === Code.Aborted) {
      if (creating) {
        // sha:'' aborted — the file appeared between the probe and the save.
        modelError.value = t('transformationsUi.form.modelExists')
      } else {
        toast.error(t('transformationsUi.editor.toast.conflict'))
      }
    } else {
      toast.error(errorMessage(err, t('transformationsUi.toast.fileWriteFailed')))
    }
    return false
  }
}

async function submitForm() {
  if (saving.value) return
  if (scheduleError.value) return
  if (inlineMode.value && (!modelSlug.value || !modelSql.value.trim())) return
  modelError.value = ''
  saving.value = true
  try {
    if (editingId.value) {
      const existing = transformations.value.find((x) => x.id === editingId.value)
      // The model file and selector are frozen after creation (no rename RPC
      // on the box repo) — always send back the existing selector.
      if (inlineMode.value && modelSql.value !== modelLoadedContent) {
        const ok = await commitModelFile(modelPath.value, 'Update model (Console)', false)
        if (!ok) return
      }
      await transformationClient.updateTransformation({
        id: editingId.value,
        name: form.name,
        repoUrl: form.hosted ? '' : form.repoUrl,
        repoRef: form.repoRef,
        gitCredentials: form.hosted ? '' : form.gitCredentials,
        schedule: form.schedule,
        triggerAfterPipelineId: form.triggerAfterPipelineId,
        dbtSelector: inlineMode.value && existing ? existing.dbtSelector : form.dbtSelector,
        enabled: existing?.enabled ?? true,
      })
      toast.success(t('transformationsUi.toast.updated'))
    } else {
      if (inlineMode.value) {
        // Preflight name collision against the probed tree; the putFile
        // sha:'' ABORT is the backstop for files added since the probe.
        if (
          !modelFileCommitted.value &&
          repoFiles.value.some((f) => modelBasenameMatches(f, modelSlug.value))
        ) {
          modelError.value = t('transformationsUi.form.modelExists')
          return
        }
        // Skip the re-put when a previous attempt already committed this
        // exact content and only createTransformation failed.
        if (!modelFileCommitted.value) {
          const ok = await commitModelFile(
            createModelPath.value,
            `Add model ${modelSlug.value} (Console)`,
            true,
          )
          if (!ok) return
        }
      }
      await transformationClient.createTransformation({
        name: form.name,
        repoUrl: form.hosted ? '' : form.repoUrl,
        repoRef: form.repoRef,
        gitCredentials: form.hosted ? '' : form.gitCredentials,
        schedule: form.schedule,
        triggerAfterPipelineId: form.triggerAfterPipelineId,
        dbtSelector: inlineMode.value ? modelSlug.value : form.dbtSelector,
      })
      toast.success(t('transformationsUi.toast.created'))
    }
    formOpen.value = false
    await loadTransformations()
    repoEditorRef.value?.reload()
  } catch (err) {
    if (!editingId.value && inlineMode.value && modelFileCommitted.value) {
      // The model file is already committed — keep that context and append
      // the server's reason for the failed create.
      const reason = errorMessage(err, '')
      toast.error(
        t('transformationsUi.toast.fileSavedCreateFailed') + (reason ? ` (${reason})` : ''),
      )
    } else {
      toast.error(errorMessage(err, t('transformationsUi.toast.saveFailed')))
    }
  } finally {
    saving.value = false
  }
}

async function deleteTransformation(id: string) {
  closeMenus()
  const ok = await confirm({
    title: t('transformationsUi.deleteConfirm.title'),
    body: t('transformationsUi.deleteConfirm.body'),
    confirmLabel: t('transformationsUi.deleteConfirm.confirm'),
    danger: true,
  })
  if (!ok) return
  try {
    await transformationClient.deleteTransformation({ id })
    await loadTransformations()
    toast.success(t('transformationsUi.toast.deleted'))
  } catch (err) {
    toast.error(errorMessage(err, t('transformationsUi.toast.deleteFailed')))
  }
}

async function draftWithAI() {
  const prompt = aiPrompt.value.trim()
  if (!prompt || drafting.value) return
  drafting.value = true
  try {
    const resp = await assistClient.draftTransformation({ prompt })
    if (resp.draft) {
      form.name = resp.draft.name
      form.hosted = true
      form.repoUrl = ''
      form.gitCredentials = ''
      form.schedule = resp.draft.schedule
      form.dbtSelector = resp.draft.dbtSelector
    }
    draftNotes.value = resp.notes
    // In inline mode the primary drafted model flows straight into the SQL
    // editor (saved with the transformation as models/<slug>.sql — the slug
    // derives from the drafted name, so the draft file's own path is ignored).
    // Supporting files stay as read-only copy cards. On non-VM boxes
    // everything stays read-only, as before.
    let files = resp.files
    if (boxRepoState.value === 'ready' && !customSelector.value) {
      const selector = resp.draft?.dbtSelector ?? ''
      const primary =
        files.find((f) => f.path.endsWith('.sql') && f.path.split('/').pop() === `${selector}.sql`) ??
        files.find((f) => f.path.endsWith('.sql'))
      if (primary) {
        modelSql.value = primary.content
        modelSha.value = ''
        modelFileCommitted.value = false
        files = files.filter((f) => f !== primary)
      }
    }
    draftFiles.value = files
  } catch (err) {
    // Server without an LLM key returns UNIMPLEMENTED — soft "coming soon"
    // hint, manual path stays available (same pattern as the pipeline wizard).
    if (err instanceof ConnectError && err.code === Code.Unimplemented) {
      toast.info(t('transformationsUi.ai.notConfigured'))
    } else if (err instanceof ConnectError && err.code === Code.ResourceExhausted) {
      toast.info(t('transformationsUi.ai.rateLimited'))
    } else {
      toast.error(errorMessage(err, t('transformationsUi.ai.draftFailed')))
    }
  } finally {
    drafting.value = false
  }
}

async function copyFile(f: DraftFile) {
  try {
    await navigator.clipboard.writeText(f.content)
    toast.success(t('transformationsUi.ai.copied'))
  } catch {
    toast.error(t('transformationsUi.ai.copyFailed'))
  }
}
</script>

<template>
  <div style="max-width:1080px; margin:0 auto; padding:34px 34px 80px;">
    <div style="display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:22px;">
      <div>
        <h1 style="margin:0 0 5px; font-size:25px; font-weight:700; letter-spacing:-.02em;">{{ t('transformationsUi.heading') }}</h1>
        <div style="font-size:13.5px; color:var(--ink-2);">{{ t('transformationsUi.subtitle') }}</div>
      </div>
      <button
        v-if="!loading && !formOpen && transformations.length > 0"
        @click="startCreate"
        style="display:flex; align-items:center; gap:8px; height:40px; padding:0 16px; border:none; border-radius:11px; background:var(--accent); color:var(--accent-ink); font-family:inherit; font-size:14px; font-weight:600; cursor:pointer; box-shadow:var(--shadow); flex:none;"
      >
        <Icon name="plus" :size="16" />{{ t('transformationsUi.new') }}
      </button>
    </div>

    <!-- Create/edit form -->
    <div
      v-if="formOpen"
      style="background:var(--surface); border:1px solid var(--line); border-radius:18px; box-shadow:var(--shadow); padding:26px; margin-bottom:22px;"
    >
      <h2 style="margin:0 0 16px; font-size:18px; font-weight:700; letter-spacing:-.01em;">
        {{ editingId ? t('transformationsUi.form.editTitle') : t('transformationsUi.form.createTitle') }}
      </h2>

      <!-- AI describe panel (create only — a draft would clobber an edit) -->
      <div
        v-if="!editingId"
        style="border:1px solid var(--line); border-radius:14px; background:var(--surface-2); padding:16px 18px; margin-bottom:20px;"
      >
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
          <div style="width:30px; height:30px; border-radius:9px; background:var(--clay-soft); color:var(--clay); display:flex; align-items:center; justify-content:center; flex:none;">
            <Icon name="sparkle" :size="16" />
          </div>
          <div>
            <div style="font-size:14px; font-weight:700;">{{ t('transformationsUi.ai.title') }}</div>
            <div style="font-size:12.5px; color:var(--ink-2);">{{ t('transformationsUi.ai.subtitle') }}</div>
          </div>
        </div>
        <textarea
          v-model="aiPrompt"
          rows="2"
          :placeholder="t('transformationsUi.ai.placeholder')"
          style="width:100%; padding:12px 13px; border:1px solid var(--line); border-radius:11px; background:var(--surface); color:var(--ink); font-family:inherit; font-size:14px; line-height:1.5; resize:vertical; outline:none;"
        ></textarea>
        <div style="display:flex; justify-content:flex-end; margin-top:10px;">
          <button
            @click="draftWithAI"
            :disabled="!aiPrompt.trim() || drafting"
            :style="{
              display: 'flex', alignItems: 'center', gap: '8px', height: '38px', padding: '0 16px',
              border: 'none', borderRadius: '10px', background: 'var(--clay)', color: '#fff',
              fontFamily: 'inherit', fontSize: '13.5px', fontWeight: 600,
              opacity: (!aiPrompt.trim() || drafting) ? 0.5 : 1,
              cursor: (!aiPrompt.trim() || drafting) ? 'not-allowed' : 'pointer',
            }"
          >
            <Spinner v-if="drafting" :size="15" />
            <Icon v-else name="sparkle" :size="15" />{{ t('transformationsUi.ai.draft') }}
          </button>
        </div>

        <!-- Draft notes + generated files -->
        <div
          v-if="draftNotes"
          style="display:flex; align-items:flex-start; gap:10px; background:var(--inset); border:1px solid var(--line); border-radius:11px; padding:12px 14px; margin-top:12px;"
        >
          <Icon name="info" :size="16" :style="{ color: 'var(--ink-3)', flex: 'none', marginTop: '1px' }" />
          <div style="font-size:13px; color:var(--ink-2); line-height:1.5;">{{ draftNotes }}</div>
        </div>
        <div v-if="draftFiles.length" style="margin-top:12px;">
          <div style="font-size:12px; font-weight:700; letter-spacing:.03em; text-transform:uppercase; color:var(--ink-3); margin-bottom:8px;">
            {{ t('transformationsUi.ai.filesTitle') }}
          </div>
          <div
            v-for="f in draftFiles"
            :key="f.path"
            style="border:1px solid var(--line); border-radius:11px; overflow:hidden; margin-bottom:10px; background:var(--surface);"
          >
            <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border-bottom:1px solid var(--line-2);">
              <span style="font-family:'JetBrains Mono',monospace; font-size:12px; color:var(--ink-2);">{{ f.path }}</span>
              <button
                @click="copyFile(f)"
                style="display:flex; align-items:center; gap:6px; border:none; background:transparent; color:var(--accent); font-family:inherit; font-size:12px; font-weight:700; cursor:pointer;"
              >
                <Icon name="copy" :size="13" />{{ t('transformationsUi.ai.copy') }}
              </button>
            </div>
            <pre style="margin:0; padding:12px; font-family:'JetBrains Mono',monospace; font-size:12px; line-height:1.5; color:var(--ink); overflow-x:auto; max-height:220px;">{{ f.content }}</pre>
          </div>
          <div style="font-size:12.5px; color:var(--ink-3); line-height:1.5;">{{ t('transformationsUi.ai.filesHint') }}</div>
        </div>
      </div>

      <!-- Fields -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <label style="display:block;">
          <span style="display:block; font-size:12.5px; font-weight:700; color:var(--ink-2); margin-bottom:6px;">{{ t('transformationsUi.form.name') }}</span>
          <input v-model="form.name" type="text" style="width:100%; height:40px; padding:0 13px; border:1px solid var(--line); border-radius:11px; background:var(--surface-2); color:var(--ink); font-family:inherit; font-size:14px; outline:none;" />
        </label>
        <label style="display:block;">
          <span style="display:block; font-size:12.5px; font-weight:700; color:var(--ink-2); margin-bottom:6px;">{{ t('transformationsUi.form.schedule') }}</span>
          <input
            v-model="form.schedule"
            type="text"
            :placeholder="t('transformationsUi.form.schedulePlaceholder')"
            :style="{
              width: '100%', height: '40px', padding: '0 13px', borderRadius: '11px',
              border: `1px solid ${scheduleError ? 'var(--err)' : 'var(--line)'}`,
              background: 'var(--surface-2)', color: 'var(--ink)',
              fontFamily: `'JetBrains Mono',monospace`, fontSize: '13px', outline: 'none',
            }"
          />
          <span
            v-if="scheduleHint"
            :style="{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '12px', color: scheduleError ? 'var(--err)' : 'var(--ink-3)' }"
          >
            <Icon :name="scheduleError ? 'danger' : 'clock'" :size="13" :style="{ flexShrink: 0 }" />{{ scheduleHint }}
          </span>
          <span v-if="scheduleNextRuns" style="display:block; margin-top:4px; font-size:11.5px; color:var(--ink-3);">{{ scheduleNextRuns }}</span>
        </label>
      </div>

      <!-- Repo mode -->
      <div style="margin-top:16px;">
        <span style="display:block; font-size:12.5px; font-weight:700; color:var(--ink-2); margin-bottom:6px;">{{ t('transformationsUi.form.repo') }}</span>
        <div style="display:flex; gap:8px;">
          <button
            @click="form.hosted = true"
            :style="{
              flex: '1', height: '40px', border: '1px solid var(--line)', borderRadius: '11px', fontFamily: 'inherit',
              fontSize: '13.5px', fontWeight: 600, cursor: 'pointer',
              background: form.hosted ? 'var(--accent-soft)' : 'var(--surface-2)',
              color: form.hosted ? 'var(--accent-soft-ink)' : 'var(--ink-2)',
            }"
          >{{ t('transformationsUi.form.hosted') }}</button>
          <button
            @click="form.hosted = false"
            :style="{
              flex: '1', height: '40px', border: '1px solid var(--line)', borderRadius: '11px', fontFamily: 'inherit',
              fontSize: '13.5px', fontWeight: 600, cursor: 'pointer',
              background: !form.hosted ? 'var(--accent-soft)' : 'var(--surface-2)',
              color: !form.hosted ? 'var(--accent-soft-ink)' : 'var(--ink-2)',
            }"
          >{{ t('transformationsUi.form.connected') }}</button>
        </div>
        <div v-if="form.hosted" style="font-size:12.5px; color:var(--ink-3); margin-top:7px; line-height:1.5;">{{ t('transformationsUi.form.hostedHint') }}</div>
      </div>

      <div v-if="!form.hosted" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:14px;">
        <label style="display:block;">
          <span style="display:block; font-size:12.5px; font-weight:700; color:var(--ink-2); margin-bottom:6px;">{{ t('transformationsUi.form.repoUrl') }}</span>
          <input v-model="form.repoUrl" type="text" placeholder="https://github.com/acme/dbt.git" style="width:100%; height:40px; padding:0 13px; border:1px solid var(--line); border-radius:11px; background:var(--surface-2); color:var(--ink); font-family:'JetBrains Mono',monospace; font-size:13px; outline:none;" />
        </label>
        <label style="display:block;">
          <span style="display:block; font-size:12.5px; font-weight:700; color:var(--ink-2); margin-bottom:6px;">{{ t('transformationsUi.form.gitCredentials') }}</span>
          <input v-model="form.gitCredentials" type="text" :placeholder="editingId ? t('transformationsUi.form.gitCredentialsKeep') : '{&quot;username&quot;:&quot;...&quot;,&quot;token&quot;:&quot;...&quot;}'" style="width:100%; height:40px; padding:0 13px; border:1px solid var(--line); border-radius:11px; background:var(--surface-2); color:var(--ink); font-family:'JetBrains Mono',monospace; font-size:13px; outline:none;" />
          <span style="display:block; font-size:11.5px; color:var(--ink-3); margin-top:5px;">{{ t('transformationsUi.form.gitCredentialsHint') }}</span>
        </label>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; margin-top:14px;">
        <label style="display:block;">
          <span style="display:block; font-size:12.5px; font-weight:700; color:var(--ink-2); margin-bottom:6px;">{{ t('transformationsUi.form.repoRef') }}</span>
          <input v-model="form.repoRef" type="text" style="width:100%; height:40px; padding:0 13px; border:1px solid var(--line); border-radius:11px; background:var(--surface-2); color:var(--ink); font-family:'JetBrains Mono',monospace; font-size:13px; outline:none;" />
        </label>
        <label style="display:block;">
          <span style="display:block; font-size:12.5px; font-weight:700; color:var(--ink-2); margin-bottom:6px;">{{ t('transformationsUi.form.triggerAfter') }}</span>
          <select v-model="form.triggerAfterPipelineId" style="width:100%; height:40px; padding:0 10px; border:1px solid var(--line); border-radius:11px; background:var(--surface-2); color:var(--ink); font-family:inherit; font-size:13.5px; outline:none;">
            <option value="">{{ t('transformationsUi.form.triggerAfterNone') }}</option>
            <option v-for="p in pipelines" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label v-if="showSelectorInput" style="display:block;">
          <span style="display:block; font-size:12.5px; font-weight:700; color:var(--ink-2); margin-bottom:6px;">{{ t('transformationsUi.form.dbtSelector') }}</span>
          <input v-model="form.dbtSelector" type="text" placeholder="tag:daily" style="width:100%; height:40px; padding:0 13px; border:1px solid var(--line); border-radius:11px; background:var(--surface-2); color:var(--ink); font-family:'JetBrains Mono',monospace; font-size:13px; outline:none;" />
          <span v-if="form.hosted" style="display:block; font-size:11.5px; color:var(--ink-3); margin-top:5px;">
            {{ editingId ? t('transformationsUi.form.configOnlyHint') : t('transformationsUi.form.customSelectorHint') }}
          </span>
        </label>
      </div>

      <!-- Box repo unreachable: hosted transformations fall back to the
           config-only form (selector input above). -->
      <div
        v-if="form.hosted && !customSelector && (boxRepoState === 'unavailable' || boxRepoState === 'error')"
        style="display:flex; align-items:flex-start; gap:10px; background:var(--inset); border:1px solid var(--line); border-radius:11px; padding:12px 14px; margin-top:14px;"
      >
        <Icon name="info" :size="16" :style="{ color: 'var(--ink-3)', flex: 'none', marginTop: '1px' }" />
        <div style="font-size:13px; color:var(--ink-2); line-height:1.5;">
          {{ boxRepoState === 'unavailable' ? t('transformationsUi.form.editorUnavailable') : t('transformationsUi.editor.error.title') }}
          <button
            v-if="boxRepoState === 'error'"
            @click="probeBoxRepo"
            style="border:none; background:transparent; color:var(--accent); font-family:inherit; font-size:13px; font-weight:700; cursor:pointer; padding:0; margin-left:6px;"
          >{{ t('transformationsUi.editor.retry') }}</button>
        </div>
      </div>

      <!-- Inline model editor: the transformation's own models/<slug>.sql -->
      <div v-if="form.hosted && !customSelector && boxRepoState !== 'unavailable' && boxRepoState !== 'error'" style="margin-top:16px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:6px;">
          <span style="font-size:12.5px; font-weight:700; color:var(--ink-2);">{{ t('transformationsUi.form.modelSqlLabel') }}</span>
          <span style="font-family:'JetBrains Mono',monospace; font-size:12px; color:var(--ink-3);">{{ editingId ? modelPath : (modelSlug ? createModelPath : '') }}</span>
        </div>
        <div v-if="boxRepoState === 'unknown' || modelLoading" style="display:flex; align-items:center; justify-content:center; height:120px; border:1px solid var(--line); border-radius:11px;">
          <Spinner :size="18" />
        </div>
        <template v-else>
          <div style="height:260px; border:1px solid var(--line); border-radius:11px; overflow:hidden; background:var(--surface);">
            <SqlEditor v-model="modelSql" :schema="{}" :placeholder-text="t('transformationsUi.form.sqlPlaceholder')" />
          </div>
          <div v-if="modelError" style="font-size:12.5px; color:var(--err); margin-top:7px;">{{ modelError }}</div>
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:7px;">
            <span style="font-size:11.5px; color:var(--ink-3); line-height:1.5;">
              {{ editingId ? t('transformationsUi.form.modelPathFixed') : t('transformationsUi.editor.editor.hint') }}
            </span>
            <button
              v-if="editingId"
              @click="reloadModelFromRepo"
              style="border:none; background:transparent; color:var(--accent); font-family:inherit; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap;"
            >{{ t('transformationsUi.form.reloadModel') }}</button>
            <button
              v-else
              @click="customSelector = true"
              style="border:none; background:transparent; color:var(--ink-3); font-family:inherit; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap;"
            >{{ t('transformationsUi.form.customSelectorToggle') }}</button>
          </div>
        </template>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:22px;">
        <button
          @click="formOpen = false"
          style="border:none; background:transparent; color:var(--ink-2); font-family:inherit; font-size:13px; font-weight:700; cursor:pointer;"
        >{{ t('transformationsUi.form.cancel') }}</button>
        <button
          @click="submitForm"
          :disabled="submitDisabled"
          :style="{
            display: 'flex', alignItems: 'center', gap: '8px', height: '42px', padding: '0 20px',
            border: 'none', borderRadius: '11px', background: 'var(--accent)', color: 'var(--accent-ink)',
            fontFamily: 'inherit', fontSize: '14px', fontWeight: 600, boxShadow: 'var(--shadow)',
            opacity: submitDisabled ? 0.5 : 1,
            cursor: submitDisabled ? 'not-allowed' : 'pointer',
          }"
        >
          <Spinner v-if="saving" :size="16" />
          {{ editingId ? t('transformationsUi.form.save') : t('transformationsUi.form.create') }}
        </button>
      </div>
    </div>

    <!-- Hosted dbt project files editor (workspace-level: one repo shared by
         all hosted transformations). Collapsed by default. -->
    <div
      v-if="!loading && !formOpen"
      style="background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); overflow:hidden; margin-bottom:22px;"
    >
      <button
        @click="filesOpen = !filesOpen"
        style="display:flex; align-items:center; gap:14px; width:100%; padding:18px 22px; border:none; background:transparent; cursor:pointer; text-align:left;"
      >
        <div style="width:34px; height:34px; border-radius:10px; background:var(--info-soft); color:var(--info-ink); display:flex; align-items:center; justify-content:center; flex:none;">
          <Icon name="file" :size="18" />
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:15px; font-weight:700; letter-spacing:-.01em;">{{ t('transformationsUi.filesSection.title') }}</div>
          <div style="font-size:12.5px; color:var(--ink-2); line-height:1.5;">{{ t('transformationsUi.filesSection.subtitle') }}</div>
        </div>
        <Icon name="chevronDown" :size="18" :style="{ color: 'var(--ink-3)', flex: 'none', transform: filesOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }" />
      </button>
      <div v-if="filesOpen" style="padding:0 22px 22px;">
        <BoxRepoEditor
          ref="repoEditorRef"
          repo="transformations"
          t-prefix="transformationsUi.editor"
          :new-file-roots="['models/', 'macros/', 'seeds/', 'tests/']"
          new-file-placeholder="models/marts/revenue.sql"
          :ai-draft="draftDbtFiles"
        />
      </div>
    </div>

    <!-- Starter demo (Load when empty / Remove when loaded) -->
    <DemoProjectCard v-if="!loading && !formOpen" :workspace-empty="transformations.length === 0" @changed="() => loadTransformations(true)" />

    <!-- Loading -->
    <div v-if="loading" style="display:flex; align-items:center; justify-content:center; padding:60px 0;">
      <Spinner />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="transformations.length === 0 && !formOpen"
      style="background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); padding:48px 34px; text-align:center;"
    >
      <div style="width:48px; height:48px; margin:0 auto 16px; border-radius:13px; background:var(--accent-soft); color:var(--accent-soft-ink); display:flex; align-items:center; justify-content:center;">
        <Icon name="refresh" :size="24" />
      </div>
      <h2 style="margin:0 0 6px; font-size:18px; font-weight:700; letter-spacing:-.01em;">{{ t('transformationsUi.empty.title') }}</h2>
      <div style="font-size:13.5px; color:var(--ink-2); max-width:440px; margin:0 auto 22px; line-height:1.55;">{{ t('transformationsUi.empty.body') }}</div>
      <button
        @click="startCreate"
        style="display:inline-flex; align-items:center; gap:8px; height:42px; padding:0 20px; border:none; border-radius:11px; background:var(--accent); color:var(--accent-ink); font-family:inherit; font-size:14px; font-weight:600; cursor:pointer; box-shadow:var(--shadow);"
      >
        <Icon name="plus" :size="16" />{{ t('transformationsUi.empty.cta') }}
      </button>
    </div>

    <!-- Table -->
    <div
      v-else-if="transformations.length > 0"
      style="background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); overflow:hidden;"
    >
      <div style="display:grid; grid-template-columns:1.7fr 1.1fr .9fr .8fr 1fr 40px; gap:14px; padding:11px 20px; border-bottom:1px solid var(--line); font-size:11.5px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3);">
        <div>{{ t('transformationsUi.cols.transformation') }}</div>
        <div>{{ t('transformationsUi.cols.repo') }}</div>
        <div>{{ t('transformationsUi.cols.schedule') }}</div>
        <div>{{ t('transformationsUi.cols.state') }}</div>
        <div>{{ t('transformationsUi.cols.lastRun') }}</div>
        <div></div>
      </div>

      <template v-for="tr in transformations" :key="tr.id">
        <div
          style="display:grid; grid-template-columns:1.7fr 1.1fr .9fr .8fr 1fr 40px; gap:14px; align-items:center; padding:14px 20px; border-top:1px solid var(--line-2); cursor:pointer;"
          @click="toggleRuns(tr.id)"
        >
          <!-- Name + ref -->
          <div style="display:flex; align-items:center; gap:11px; min-width:0;">
            <div style="width:32px; height:32px; border-radius:9px; border:1px solid var(--line); background:var(--info-soft); color:var(--info-ink); display:flex; align-items:center; justify-content:center; flex:none; font-size:10px; font-weight:700; letter-spacing:.03em;">DBT</div>
            <div style="min-width:0;">
              <div style="font-weight:600; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ tr.name }}</div>
              <div style="font-size:11.5px; color:var(--ink-3); font-family:'JetBrains Mono',monospace;">{{ tr.repoRef || 'main' }}<template v-if="tr.dbtSelector"> · {{ tr.dbtSelector }}</template></div>
            </div>
          </div>

          <!-- Repo -->
          <div style="min-width:0;">
            <span
              v-if="!tr.repoUrl"
              style="display:inline-block; padding:3px 10px; border-radius:20px; background:var(--accent-soft); color:var(--accent-soft-ink); font-size:11.5px; font-weight:700;"
            >{{ t('transformationsUi.hosted') }}</span>
            <span v-else style="font-family:'JetBrains Mono',monospace; font-size:12.5px; color:var(--ink-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:block;">{{ repoHost(tr.repoUrl) }}</span>
          </div>

          <!-- Schedule -->
          <div
            :title="cronText.error(tr.schedule) || cronText.describe(tr.schedule) || tr.schedule"
            style="font-size:13px; color:var(--ink-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"
          >{{ cronText.summarize(tr.schedule) || t('transformationsUi.manualOnly') }}</div>

          <!-- State -->
          <div>
            <StatusChip
              :status="tr.enabled ? 'active' : 'off'"
              :label="tr.enabled ? t('transformationsUi.state.on') : t('transformationsUi.state.paused')"
            />
          </div>

          <!-- Last run -->
          <div v-if="tr.lastRunStatus" style="display:flex; align-items:center; gap:8px; min-width:0;">
            <StatusChip :status="tr.lastRunStatus" />
            <span v-if="tr.lastRunAt" style="font-size:12px; color:var(--ink-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ formatRelative(tr.lastRunAt) }}</span>
          </div>
          <div v-else style="display:flex; align-items:center; gap:7px;">
            <span style="width:8px; height:8px; border-radius:50%; flex:none; background:var(--ink-3);"></span>
            <span style="font-size:12.5px; color:var(--ink-3);">{{ t('transformationsUi.neverRun') }}</span>
          </div>

          <!-- Row menu -->
          <div style="position:relative; display:flex; justify-content:flex-end;" @click.stop>
            <button
              @click="toggleMenu(tr.id, $event)"
              style="width:30px; height:30px; border:none; background:transparent; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--ink-3);"
            >
              <Icon name="dots" :size="16" />
            </button>
            <Teleport to="body">
              <div
                v-if="openMenuId === tr.id"
                :style="{ position:'fixed', top: menuPos.top + 'px', left: menuPos.left + 'px', zIndex:60, width: MENU_WIDTH + 'px', background:'var(--surface)', border:'1px solid var(--line)', borderRadius:'12px', boxShadow:'var(--shadow-lg)', padding:'5px' }"
                @click.stop
              >
                <button
                  @click="triggerNow(tr.id)"
                  style="display:flex; align-items:center; gap:10px; width:100%; padding:8px 10px; border:none; border-radius:8px; background:transparent; cursor:pointer; font-family:inherit; font-size:13px; font-weight:600; color:var(--ink); text-align:left;"
                >
                  <Icon name="play" :size="15" />{{ t('transformationsUi.menu.runNow') }}
                </button>
                <button
                  @click="toggleEnabled(tr)"
                  style="display:flex; align-items:center; gap:10px; width:100%; padding:8px 10px; border:none; border-radius:8px; background:transparent; cursor:pointer; font-family:inherit; font-size:13px; font-weight:600; color:var(--ink); text-align:left;"
                >
                  <Icon :name="tr.enabled ? 'x' : 'check'" :size="15" />{{ tr.enabled ? t('transformationsUi.menu.disable') : t('transformationsUi.menu.enable') }}
                </button>
                <button
                  @click="startEdit(tr)"
                  style="display:flex; align-items:center; gap:10px; width:100%; padding:8px 10px; border:none; border-radius:8px; background:transparent; cursor:pointer; font-family:inherit; font-size:13px; font-weight:600; color:var(--ink); text-align:left;"
                >
                  <Icon name="edit" :size="15" />{{ t('transformationsUi.menu.edit') }}
                </button>
                <div style="height:1px; background:var(--line-2); margin:4px 6px;"></div>
                <button
                  @click="deleteTransformation(tr.id)"
                  style="display:flex; align-items:center; gap:10px; width:100%; padding:8px 10px; border:none; border-radius:8px; background:transparent; cursor:pointer; font-family:inherit; font-size:13px; font-weight:600; color:var(--err); text-align:left;"
                >
                  <Icon name="trash" :size="15" />{{ t('transformationsUi.menu.delete') }}
                </button>
              </div>
            </Teleport>
          </div>
        </div>

        <!-- Expanded: recent runs -->
        <div v-if="expandedId === tr.id" style="padding:0 20px 16px; border-top:1px dashed var(--line-2); background:var(--inset);">
          <div v-if="runsLoading" style="display:flex; justify-content:center; padding:20px 0;">
            <Spinner :size="18" />
          </div>
          <div v-else-if="runs.length === 0" style="padding:16px 0; font-size:13px; color:var(--ink-3);">{{ t('transformationsUi.runs.empty') }}</div>
          <div v-else>
            <div style="display:grid; grid-template-columns:.9fr 1fr 1fr 1fr 2fr; gap:12px; padding:12px 0 6px; font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3);">
              <div>{{ t('transformationsUi.runs.status') }}</div>
              <div>{{ t('transformationsUi.runs.started') }}</div>
              <div>{{ t('transformationsUi.runs.commit') }}</div>
              <div>{{ t('transformationsUi.runs.models') }}</div>
              <div>{{ t('transformationsUi.runs.error') }}</div>
            </div>
            <div
              v-for="run in runs"
              :key="run.id"
              style="display:grid; grid-template-columns:.9fr 1fr 1fr 1fr 2fr; gap:12px; align-items:center; padding:8px 0; border-top:1px solid var(--line-2); font-size:12.5px;"
            >
              <div><StatusChip :status="run.status" /></div>
              <div style="color:var(--ink-2);">{{ formatRelative(run.startedAt) }}</div>
              <div style="font-family:'JetBrains Mono',monospace; color:var(--ink-3);">{{ run.commitSha.slice(0, 8) }}</div>
              <div style="color:var(--ink-2);">
                {{ t('transformationsUi.runs.modelsCount', { total: run.modelsTotal, failed: run.modelsFailed }) }}
                <template v-if="run.testsTotal"> · {{ t('transformationsUi.runs.testsCount', { total: run.testsTotal, failed: run.testsFailed }) }}</template>
              </div>
              <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                <div style="flex:1; color:var(--err); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" :title="run.errorMessage">{{ run.errorMessage }}</div>
                <button
                  v-if="run.errorMessage"
                  :disabled="explaining"
                  style="display:inline-flex; align-items:center; gap:5px; flex:none; padding:3px 8px; border:1px solid var(--line); border-radius:7px; background:var(--surface); cursor:pointer; font-family:inherit; font-size:11.5px; font-weight:600; color:var(--ink-2);"
                  @click="explainRun(expandedId ?? '', run.id)"
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

    <!-- Push mirrors were consolidated onto the Workspace → Git page. -->
    <RouterLink
      :to="{ name: 'git' }"
      style="display:inline-flex; align-items:center; gap:6px; margin-top:18px; font-size:12.5px; font-weight:600; color:var(--ink-3); text-decoration:none;"
    >
      <Icon name="link" :size="13" />{{ t('gitMirror.movedLink') }}
    </RouterLink>

    <ExplainPanel :open="explainOpen" :result="explainResult" @close="closeExplain" />
  </div>
</template>
