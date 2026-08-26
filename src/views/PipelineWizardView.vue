<script setup lang="ts">
import { ref, computed, reactive, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ConnectError, Code } from '@connectrpc/connect'
import { pipelineClient, pipelineAssistClient, oauthClientClient } from '../api'
import { errorMessage, fieldViolations } from '../api/errors'
import { connectGoogleSheets, OAuthUnavailableError, OAuthClientNotConfiguredError } from '../api/googleOAuth'
import { useConnectionsStore } from '../stores/connections'
import Icon from '../components/ui/Icon.vue'
import Stepper from '../components/ui/Stepper.vue'
import Spinner from '../components/ui/Spinner.vue'
import FileDropManager from '../components/FileDropManager.vue'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'
import { useCronText } from '../composables/useCronText'
import {
    buildSourceConfig,
    formFieldFor,
    isValidJson,
    unpackSourceConfig,
} from '../lib/pipelineConfig'
import { SOURCES, sourceFor, type PipelineForm, type RestResource } from '../lib/pipelineSources'
import type { PipelineVersion } from '../api/gen/pipeline_pb.js'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { confirm } = useConfirm()

// Steps (0-based): Describe · Configure (· Files).
// Every step here is a real one. There used to be a stubbed Review step
// between the two and a stubbed Preview after them; nothing ever navigated
// forward into either, so the only way to reach Review was Back from
// Configure — which dropped the user onto a panel claiming AI drafting did
// not exist, one step after drafting had worked. Don't advertise a step in
// the stepper until it does something.
// The Files step exists only for file_upload pipelines: it opens right after
// creation, once there is a pipeline id to upload into.
const STEP_DESCRIBE = 0
const STEP_CONFIGURE = 1
const STEP_FILES = 2
const stepLabels = computed(() => [
  t('pipelinesUi.wizard.steps.describe'),
  t('pipelinesUi.wizard.steps.configure'),
  ...(source.value.fileDrop && !isEdit.value ? [t('pipelinesUi.wizard.steps.files')] : []),
])
const current = ref(STEP_DESCRIBE)

const editId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))
const isEdit = computed(() => editId.value !== '')

// --- Describe step (AI drafting via PipelineAssistService) ---
const aiPrompt = ref('')
const drafting = ref(false)
// Non-empty after a draft the platform refused as infeasible (e.g. an
// unsupported database engine); rendered as a standing panel, not a toast.
const unsupportedReason = ref('')
const unsupportedNotes = ref('')

// --- Configure step (the real, functional path) ---
const form = reactive<PipelineForm>({
  name: '',
  sourceType: 'rest_api',
  // rest_api guided fields
  baseUrl: '',
  resources: [] as RestResource[],
  authMethod: 'bearer',
  pagination: 'none',
  // google_sheets guided fields
  spreadsheet: '',
  rangeNames: [] as string[],
  // google_sheets: a workspace-level Google connection reference. The
  // preferred credential — credentials are sent as {oauth:{connection_id}} so
  // the pipeline follows the connection's lifecycle (rotate/disconnect once,
  // in Integrations).
  connectionId: '',
  // Edit only: drop the pipeline's stored credentials on save. Distinct from
  // "send nothing", which the server reads as keep-existing — without this a
  // pipeline can never let go of a connection, and the connection can then
  // never be disconnected (its in-use guard is unsatisfiable).
  detach: false,
  // google_sheets OAuth ("Sign in with Google"): a short-lived grant reference
  // returned by the consent popup. Legacy fallback for workspace planes that
  // do not serve ConnectionService yet: credentials are sent as
  // {oauth:{grant_id}}. Either way the raw service-account textarea is ignored.
  oauthGrantId: '',
  oauthEmail: '',
  // generic / advanced raw source_config
  sourceConfigRaw: '',
  // credentials (secret)
  credentialsRaw: '',
  // destination
  datasetName: '',
  writeDisposition: 'append',
  mergeStrategy: '',
  schedule: '',
})
const advancedJson = ref(false)
const resourceDraft = ref('')
const rangeDraft = ref('')
const formError = ref('')
// Per-field server validation errors, keyed by form field id. Populated from
// the ValidationErrors detail on a failed save (see submit()).
const fieldErrors = reactive<Record<string, string>>({})
const submitting = ref(false)
const loadingEdit = ref(false)

// Everything the wizard used to branch on per source type — guided form or
// raw JSON, credentials or none, schedule or manual, file drop, Google
// sign-in — is a capability the registry answers (src/lib/pipelineSources).
// An unknown source_type gets a generic entry rather than nothing.
const source = computed(() => sourceFor(form.sourceType))

// The <select>, driven by the registry rather than a hardcoded list.
const sourceOptions = computed(() => {
  const opts = SOURCES.map((s) => ({ value: s.id, label: t(s.labelKey) }))
  // A pipeline can hold a source_type this build has never heard of — a newer
  // workspace-api, a self-hoster's own source. With no <option> for it the
  // select falls back to displaying the first entry, and saving then rewrites
  // the pipeline's type to that one without the user touching the control.
  // So the current type is always selectable, named by itself.
  if (form.sourceType && !SOURCES.some((s) => s.id === form.sourceType)) {
    opts.push({ value: form.sourceType, label: form.sourceType })
  }
  return opts
})

function addRange() {
  const v = rangeDraft.value.trim()
  if (v && !form.rangeNames.includes(v)) form.rangeNames.push(v)
  rangeDraft.value = ''
}
function removeRange(name: string) {
  form.rangeNames = form.rangeNames.filter((x) => x !== name)
}

// --- Google Sheets "Sign in with Google" ---
// Three answers, not two, because the user can act on the middle one:
//   'unknown'     not probed yet
//   'unavailable' this server cannot run the flow — use a service account
//   'setup'       it can, but this workspace has not connected its own Google
//                 app yet — send them to Integrations
//   'ready'       an app is connected; the Connect button works
type OAuthState = 'unknown' | 'unavailable' | 'setup' | 'ready'
const oauthState = ref<OAuthState>('unknown')
const oauthConnecting = ref(false)
const oauthError = ref('')

// Kept as a boolean for the template's "hide the whole block" test.
const oauthAvailable = computed(() => (oauthState.value === 'unknown' ? null : oauthState.value !== 'unavailable'))

// True once the user has connected a Google account this session (legacy
// grant path — the connection picker has its own selected state).
const sheetsConnected = computed(() => source.value.googleOAuth && !!form.oauthGrantId)

// --- Workspace-level Google connections (the preferred credential) ---
const connectionsStore = useConnectionsStore()
const connectionOptions = computed(() =>
  connectionsStore.availability === 'ready'
    ? connectionsStore.connections.filter((c) => c.type === 'google')
    : [],
)
// On create, preselect the only sensible default once the list arrives. Edits
// are prefilled from the pipeline itself (loadForEdit) — a connection id is a
// reference, not credential material, so the editor can and must show which
// account is attached: a blank picker reads as "nothing is set" while the
// server is still keeping something the user cannot see.
watch(connectionOptions, (opts) => {
  const first = opts[0]
  if (!isEdit.value && source.value.googleOAuth && !form.connectionId && !form.oauthGrantId && first) {
    form.connectionId = first.id
  }
})

// The pipeline's stored credential state, as the server reports it on edit.
// attachedConnectionId is '' when the pipeline holds its own credentials.
const attachedConnectionId = ref('')
const hasStoredCredentials = ref(false)

// Picker sentinel for "drop the stored credentials". A <select> carries one
// value, so detach rides in the same control as the connection choice and is
// unpacked into form.connectionId / form.detach here.
const DETACH = '__detach__'
const credentialChoice = computed<string>({
  get: () => (form.detach ? DETACH : form.connectionId),
  set: (v) => {
    form.detach = v === DETACH
    form.connectionId = v === DETACH ? '' : v
  },
})

// Ask the workspace whether an OAuth app is connected. The RPC is the source of
// truth rather than a probe of /start: it distinguishes "no app connected yet"
// from "this server has no OAuth at all", and unlike the old probe it does not
// mint a consent state just to find out.
async function probeOAuthAvailability() {
  if (!source.value.googleOAuth || oauthState.value !== 'unknown') return
  try {
    const resp = await oauthClientClient.getOAuthClient({ provider: 'google' })
    if (!resp.flowAvailable) oauthState.value = 'unavailable'
    else oauthState.value = resp.configured ? 'ready' : 'setup'
  } catch (err) {
    // An older workspace plane does not serve the service at all.
    oauthState.value = err instanceof ConnectError && err.code === Code.Unimplemented ? 'unavailable' : 'setup'
  }
}

async function connectGoogle() {
  oauthError.value = ''
  oauthConnecting.value = true
  try {
    const res = await connectGoogleSheets()
    let promoted = false
    if (connectionsStore.availability !== 'unavailable') {
      // Promote the grant to a workspace connection so this sign-in is the
      // last one: future pipelines (and live SQL) reuse it by reference.
      // Attempted even while availability is still 'unknown' — the probe is
      // best-effort and a swallowed load must not silently downgrade a
      // capable plane to the one-shot grant path.
      //
      // Signing in with an account that is already connected re-authorizes
      // that connection server-side and returns it, id unchanged. There is
      // deliberately no client-side "already exists → reuse the existing row"
      // fallback: that turned a reconnect into a no-op that reattached the
      // very token the user was trying to replace, and spent the fresh grant
      // doing it, so the error the customer was told to fix could not be
      // fixed. If the server ever does refuse, the refusal must be visible.
      try {
        const conn = await connectionsStore.createFromGoogleGrant(res.grant_id)
        form.connectionId = conn.id
        form.detach = false
        form.oauthGrantId = ''
        form.oauthEmail = ''
        promoted = true
      } catch (err) {
        if (!(err instanceof ConnectError && err.code === Code.Unimplemented)) {
          // Grants are one-time and consumption happens server-side, so after
          // any other failure the grant may already be dead — surface the
          // error instead of embedding a reference that cannot redeem.
          throw err
        }
        // Unimplemented: an older plane without ConnectionService — the
        // grant was never touched, the one-shot fallback below is correct.
      }
    }
    if (!promoted) {
      // Legacy plane without ConnectionService: one-shot grant per pipeline.
      form.oauthGrantId = res.grant_id
      form.oauthEmail = res.email
      form.connectionId = ''
      form.detach = false
    }
    form.credentialsRaw = '' // OAuth and service-account are mutually exclusive
    oauthState.value = 'ready'
    toast.success(t('pipelinesUi.wizard.configure.sheetsOAuth.connected', { email: res.email }))
  } catch (err) {
    if (err instanceof OAuthUnavailableError) {
      oauthState.value = 'unavailable'
    } else if (err instanceof OAuthClientNotConfiguredError) {
      // The app was disconnected between the probe and the click.
      oauthState.value = 'setup'
    } else {
      oauthError.value = errorMessage(err, t('pipelinesUi.wizard.configure.sheetsOAuth.failed'))
    }
  } finally {
    oauthConnecting.value = false
  }
}

function disconnectGoogle() {
  form.oauthGrantId = ''
  form.oauthEmail = ''
  form.connectionId = ''
  form.detach = false
}

// Typing a service-account key clears any OAuth grant/connection so the two
// never collide.
watch(() => form.credentialsRaw, (v) => {
  if (v.trim() && (form.oauthGrantId || form.connectionId)) disconnectGoogle()
})

// Probe when Google Sheets becomes the selected source. The connections list
// loads alongside; an older plane answers Unimplemented and the picker simply
// never appears (availability = 'unavailable').
watch(() => source.value.googleOAuth, (on) => {
  if (on) {
    probeOAuthAvailability()
    connectionsStore.load().catch(() => {})
  }
}, { immediate: true })

// Post-create upload flow (file_upload only).
const createdPipelineId = ref('')
const uploadedCount = ref(0)
const runningNow = ref(false)

// Selecting a source type applies whatever that type declares as its
// defaults (file_upload: no credentials, no schedule, replace — the platform
// injects the storage credentials, and the pipeline runs when the user hits
// run after dropping a file). Create only: an edit is already configured.
watch(() => form.sourceType, (type) => {
  const next = sourceFor(type)
  if (next.defaults && !isEdit.value) Object.assign(form, next.defaults)
  // A Google grant is meaningless for a source that does not sign in.
  if (!next.googleOAuth) disconnectGoogle()
})

function addResource() {
  const v = resourceDraft.value.trim()
  if (v && !form.resources.some((x) => x.name === v)) {
    form.resources.push({ name: v, endpoint: '/' + v.replace(/^\/+/, '') })
  }
  resourceDraft.value = ''
}
function removeResource(name: string) {
  form.resources = form.resources.filter((x) => x.name !== name)
}

function buildCredentials(): unknown {
  // Google Sheets via a workspace connection: send only the reference; the
  // backend resolves the connection's refresh token at serve/render time, so
  // the pipeline follows the connection (reconnect once, everywhere).
  if (source.value.googleOAuth && form.connectionId) {
    return { oauth: { connection_id: form.connectionId } }
  }
  // Legacy grant path: the backend swaps the grant for the stored refresh
  // token and injects the client credentials.
  if (source.value.googleOAuth && form.oauthGrantId) {
    return { oauth: { grant_id: form.oauthGrantId } }
  }
  const raw = form.credentialsRaw.trim()
  return raw ? JSON.parse(raw) : {}
}

// Whether the user supplied new credentials this session (used on edit, where
// empty means "keep existing").
const credentialsProvided = computed(() =>
  !!form.connectionId || !!form.oauthGrantId || form.credentialsRaw.trim() !== '',
)

// --- Schedule: validated + spelled out (src/lib/cron.ts) ---
const cronText = useCronText()
const scheduleError = computed(() => cronText.error(form.schedule))
const scheduleHint = computed(() => {
  if (!form.schedule.trim()) return t('pipelinesUi.wizard.configure.scheduleHint.manual')
  return scheduleError.value || cronText.describe(form.schedule)
})
// The box evaluates cron in UTC, so the preview is labelled UTC rather than
// silently shown in the browser's timezone.
const scheduleNextRuns = computed(() =>
  scheduleError.value ? '' : cronText.nextRunsText(form.schedule, 3),
)

function validate(): boolean {
  const errors: string[] = []
  if (!form.name.trim()) errors.push(t('pipelines.validation.nameRequired'))
  if (!form.sourceType) errors.push(t('pipelines.validation.sourceTypeRequired'))
  if (!form.datasetName.trim()) errors.push(t('pipelines.validation.datasetRequired'))
  if ((advancedJson.value || !source.value.guided) && !isValidJson(form.sourceConfigRaw)) {
    errors.push(`${t('pipelines.sourceConfig')}: ${t('pipelines.validation.invalidJson')}`)
  }
  // A connected Google account uses the connection/grant, not the raw
  // textarea, so only validate the service-account JSON when neither is set.
  if (!form.connectionId && !form.oauthGrantId && !isValidJson(form.credentialsRaw)) {
    errors.push(`${t('pipelines.sourceCredentials')}: ${t('pipelines.validation.invalidJson')}`)
  }
  // On create, a Google Sheets pipeline needs one credential method: a Google
  // connection, a one-shot grant, or a pasted service-account key.
  if (source.value.googleOAuth && !isEdit.value && !form.connectionId && !form.oauthGrantId && !form.credentialsRaw.trim()) {
    errors.push(t('pipelinesUi.wizard.configure.sheetsOAuth.required'))
  }
  // A malformed cron would be accepted by the API and then silently never fire
  // on the box — catch it here instead.
  if (scheduleError.value) errors.push(`${t('pipelines.schedule')}: ${scheduleError.value}`)
  formError.value = errors.join(' ')
  return errors.length === 0
}

async function submit() {
  for (const k of Object.keys(fieldErrors)) delete fieldErrors[k]
  if (!validate()) return
  let sourceConfig: string
  let sourceCredentials: string
  try {
    sourceConfig = JSON.stringify(buildSourceConfig(form, advancedJson.value))
    sourceCredentials = JSON.stringify(buildCredentials())
  } catch {
    formError.value = t('pipelines.validation.invalidJson')
    return
  }
  submitting.value = true
  formError.value = ''
  try {
    if (isEdit.value) {
      await pipelineClient.updatePipeline({
        id: editId.value,
        name: form.name.trim(),
        sourceType: form.sourceType,
        sourceConfig,
        // Empty credentials = keep existing (server contract). A reconnected
        // Google account or a re-pasted key counts as new credentials.
        sourceCredentials: credentialsProvided.value ? sourceCredentials : '',
        // ...and clearCredentials is the only way to say "drop them", which
        // keep-existing otherwise makes inexpressible. The two are mutually
        // exclusive; the picker cannot produce both at once.
        clearCredentials: form.detach,
        datasetName: form.datasetName.trim(),
        schedule: form.schedule.trim(),
        writeDisposition: form.writeDisposition,
        mergeStrategy: form.writeDisposition === 'merge' ? form.mergeStrategy : '',
        enabled: true,
      })
      toast.success(t('pipelinesUi.toast.updated'))
    } else {
      const resp = await pipelineClient.createPipeline({
        name: form.name.trim(),
        sourceType: form.sourceType,
        sourceConfig,
        sourceCredentials,
        datasetName: form.datasetName.trim(),
        schedule: form.schedule.trim(),
        writeDisposition: form.writeDisposition,
        mergeStrategy: form.writeDisposition === 'merge' ? form.mergeStrategy : '',
      })
      toast.success(t('pipelinesUi.toast.created'))
      // File-drop pipelines continue to the Files step: now that the pipeline
      // exists there is a prefix to upload into.
      if (source.value.fileDrop && resp.pipeline) {
        createdPipelineId.value = resp.pipeline.id
        current.value = STEP_FILES
        return
      }
    }
    router.push({ name: 'pipelines' })
  } catch (err) {
    for (const v of fieldViolations(err)) {
      const key = formFieldFor(v.field)
      if (key && !fieldErrors[key]) fieldErrors[key] = v.description
    }
    toast.error(errorMessage(err, t('pipelinesUi.toast.saveFailed')))
  } finally {
    submitting.value = false
  }
}

// Unpack a stored (or drafted) source_config into the form. One helper for
// both entry points: an edit and an AI draft must land on the same form, and
// the two used to do it with near-identical copies that had drifted apart.
function applySourceConfig(sourceType: string, sourceConfig: string) {
  const unpacked = unpackSourceConfig(sourceType, sourceConfig)
  Object.assign(form, unpacked.fields)
  form.sourceConfigRaw = unpacked.raw
  advancedJson.value = unpacked.advanced
}

// --- Edit mode: prefill from getPipeline, jump straight to Configure ---
async function loadForEdit() {
  loadingEdit.value = true
  try {
    const resp = await pipelineClient.getPipeline({ id: editId.value })
    const p = resp.pipeline
    if (!p) return
    form.name = p.name
    form.sourceType = p.sourceType
    form.datasetName = p.datasetName
    form.schedule = p.schedule
    form.writeDisposition = p.writeDisposition || 'append'
    form.mergeStrategy = p.mergeStrategy
    applySourceConfig(p.sourceType, p.sourceConfig)
    // Credential material is write-only and stays empty (empty = keep existing
    // on save). The connection *reference* is not material, and showing it is
    // the difference between an editor that says which account is attached and
    // one that looks blank while the server keeps a credential the user
    // believes they removed.
    attachedConnectionId.value = resp.connectionId
    hasStoredCredentials.value = resp.hasCredentials
    form.connectionId = resp.connectionId
    form.detach = false
  } finally {
    loadingEdit.value = false
  }
}

onMounted(() => {
  if (isEdit.value) {
    current.value = STEP_CONFIGURE
    loadForEdit()
    void loadVersions()
  }
})

// --- Version history (edit mode; the mirrored repo on VM boxes) -------------
const versions = ref<PipelineVersion[]>([])
const versionsState = ref<'hidden' | 'loading' | 'ready'>('hidden')
const restoringSha = ref('')

async function loadVersions() {
  versionsState.value = 'loading'
  try {
    const resp = await pipelineClient.listPipelineVersions({ pipelineId: editId.value })
    versions.value = resp.versions
    versionsState.value = resp.versions.length > 0 ? 'ready' : 'hidden'
  } catch {
    // FAILED_PRECONDITION = not a VM box / mirror not ready; any other error
    // is equally non-blocking here — the section simply stays hidden.
    versionsState.value = 'hidden'
  }
}

async function restoreVersion(v: PipelineVersion) {
  const ok = await confirm({
    title: t('pipelinesUi.versions.confirmTitle'),
    body: t('pipelinesUi.versions.confirmBody', { date: formatVersionTime(v.date), author: v.authorName }),
    confirmLabel: t('pipelinesUi.versions.confirmRestore'),
  })
  if (!ok) return
  restoringSha.value = v.sha
  try {
    await pipelineClient.restorePipelineVersion({ pipelineId: editId.value, sha: v.sha })
    toast.success(t('pipelinesUi.versions.restored'))
    await Promise.all([loadForEdit(), loadVersions()])
  } catch (err) {
    toast.error(errorMessage(err, t('pipelinesUi.versions.restoreFailed')))
  } finally {
    restoringSha.value = ''
  }
}

function formatVersionTime(iso: string): string {
  if (!iso) return ''
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  return then.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function goConfigure() {
  current.value = STEP_CONFIGURE
}

// Pre-fill the Configure form from a drafted CreatePipelineRequest. Mirrors
// loadForEdit's unpacking so the AI draft and an edit land on the same form.
function applyDraft(d: {
  name: string
  sourceType: string
  sourceConfig: string
  datasetName: string
  schedule: string
  writeDisposition: string
  mergeStrategy: string
}) {
  form.name = d.name
  form.sourceType = d.sourceType || 'rest_api'
  form.datasetName = d.datasetName
  form.schedule = d.schedule
  form.writeDisposition = d.writeDisposition || 'append'
  form.mergeStrategy = d.mergeStrategy
  // Credentials are never drafted — the user fills them in Configure.
  form.credentialsRaw = ''
  disconnectGoogle()
  applySourceConfig(form.sourceType, d.sourceConfig)
}

async function draftPipeline() {
  const prompt = aiPrompt.value.trim()
  if (!prompt || drafting.value) return
  drafting.value = true
  unsupportedReason.value = ''
  unsupportedNotes.value = ''
  try {
    const resp = await pipelineAssistClient.draftPipeline({ prompt })
    // The refusal path: the request needs a capability the platform does not
    // have. Stay on Describe and show the standing reason — pre-filling the
    // wizard would invite configuring the very thing that cannot run.
    if (resp.unsupportedReason) {
      unsupportedReason.value = resp.unsupportedReason
      unsupportedNotes.value = resp.notes
      return
    }
    if (resp.draft) applyDraft(resp.draft)
    if (resp.notes) toast.info(resp.notes)
    goConfigure()
  } catch (err) {
    // Server without an Anthropic key returns UNIMPLEMENTED — surface a soft
    // "coming soon" hint and let the user fall back to the manual path.
    if (err instanceof ConnectError && err.code === Code.Unimplemented) {
      toast.info(t('pipelinesUi.wizard.describe.notConfigured'))
    } else {
      toast.error(errorMessage(err, t('pipelinesUi.wizard.describe.draftFailed')))
    }
  } finally {
    drafting.value = false
  }
}
function goBack() {
  current.value = Math.max(STEP_DESCRIBE, current.value - 1)
}

// --- Files step (file_upload, post-create) ---

async function runNow() {
  if (!createdPipelineId.value || runningNow.value) return
  runningNow.value = true
  try {
    await pipelineClient.triggerPipeline({ id: createdPipelineId.value })
    toast.success(t('pipelinesUi.toast.triggered'))
    router.push({ name: 'pipelines' })
  } catch (err) {
    toast.error(errorMessage(err, t('pipelinesUi.toast.triggerFailed')))
  } finally {
    runningNow.value = false
  }
}

function finishFiles() {
  router.push({ name: 'pipelines' })
}
</script>

<template>
  <div style="max-width:780px; margin:0 auto; padding:26px 34px 90px;">
    <button
      @click="router.push({ name: 'pipelines' })"
      style="display:flex; align-items:center; gap:6px; border:none; background:transparent; color:var(--ink-3); font-family:inherit; font-size:13px; font-weight:600; cursor:pointer; padding:0; margin-bottom:18px;"
    >
      <Icon name="chevronLeft" :size="15" />{{ t('pipelinesUi.wizard.back') }}
    </button>

    <div v-if="isEdit" style="margin-bottom:18px;">
      <h1 style="margin:0; font-size:20px; font-weight:700; letter-spacing:-.01em;">{{ t('pipelinesUi.wizard.editTitle') }}</h1>
    </div>

    <!-- Stepper. Editing is a single form, not a walk through the wizard —
         a stepper there would only ever show Configure. -->
    <div v-if="!isEdit" style="margin-bottom:24px;">
      <Stepper :steps="stepLabels" :current="current" />
    </div>

    <!-- Loading (edit prefill) -->
    <div v-if="loadingEdit" style="display:flex; align-items:center; justify-content:center; padding:60px 0;">
      <Spinner />
    </div>

    <template v-else>
      <!-- STEP 1: DESCRIBE (AI drafting) -->
      <div
        v-if="current === STEP_DESCRIBE"
        style="background:var(--surface); border:1px solid var(--line); border-radius:18px; box-shadow:var(--shadow); padding:26px;"
      >
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
          <div style="width:34px; height:34px; border-radius:10px; background:var(--clay-soft); color:var(--clay); display:flex; align-items:center; justify-content:center; flex:none;">
            <Icon name="sparkle" :size="18" />
          </div>
          <div>
            <h2 style="margin:0; font-size:18px; font-weight:700; letter-spacing:-.01em;">{{ t('pipelinesUi.wizard.describe.title') }}</h2>
            <div style="font-size:13px; color:var(--ink-2);">{{ t('pipelinesUi.wizard.describe.subtitle') }}</div>
          </div>
        </div>
        <textarea
          v-model="aiPrompt"
          rows="3"
          :placeholder="t('pipelinesUi.wizard.describe.placeholder')"
          style="width:100%; margin-top:16px; padding:14px 15px; border:1px solid var(--line); border-radius:13px; background:var(--surface-2); color:var(--ink); font-family:inherit; font-size:15px; line-height:1.55; resize:vertical; outline:none;"
        ></textarea>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:13px;">
          <span style="font-size:12px; color:var(--ink-3); align-self:center; margin-right:2px;">{{ t('pipelinesUi.wizard.describe.tryLabel') }}</span>
          <button
            @click="aiPrompt = t('pipelinesUi.wizard.describe.examples.postgres')"
            style="border:1px solid var(--line); background:var(--surface-2); border-radius:20px; padding:5px 12px; font-family:inherit; font-size:12px; color:var(--ink-2); cursor:pointer;"
          >{{ t('pipelinesUi.wizard.describe.examples.postgres') }}</button>
          <button
            @click="aiPrompt = t('pipelinesUi.wizard.describe.examples.s3')"
            style="border:1px solid var(--line); background:var(--surface-2); border-radius:20px; padding:5px 12px; font-family:inherit; font-size:12px; color:var(--ink-2); cursor:pointer;"
          >{{ t('pipelinesUi.wizard.describe.examples.s3') }}</button>
          <button
            @click="aiPrompt = t('pipelinesUi.wizard.describe.examples.sheets')"
            style="border:1px solid var(--line); background:var(--surface-2); border-radius:20px; padding:5px 12px; font-family:inherit; font-size:12px; color:var(--ink-2); cursor:pointer;"
          >{{ t('pipelinesUi.wizard.describe.examples.sheets') }}</button>
        </div>
        <div
          v-if="unsupportedReason"
          style="display:flex; align-items:flex-start; gap:11px; background:var(--warn-soft); border:1px solid var(--warn); border-radius:14px; padding:14px 16px; margin-top:16px;"
        >
          <Icon name="info" :size="18" :style="{ color: 'var(--warn-ink)', flex: 'none', marginTop: '1px' }" />
          <div style="font-size:13.5px; color:var(--ink); line-height:1.55;">
            <div style="font-weight:700; color:var(--warn-ink); margin-bottom:3px;">{{ t('pipelinesUi.wizard.describe.unsupportedTitle') }}</div>
            <div>{{ unsupportedReason }}</div>
            <div v-if="unsupportedNotes" style="margin-top:6px; color:var(--ink-2);">{{ unsupportedNotes }}</div>
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end; align-items:center; gap:12px; margin-top:22px;">
          <button
            @click="goConfigure"
            style="border:none; background:transparent; color:var(--accent); font-family:inherit; font-size:13px; font-weight:700; cursor:pointer;"
          >{{ t('pipelinesUi.wizard.describe.manual') }}</button>
          <button
            @click="draftPipeline"
            :disabled="!aiPrompt.trim() || drafting"
            :style="{
              display: 'flex', alignItems: 'center', gap: '8px', height: '42px', padding: '0 20px',
              border: 'none', borderRadius: '11px', background: 'var(--clay)', color: '#fff',
              fontFamily: 'inherit', fontSize: '14px', fontWeight: 600, boxShadow: 'var(--shadow)',
              opacity: (!aiPrompt.trim() || drafting) ? 0.5 : 1,
              cursor: (!aiPrompt.trim() || drafting) ? 'not-allowed' : 'pointer',
            }"
          >
            <Spinner v-if="drafting" :size="16" />
            <Icon v-else name="sparkle" :size="16" />{{ t('pipelinesUi.wizard.describe.draft') }}
          </button>
        </div>
      </div>

      <!-- STEP 2: CONFIGURE -->
      <div v-else-if="current === STEP_CONFIGURE">
        <!-- Source -->
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); padding:22px; margin-bottom:16px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:18px;">
            <h2 style="margin:0; font-size:16px; font-weight:700;">{{ t('pipelinesUi.wizard.configure.sourceTitle') }}</h2>
            <button
              v-if="source.guided"
              @click="advancedJson = !advancedJson"
              style="display:flex; align-items:center; gap:6px; border:1px solid var(--line); background:var(--surface-2); border-radius:8px; padding:5px 10px; font-family:inherit; font-size:12px; font-weight:600; color:var(--ink-3); cursor:pointer;"
            >
              <Icon name="code" :size="13" />{{ advancedJson ? t('pipelinesUi.wizard.configure.guided') : t('pipelinesUi.wizard.configure.advancedJson') }}
            </button>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
            <div style="grid-column:1 / -1;">
              <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink-2); margin-bottom:6px;">{{ t('pipelines.name') }}</label>
              <input
                v-model="form.name"
                :placeholder="t('pipelines.namePlaceholder')"
                style="width:100%; height:40px; padding:0 13px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:inherit; font-size:14px; outline:none;"
              />
            </div>

            <div style="grid-column:1 / -1;">
              <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink-2); margin-bottom:6px;">{{ t('pipelines.sourceType') }}</label>
              <div style="position:relative;">
                <select
                  v-model="form.sourceType"
                  style="width:100%; height:40px; padding:0 13px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:inherit; font-size:14px; outline:none; appearance:none; cursor:pointer;"
                >
                  <option v-for="opt in sourceOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
                <Icon name="chevronDown" :size="15" :style="{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--ink-3)' }" />
              </div>
            </div>

            <!-- rest_api guided fields -->
            <template v-if="source.id === 'rest_api' && !advancedJson">
              <div style="grid-column:1 / -1;">
                <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink-2); margin-bottom:6px;">{{ t('pipelinesUi.wizard.configure.baseUrl') }}</label>
                <input
                  v-model="form.baseUrl"
                  :placeholder="t('pipelinesUi.wizard.configure.baseUrlPlaceholder')"
                  style="width:100%; height:40px; padding:0 13px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:'JetBrains Mono',monospace; font-size:13px; outline:none;"
                />
                <p v-if="fieldErrors.baseUrl" style="color:var(--err); font-size:12px; margin:6px 0 0;">{{ fieldErrors.baseUrl }}</p>
              </div>
              <div style="grid-column:1 / -1;">
                <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink-2); margin-bottom:6px;">{{ t('pipelinesUi.wizard.configure.resources') }}</label>
                <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                  <span
                    v-for="r in form.resources"
                    :key="r.name"
                    :title="r.endpoint"
                    style="display:flex; align-items:center; gap:7px; background:var(--accent-soft); color:var(--accent-soft-ink); border-radius:9px; padding:7px 11px; font-family:'JetBrains Mono',monospace; font-size:13px; font-weight:500;"
                  >
                    {{ r.name }}
                    <span @click="removeResource(r.name)" style="cursor:pointer; opacity:.6; display:flex;"><Icon name="x" :size="13" /></span>
                  </span>
                  <input
                    v-model="resourceDraft"
                    @keydown.enter.prevent="addResource"
                    :placeholder="t('pipelinesUi.wizard.configure.resourcePlaceholder')"
                    style="height:36px; padding:0 11px; border:1px solid var(--line); border-radius:9px; background:var(--surface-2); color:var(--ink); font-family:'JetBrains Mono',monospace; font-size:13px; outline:none; width:150px;"
                  />
                  <button
                    @click="addResource"
                    style="border:1px dashed var(--line); background:transparent; color:var(--ink-3); border-radius:9px; padding:7px 11px; font-family:inherit; font-size:13px; cursor:pointer;"
                  >+ {{ t('pipelinesUi.wizard.configure.addResource') }}</button>
                </div>
                <p v-if="fieldErrors.resources" style="color:var(--err); font-size:12px; margin:6px 0 0;">{{ fieldErrors.resources }}</p>
              </div>
              <div>
                <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink-2); margin-bottom:6px;">{{ t('pipelinesUi.wizard.configure.authMethod') }}</label>
                <div style="position:relative;">
                  <select
                    v-model="form.authMethod"
                    style="width:100%; height:40px; padding:0 13px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:inherit; font-size:14px; outline:none; appearance:none; cursor:pointer;"
                  >
                    <option value="bearer">{{ t('pipelinesUi.wizard.configure.auth.bearer') }}</option>
                    <option value="api_key">{{ t('pipelinesUi.wizard.configure.auth.apiKey') }}</option>
                    <option value="basic">{{ t('pipelinesUi.wizard.configure.auth.basic') }}</option>
                    <option value="none">{{ t('pipelinesUi.wizard.configure.auth.none') }}</option>
                  </select>
                  <Icon name="chevronDown" :size="15" :style="{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--ink-3)' }" />
                </div>
              </div>
              <div>
                <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink-2); margin-bottom:6px;">{{ t('pipelinesUi.wizard.configure.pagination') }}</label>
                <div style="position:relative;">
                  <select
                    v-model="form.pagination"
                    style="width:100%; height:40px; padding:0 13px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:inherit; font-size:14px; outline:none; appearance:none; cursor:pointer;"
                  >
                    <option value="none">{{ t('pipelinesUi.wizard.configure.paging.none') }}</option>
                    <option value="cursor">{{ t('pipelinesUi.wizard.configure.paging.cursor') }}</option>
                    <option value="page_number">{{ t('pipelinesUi.wizard.configure.paging.pageNumber') }}</option>
                    <option value="offset">{{ t('pipelinesUi.wizard.configure.paging.offset') }}</option>
                  </select>
                  <Icon name="chevronDown" :size="15" :style="{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--ink-3)' }" />
                </div>
              </div>
            </template>

            <!-- google_sheets guided fields -->
            <template v-else-if="source.id === 'google_sheets' && !advancedJson">
              <div style="grid-column:1 / -1;">
                <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink-2); margin-bottom:6px;">{{ t('pipelinesUi.wizard.configure.spreadsheet') }}</label>
                <input
                  v-model="form.spreadsheet"
                  :placeholder="t('pipelinesUi.wizard.configure.spreadsheetPlaceholder')"
                  style="width:100%; height:40px; padding:0 13px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:'JetBrains Mono',monospace; font-size:13px; outline:none;"
                />
                <p v-if="fieldErrors.spreadsheet" style="color:var(--err); font-size:12px; margin:6px 0 0;">{{ fieldErrors.spreadsheet }}</p>
              </div>
              <div style="grid-column:1 / -1;">
                <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink-2); margin-bottom:6px;">{{ t('pipelinesUi.wizard.configure.ranges') }}</label>
                <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
                  <span
                    v-for="r in form.rangeNames"
                    :key="r"
                    style="display:flex; align-items:center; gap:7px; background:var(--accent-soft); color:var(--accent-soft-ink); border-radius:9px; padding:7px 11px; font-family:'JetBrains Mono',monospace; font-size:13px; font-weight:500;"
                  >
                    {{ r }}
                    <span @click="removeRange(r)" style="cursor:pointer; opacity:.6; display:flex;"><Icon name="x" :size="13" /></span>
                  </span>
                  <input
                    v-model="rangeDraft"
                    @keydown.enter.prevent="addRange"
                    :placeholder="t('pipelinesUi.wizard.configure.rangePlaceholder')"
                    style="height:36px; padding:0 11px; border:1px solid var(--line); border-radius:9px; background:var(--surface-2); color:var(--ink); font-family:'JetBrains Mono',monospace; font-size:13px; outline:none; width:170px;"
                  />
                  <button
                    @click="addRange"
                    style="border:1px dashed var(--line); background:transparent; color:var(--ink-3); border-radius:9px; padding:7px 11px; font-family:inherit; font-size:13px; cursor:pointer;"
                  >+ {{ t('pipelinesUi.wizard.configure.addRange') }}</button>
                </div>
                <p style="font-size:12px; color:var(--ink-3); margin:6px 0 0;">{{ t('pipelinesUi.wizard.configure.rangesHint') }}</p>
                <p v-if="fieldErrors.rangeNames" style="color:var(--err); font-size:12px; margin:6px 0 0;">{{ fieldErrors.rangeNames }}</p>
              </div>
            </template>

            <!-- file_upload: files are dropped after creation (create) or
                 managed right here (edit) — no JSON, no credentials -->
            <div v-else-if="source.fileDrop" style="grid-column:1 / -1;">
              <template v-if="isEdit">
                <FileDropManager :pipeline-id="editId" />
              </template>
              <div v-else style="display:flex; align-items:flex-start; gap:11px; background:var(--inset); border:1px solid var(--line); border-radius:14px; padding:14px 16px;">
                <Icon name="info" :size="18" :style="{ color: 'var(--ink-3)', flex: 'none', marginTop: '1px' }" />
                <div style="font-size:13.5px; color:var(--ink-2); line-height:1.55;">{{ t('pipelinesUi.fileDrop.createHint') }}</div>
              </div>
            </div>

            <!-- generic / advanced raw JSON -->
            <div v-else style="grid-column:1 / -1;">
              <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink-2); margin-bottom:6px;">{{ t('pipelinesUi.wizard.configure.genericConfig') }}</label>
              <textarea
                v-model="form.sourceConfigRaw"
                rows="6"
                placeholder='{"base_url": "https://api.example.com", "resources": []}'
                style="width:100%; padding:11px 13px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:'JetBrains Mono',monospace; font-size:13px; line-height:1.5; outline:none; resize:vertical;"
              ></textarea>
              <p v-if="fieldErrors.sourceConfigRaw" style="color:var(--err); font-size:12px; margin:6px 0 0;">{{ fieldErrors.sourceConfigRaw }}</p>
            </div>
          </div>
        </div>

        <!-- Credentials (file_upload needs none: the platform uses the
             workspace's own storage credentials) -->
        <div v-if="source.credentials" style="background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); padding:22px; margin-bottom:16px;">
          <h2 style="margin:0 0 5px; font-size:16px; font-weight:700;">{{ t('pipelinesUi.wizard.configure.credentialsTitle') }}</h2>
          <div style="font-size:12.5px; color:var(--ink-2); margin-bottom:16px;">
            {{ isEdit ? t('pipelinesUi.wizard.configure.credentialsHelpEdit') : t('pipelinesUi.wizard.configure.credentialsHelp') }}
          </div>

          <!-- google_sheets: Sign in with Google (default) + service account (advanced) -->
          <template v-if="source.googleOAuth">
            <!-- OAuth (hidden when the server has no Google OAuth configured) -->
            <div v-if="oauthAvailable !== false" style="margin-bottom:14px;">
              <!-- Workspace connection picker (preferred): the pipeline
                   references an already-connected Google account instead of
                   holding its own token. -->
              <div v-if="connectionOptions.length" style="background:var(--inset); border:1px solid var(--line); border-radius:12px; padding:12px 14px;">
                <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink-2); margin-bottom:6px;">{{ t('connections.picker.label') }}</label>
                <div style="display:flex; align-items:center; gap:9px; flex-wrap:wrap;">
                  <select
                    v-model="credentialChoice"
                    style="flex:1; min-width:220px; height:36px; padding:0 10px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:inherit; font-size:13px; outline:none;"
                  >
                    <!-- "Keep existing" only when there is something to keep
                         that this picker cannot name: a pipeline holding its
                         own token or a service-account key. An attached
                         connection is shown as itself, selected. -->
                    <option v-if="isEdit && hasStoredCredentials && !attachedConnectionId" value="">
                      {{ t('connections.picker.keepExisting') }}
                    </option>
                    <option v-for="c in connectionOptions" :key="c.id" :value="c.id">
                      {{ c.name }}{{ c.email && c.email !== c.name ? ` (${c.email})` : '' }}
                    </option>
                    <option v-if="isEdit && hasStoredCredentials" :value="DETACH">
                      {{ t('connections.picker.detach') }}
                    </option>
                  </select>
                  <button type="button" @click="connectGoogle" :disabled="oauthConnecting"
                    style="display:inline-flex; align-items:center; gap:6px; background:transparent; border:1px solid var(--line); border-radius:9px; padding:0 12px; height:36px; font-size:12.5px; font-weight:600; color:var(--ink-2); cursor:pointer;">
                    <Spinner v-if="oauthConnecting" :size="13" />
                    <Icon v-else name="plus" :size="14" />
                    {{ t('connections.picker.connectNew') }}
                  </button>
                </div>
                <p style="font-size:12px; color:var(--ink-3); margin:8px 0 0; line-height:1.5;">
                  {{ form.detach ? t('connections.picker.detachHint') : t('connections.picker.hint') }}
                </p>
                <p v-if="oauthError" style="color:var(--err); font-size:12px; margin:8px 0 0;">{{ oauthError }}</p>
              </div>
              <div v-else-if="sheetsConnected" style="display:flex; align-items:center; gap:11px; background:var(--inset); border:1px solid var(--line); border-radius:12px; padding:12px 14px;">
                <Icon name="check" :size="18" :style="{ color: 'var(--ok, #16a34a)', flex: 'none' }" />
                <div style="flex:1; font-size:13.5px; color:var(--ink); line-height:1.5;">
                  {{ t('pipelinesUi.wizard.configure.sheetsOAuth.connectedAs', { email: form.oauthEmail }) }}
                </div>
                <button type="button" @click="connectGoogle" :disabled="oauthConnecting"
                  style="display:inline-flex; align-items:center; gap:6px; background:transparent; border:1px solid var(--line); border-radius:9px; padding:7px 12px; font-size:12.5px; font-weight:600; color:var(--ink-2); cursor:pointer;">
                  <Icon name="refresh" :size="14" />{{ t('pipelinesUi.wizard.configure.sheetsOAuth.reconnect') }}
                </button>
              </div>
              <!-- The workspace has no Google app of its own yet. Signing in
                   needs one, so point at the setup rather than at a button that
                   would only fail. -->
              <div v-else-if="oauthState === 'setup'" style="display:flex; align-items:flex-start; gap:11px; background:var(--inset); border:1px solid var(--line); border-radius:12px; padding:12px 14px;">
                <Icon name="info" :size="16" :style="{ color: 'var(--ink-3)', flex: 'none', marginTop: '2px' }" />
                <div style="flex:1; min-width:0;">
                  <div style="font-size:13px; color:var(--ink); line-height:1.55; margin-bottom:9px;">
                    {{ t('pipelinesUi.wizard.configure.sheetsOAuth.needsClient') }}
                  </div>
                  <RouterLink
                    :to="{ name: 'integrations' }"
                    style="display:inline-flex; align-items:center; gap:7px; background:var(--surface-2); border:1px solid var(--line); border-radius:9px; padding:7px 12px; font-size:12.5px; font-weight:600; color:var(--ink); text-decoration:none;"
                  >
                    <Icon name="launch" :size="14" />{{ t('pipelinesUi.wizard.configure.sheetsOAuth.goToIntegrations') }}
                  </RouterLink>
                </div>
              </div>
              <div v-else>
                <p style="font-size:12.5px; color:var(--ink-2); margin:0 0 10px; line-height:1.55;">{{ t('pipelinesUi.wizard.configure.sheetsOAuth.help') }}</p>
                <button type="button" @click="connectGoogle" :disabled="oauthConnecting"
                  style="display:inline-flex; align-items:center; gap:8px; background:var(--accent, #2563eb); border:none; border-radius:10px; padding:10px 16px; font-size:13.5px; font-weight:650; color:#fff; cursor:pointer;">
                  <Spinner v-if="oauthConnecting" :size="15" />
                  <Icon v-else name="link" :size="16" />
                  {{ t('pipelinesUi.wizard.configure.sheetsOAuth.connect') }}
                </button>
                <p v-if="oauthError" style="color:var(--err); font-size:12px; margin:8px 0 0;">{{ oauthError }}</p>
                <p v-if="isEdit" style="font-size:12px; color:var(--ink-3); margin:8px 0 0;">{{ t('pipelinesUi.wizard.configure.sheetsOAuth.editNote') }}</p>
              </div>
            </div>

            <!-- Advanced: service account (open by default only when OAuth is unavailable) -->
            <details :open="oauthAvailable === false" style="border-top:1px solid var(--line); padding-top:12px;">
              <summary style="cursor:pointer; font-size:12.5px; font-weight:600; color:var(--ink-2); list-style:none;">
                {{ t('pipelinesUi.wizard.configure.sheetsOAuth.advancedToggle') }}
              </summary>
              <div style="margin-top:12px;">
                <div style="font-size:12.5px; color:var(--ink-2); margin-bottom:10px; line-height:1.55;">{{ t('pipelinesUi.wizard.configure.sheetsCredentialsHelp') }}</div>
                <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink-2); margin-bottom:6px;">{{ t('pipelines.sourceCredentials') }}</label>
                <textarea
                  v-model="form.credentialsRaw"
                  rows="4"
                  placeholder='{&quot;service_account_key&quot;: { … }}'
                  style="width:100%; padding:11px 13px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:'JetBrains Mono',monospace; font-size:13px; line-height:1.5; outline:none; resize:vertical;"
                ></textarea>
                <p v-if="fieldErrors.credentialsRaw" style="color:var(--err); font-size:12px; margin:6px 0 0;">{{ fieldErrors.credentialsRaw }}</p>
              </div>
            </details>
          </template>

          <!-- All other source types: raw credentials JSON -->
          <template v-else>
            <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink-2); margin-bottom:6px;">{{ t('pipelines.sourceCredentials') }}</label>
            <textarea
              v-model="form.credentialsRaw"
              rows="2"
              placeholder='{&quot;api_key&quot;: &quot;...&quot;}'
              style="width:100%; padding:11px 13px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:'JetBrains Mono',monospace; font-size:13px; line-height:1.5; outline:none; resize:vertical;"
            ></textarea>
            <p v-if="fieldErrors.credentialsRaw" style="color:var(--err); font-size:12px; margin:6px 0 0;">{{ fieldErrors.credentialsRaw }}</p>
          </template>
        </div>

        <!-- Destination & schedule -->
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); padding:22px; margin-bottom:16px;">
          <h2 style="margin:0 0 16px; font-size:16px; font-weight:700;">{{ t('pipelinesUi.wizard.configure.destinationTitle') }}</h2>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
            <div>
              <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink-2); margin-bottom:6px;">{{ t('pipelines.datasetName') }}</label>
              <input
                v-model="form.datasetName"
                :placeholder="t('pipelines.datasetNamePlaceholder')"
                style="width:100%; height:40px; padding:0 13px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:'JetBrains Mono',monospace; font-size:13px; outline:none;"
              />
            </div>
            <div>
              <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink-2); margin-bottom:6px;">{{ t('pipelines.writeDisposition') }}</label>
              <div style="position:relative;">
                <select
                  v-model="form.writeDisposition"
                  style="width:100%; height:40px; padding:0 13px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:inherit; font-size:14px; outline:none; appearance:none; cursor:pointer;"
                >
                  <option value="append">{{ t('pipelines.writeDispositions.append') }}</option>
                  <option value="replace">{{ t('pipelines.writeDispositions.replace') }}</option>
                  <option value="merge">{{ t('pipelines.writeDispositions.merge') }}</option>
                </select>
                <Icon name="chevronDown" :size="15" :style="{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--ink-3)' }" />
              </div>
            </div>

            <div v-if="form.writeDisposition === 'merge'">
              <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink-2); margin-bottom:6px;">{{ t('pipelines.mergeStrategy') }}</label>
              <div style="position:relative;">
                <select
                  v-model="form.mergeStrategy"
                  style="width:100%; height:40px; padding:0 13px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:inherit; font-size:14px; outline:none; appearance:none; cursor:pointer;"
                >
                  <option value="">{{ t('pipelines.mergeStrategies.default') }}</option>
                  <option value="upsert">{{ t('pipelines.mergeStrategies.upsert') }}</option>
                </select>
                <Icon name="chevronDown" :size="15" :style="{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--ink-3)' }" />
              </div>
            </div>

            <!-- file_upload runs manually: drop a file, run the pipeline -->
            <div v-if="source.schedulable" style="grid-column:1 / -1;">
              <label style="display:block; font-size:12.5px; font-weight:600; color:var(--ink-2); margin-bottom:6px;">{{ t('pipelines.schedule') }}</label>
              <div style="display:flex; align-items:center; gap:11px; flex-wrap:wrap;">
                <input
                  v-model="form.schedule"
                  :placeholder="t('pipelines.schedulePlaceholder')"
                  :style="{
                    width: '130px', height: '40px', padding: '0 13px', borderRadius: '10px',
                    border: `1px solid ${scheduleError ? 'var(--err)' : 'var(--line)'}`,
                    background: 'var(--surface-2)', color: 'var(--ink)',
                    fontFamily: `'JetBrains Mono',monospace`, fontSize: '13px', outline: 'none',
                  }"
                />
                <span :style="{ fontSize: '13px', color: scheduleError ? 'var(--err)' : 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: '7px' }">
                  <Icon
                    :name="scheduleError ? 'danger' : 'clock'"
                    :size="15"
                    :style="{ color: scheduleError ? 'var(--err)' : 'var(--accent)', flexShrink: 0 }"
                  />{{ scheduleHint }}
                </span>
              </div>
              <p v-if="scheduleNextRuns" style="margin:7px 0 0; font-size:12px; color:var(--ink-3);">{{ scheduleNextRuns }}</p>
            </div>
          </div>
        </div>

        <p v-if="formError" style="color:var(--err); font-size:13px; margin:0 0 14px;">{{ formError }}</p>

        <div style="display:flex; justify-content:space-between; align-items:center;">
          <button
            @click="isEdit ? router.push({ name: 'pipelines' }) : goBack()"
            style="display:flex; align-items:center; gap:7px; height:42px; padding:0 16px; border:1px solid var(--line); border-radius:11px; background:var(--surface); color:var(--ink-2); font-family:inherit; font-size:14px; font-weight:600; cursor:pointer;"
          >
            <Icon name="chevronLeft" :size="15" />{{ t('common.back') }}
          </button>
          <button
            @click="submit"
            :disabled="submitting"
            style="display:flex; align-items:center; gap:8px; height:42px; padding:0 20px; border:none; border-radius:11px; background:var(--accent); color:var(--accent-ink); font-family:inherit; font-size:14px; font-weight:600; cursor:pointer; box-shadow:var(--shadow);"
            :style="submitting ? 'opacity:.6; cursor:not-allowed;' : ''"
          >
            <Spinner v-if="submitting" :size="16" />
            <Icon v-else name="check" :size="16" />
            {{ isEdit ? t('pipelinesUi.wizard.configure.submitSave') : t('pipelinesUi.wizard.configure.submitCreate') }}
          </button>
        </div>
      </div>

      <!-- STEP 3: FILES (file_upload only, after the pipeline exists) -->
      <div
        v-else-if="current === STEP_FILES"
        style="background:var(--surface); border:1px solid var(--line); border-radius:18px; box-shadow:var(--shadow); padding:26px;"
      >
        <h2 style="margin:0 0 5px; font-size:18px; font-weight:700; letter-spacing:-.01em;">{{ t('pipelinesUi.fileDrop.title') }}</h2>
        <div style="font-size:13px; color:var(--ink-2); margin-bottom:18px;">{{ t('pipelinesUi.fileDrop.subtitle') }}</div>

        <FileDropManager :pipeline-id="createdPipelineId" @changed="uploadedCount = $event" />

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:22px;">
          <button
            @click="finishFiles"
            style="display:flex; align-items:center; gap:7px; height:42px; padding:0 16px; border:1px solid var(--line); border-radius:11px; background:var(--surface); color:var(--ink-2); font-family:inherit; font-size:14px; font-weight:600; cursor:pointer;"
          >{{ t('pipelinesUi.fileDrop.finish') }}</button>
          <button
            @click="runNow"
            :disabled="uploadedCount === 0 || runningNow"
            :style="{
              display: 'flex', alignItems: 'center', gap: '8px', height: '42px', padding: '0 20px',
              border: 'none', borderRadius: '11px', background: 'var(--accent)', color: 'var(--accent-ink)',
              fontFamily: 'inherit', fontSize: '14px', fontWeight: 600, boxShadow: 'var(--shadow)',
              opacity: (uploadedCount === 0 || runningNow) ? 0.5 : 1,
              cursor: (uploadedCount === 0 || runningNow) ? 'not-allowed' : 'pointer',
            }"
          >
            <Spinner v-if="runningNow" :size="16" />
            <Icon v-else name="play" :size="16" />
            {{ t('pipelinesUi.fileDrop.runNow') }}
          </button>
        </div>
      </div>

      <!-- Version history (edit mode; from the workspace's git repo) -->
      <div
        v-if="isEdit && current === STEP_CONFIGURE && versionsState === 'ready'"
        style="background:var(--surface); border:1px solid var(--line); border-radius:18px; box-shadow:var(--shadow); padding:22px 26px; margin-top:20px;"
      >
        <div style="display:flex; align-items:center; gap:9px; margin-bottom:4px;">
          <Icon name="clock" :size="16" :style="{ color: 'var(--ink-3)' }" />
          <h2 style="margin:0; font-size:16px; font-weight:700; letter-spacing:-.01em;">{{ t('pipelinesUi.versions.title') }}</h2>
        </div>
        <div style="font-size:12.5px; color:var(--ink-2); margin-bottom:14px;">{{ t('pipelinesUi.versions.subtitle') }}</div>
        <div
          v-for="(v, i) in versions"
          :key="v.sha"
          style="display:flex; align-items:center; gap:12px; padding:8px 2px; font-size:13px;"
          :style="i > 0 ? 'border-top:1px solid var(--line);' : ''"
        >
          <span style="color:var(--ink-2); flex:none; min-width:150px;">{{ formatVersionTime(v.date) }}</span>
          <span style="font-weight:600; flex:none; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ v.authorName }}</span>
          <span style="font-family:'JetBrains Mono',monospace; font-size:11.5px; color:var(--ink-3); flex:1;">{{ v.sha.slice(0, 8) }}</span>
          <span v-if="i === 0" style="font-size:11.5px; font-weight:700; color:var(--ok); flex:none;">{{ t('pipelinesUi.versions.current') }}</span>
          <button
            v-else
            @click="restoreVersion(v)"
            :disabled="restoringSha !== ''"
            style="display:flex; align-items:center; gap:6px; border:1px solid var(--line); background:var(--surface-2); color:var(--accent); border-radius:9px; height:30px; padding:0 12px; font-family:inherit; font-size:12.5px; font-weight:700; cursor:pointer; flex:none;"
            :style="restoringSha !== '' ? 'opacity:.5; cursor:not-allowed;' : ''"
          >
            <Spinner v-if="restoringSha === v.sha" :size="13" />
            {{ t('pipelinesUi.versions.restore') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
