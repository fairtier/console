<script setup lang="ts">
import { ref, computed, reactive, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { pipelineClient } from '../api'
import { errorMessage, fieldViolations } from '../api/errors'
import Icon from '../components/ui/Icon.vue'
import Stepper from '../components/ui/Stepper.vue'
import Spinner from '../components/ui/Spinner.vue'
import DescribeStep from '../components/pipeline/DescribeStep.vue'
import DestinationCard from '../components/pipeline/DestinationCard.vue'
import FilesStep from '../components/pipeline/FilesStep.vue'
import CredentialsCard from '../components/pipeline/CredentialsCard.vue'
import SourceCard from '../components/pipeline/SourceCard.vue'
import VersionHistory from '../components/pipeline/VersionHistory.vue'
import { useToast } from '../composables/useToast'
import { useCronText } from '../composables/useCronText'
import { useGoogleConnect } from '../composables/useGoogleConnect'
import {
    buildSourceConfig,
    formFieldFor,
    isValidJson,
    unpackSourceConfig,
} from '../lib/pipelineConfig'
import { SOURCES, sourceFor, type PipelineForm, type RestResource } from '../lib/pipelineSources'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

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

// --- Google Sheets "Sign in with Google" (src/composables/useGoogleConnect) ---
// The probe, the consent popup, promoting the grant to a workspace connection
// and the connection picker all live in the composable, which writes into the
// form: a connection, a one-shot grant and a pasted service-account key are
// three ways to say the same thing, so setting one has to clear the other two.
const googleOAuth = computed(() => source.value.googleOAuth)
const google = useGoogleConnect(form, googleOAuth, isEdit)

// The pipeline's stored credential state, as the server reports it on edit.
// attachedConnectionId is '' when the pipeline holds its own credentials.
const attachedConnectionId = ref('')
const hasStoredCredentials = ref(false)

// Set once a file_upload pipeline exists, which is what opens the Files step.
const createdPipelineId = ref('')

// Selecting a source type applies whatever that type declares as its
// defaults (file_upload: no credentials, no schedule, replace — the platform
// injects the storage credentials, and the pipeline runs when the user hits
// run after dropping a file). Create only: an edit is already configured.
watch(() => form.sourceType, (type) => {
  const next = sourceFor(type)
  if (next.defaults && !isEdit.value) Object.assign(form, next.defaults)
})

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

// --- Schedule validity (src/lib/cron.ts) ---
// A malformed cron would be accepted by the API and then silently never fire
// on the box, so validate() has to see it. The spelled-out hint and the
// next-runs preview belong to the field and live with it in DestinationCard.
const cronText = useCronText()
const scheduleError = computed(() => cronText.error(form.schedule))

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
  }
})

function goConfigure() {
  current.value = STEP_CONFIGURE
}

// Pre-fill the Configure form from a drafted CreatePipelineRequest. Shares
// applySourceConfig with loadForEdit, so a draft and an edit land on the same
// form by construction.
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
  google.disconnect()
  applySourceConfig(form.sourceType, d.sourceConfig)
}

function goBack() {
  current.value = Math.max(STEP_DESCRIBE, current.value - 1)
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
      <DescribeStep
        v-if="current === STEP_DESCRIBE"
        @drafted="applyDraft"
        @configure="goConfigure"
      />

      <!-- STEP 2: CONFIGURE -->
      <div v-else-if="current === STEP_CONFIGURE">
        <SourceCard
          v-model:advanced-json="advancedJson"
          :form="form"
          :source="source"
          :options="sourceOptions"
          :field-errors="fieldErrors"
          :is-edit="isEdit"
          :pipeline-id="editId"
        />

        <!-- Credentials. file_upload needs none: the platform uses the
             workspace's own storage credentials. -->
        <CredentialsCard
          v-if="source.credentials"
          :form="form"
          :uses-google="source.googleOAuth"
          :google="google"
          :is-edit="isEdit"
          :attached-connection-id="attachedConnectionId"
          :has-stored-credentials="hasStoredCredentials"
          :field-errors="fieldErrors"
        />

        <DestinationCard :form="form" :schedulable="source.schedulable" />

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
      <FilesStep
        v-else-if="current === STEP_FILES"
        :pipeline-id="createdPipelineId"
        @done="router.push({ name: 'pipelines' })"
      />

      <!-- Version history: the component hides itself when the workspace has
           no git mirror to read (see VersionHistory.vue). -->
      <VersionHistory
        v-if="isEdit && current === STEP_CONFIGURE"
        :pipeline-id="editId"
        @restored="loadForEdit"
      />
    </template>
  </div>
</template>
