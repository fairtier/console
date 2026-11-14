<script setup lang="ts">
// Create/edit form for one workflow: name, description, schedule, enabled and
// the ordered step builder. Saves through WorkflowService itself and emits the
// stored workflow; the list owns everything else.
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ConnectError, Code } from '@connectrpc/connect'
import { workflowClient } from '../../api'
import { errorMessage, fieldViolations } from '../../api/errors'
import type { Workflow } from '../../api/gen/workflow_pb.js'
import type { Pipeline } from '../../api/gen/pipeline_pb.js'
import type { Transformation } from '../../api/gen/transformation_pb.js'
import Icon from '../ui/Icon.vue'
import Select from '../ui/Select.vue'
import Spinner from '../ui/Spinner.vue'
import Toggle from '../ui/Toggle.vue'
import ScheduleField from '../ui/ScheduleField.vue'
import StepKindBadge from './StepKindBadge.vue'
import { useToast } from '../../composables/useToast'
import { useCronText } from '../../composables/useCronText'
import type { SelectOption } from '../../lib/select'
import {
  MAX_WORKFLOW_STEPS,
  addStep,
  canAddStep,
  moveStep,
  parseStepKey,
  removeStep,
  stepKey,
  stepWarnings,
  usedStepKeys,
  violationTarget,
  type FormField,
  type StepDraft,
  type StepWarning,
} from '../../lib/workflow'

const props = defineProps<{
  /** The workflow being edited; null creates a new one. */
  workflow: Workflow | null
  pipelines: Pipeline[]
  transformations: Transformation[]
}>()

const emit = defineEmits<{
  saved: [workflow: Workflow]
  cancel: []
}>()

const { t } = useI18n()
const toast = useToast()
const cronText = useCronText()

const form = reactive({
  name: props.workflow?.name ?? '',
  description: props.workflow?.description ?? '',
  schedule: props.workflow?.schedule ?? '',
  enabled: props.workflow?.enabled ?? true,
})
const steps = ref<StepDraft[]>(
  (props.workflow?.steps ?? []).map((s) => ({
    kind: s.kind === 'transformation' ? 'transformation' : 'pipeline',
    refId: s.refId,
  })),
)
const saving = ref(false)

// Server-side validation, placed on the field it names (see violationTarget).
const fieldErrors = reactive<Record<FormField, string>>({ name: '', description: '', schedule: '', steps: '' })
const stepErrors = ref<Record<number, string>>({})
watch(() => form.name, () => (fieldErrors.name = ''))
watch(() => form.description, () => (fieldErrors.description = ''))
watch(() => form.schedule, () => (fieldErrors.schedule = ''))
watch(steps, () => {
  fieldErrors.steps = ''
  stepErrors.value = {}
}, { deep: true })

// --- Step targets -------------------------------------------------------------

// Names the definition carried when it was loaded: a target deleted since the
// lists were fetched still shows what it was.
const loadedNames = new Map((props.workflow?.steps ?? []).map((s) => [`${s.kind}:${s.refId}`, s.name]))

function targetName(step: StepDraft): string {
  const list = step.kind === 'pipeline' ? props.pipelines : props.transformations
  return list.find((x) => x.id === step.refId)?.name ?? loadedNames.get(stepKey(step)) ?? step.refId
}
function targetSchedule(step: StepDraft): string {
  const list = step.kind === 'pipeline' ? props.pipelines : props.transformations
  return list.find((x) => x.id === step.refId)?.schedule ?? ''
}

const used = computed(() => usedStepKeys(steps.value))
const full = computed(() => !canAddStep(steps.value))

const pickerOptions = computed<SelectOption<string>[]>(() => {
  const opt = (kind: 'pipeline' | 'transformation', id: string, name: string, group: string) => {
    const key = stepKey({ kind, refId: id })
    const taken = used.value.has(key)
    return { value: key, label: taken ? `${name} — ${t('workflowsUi.form.alreadyUsed')}` : name, disabled: taken, group }
  }
  return [
    ...props.pipelines.map((p) => opt('pipeline', p.id, p.name, t('workflowsUi.form.groupPipelines'))),
    ...props.transformations.map((x) => opt('transformation', x.id, x.name, t('workflowsUi.form.groupTransformations'))),
  ]
})
// The picker is an "add" action, not a field: choosing appends the step and
// the control goes back to its placeholder.
const picked = ref('')
watch(picked, (key) => {
  if (!key) return
  const step = parseStepKey(key)
  if (step) steps.value = addStep(steps.value, step)
  picked.value = ''
})

function move(i: number, delta: -1 | 1) {
  steps.value = moveStep(steps.value, i, delta)
}
function remove(i: number) {
  steps.value = removeStep(steps.value, i)
}

// --- Warnings -------------------------------------------------------------------

const warnings = computed(() => stepWarnings(steps.value, props.pipelines, props.transformations))

function warningText(step: StepDraft, w: StepWarning): string {
  switch (w.type) {
    case 'ownSchedule':
      return t(step.kind === 'pipeline' ? 'workflowsUi.warn.ownSchedulePipeline' : 'workflowsUi.warn.ownScheduleTransformation', {
        schedule: w.schedule,
        human: cronText.summarize(w.schedule) || w.schedule,
      })
    case 'triggerAfter':
      return t('workflowsUi.warn.triggerAfter', { pipeline: w.pipelineName, step: w.pipelineStep + 1 })
    case 'disabled':
      return t(step.kind === 'pipeline' ? 'workflowsUi.warn.disabledPipeline' : 'workflowsUi.warn.disabledTransformation')
    case 'missing':
      return t('workflowsUi.warn.missing')
  }
}
// Where the fix lives: the pipeline's edit page, or the transformations list
// opened on that transformation. A new tab, so the half-built workflow stays.
function fixLink(step: StepDraft) {
  return step.kind === 'pipeline'
    ? { name: 'pipeline-new', query: { id: step.refId } }
    : { name: 'transformations', query: { transformation: step.refId } }
}

// --- Save -----------------------------------------------------------------------

const scheduleInvalid = computed(() => !!cronText.error(form.schedule))
const submitDisabled = computed(
  () => saving.value || !form.name.trim() || steps.value.length === 0 || scheduleInvalid.value,
)

function applyServerErrors(err: unknown) {
  let placed = false
  for (const v of fieldViolations(err)) {
    const target = violationTarget(v.field)
    if (!target) continue
    placed = true
    if ('step' in target) stepErrors.value = { ...stepErrors.value, [target.step]: v.description }
    else if (!fieldErrors[target.field]) fieldErrors[target.field] = v.description
  }
  // A duplicate name comes back as AlreadyExists without a field: it can only
  // be the name.
  if (!placed && err instanceof ConnectError && err.code === Code.AlreadyExists) {
    fieldErrors.name = err.rawMessage
  }
}

async function submit() {
  if (submitDisabled.value) return
  saving.value = true
  const body = {
    name: form.name.trim(),
    description: form.description.trim(),
    schedule: form.schedule.trim(),
    steps: steps.value.map((s) => ({ kind: s.kind, refId: s.refId })),
  }
  try {
    let saved: Workflow | undefined
    if (props.workflow) {
      const resp = await workflowClient.updateWorkflow({ id: props.workflow.id, enabled: form.enabled, ...body })
      saved = resp.workflow
      toast.success(t('workflowsUi.toast.updated'))
    } else {
      const resp = await workflowClient.createWorkflow(body)
      saved = resp.workflow
      toast.success(t('workflowsUi.toast.created'))
    }
    if (saved) emit('saved', saved)
  } catch (err) {
    applyServerErrors(err)
    toast.error(errorMessage(err, t('workflowsUi.toast.saveFailed')))
  } finally {
    saving.value = false
  }
}

const inputStyle = (error: string) => ({
  width: '100%', height: '40px', padding: '0 13px', borderRadius: '11px',
  border: `1px solid ${error ? 'var(--err)' : 'var(--line)'}`,
  background: 'var(--surface-2)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: '14px', outline: 'none',
})
const iconBtn = (disabled: boolean) => ({
  width: '28px', height: '28px', border: 'none', borderRadius: '8px', background: 'transparent',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: disabled ? 'var(--line)' : 'var(--ink-3)', cursor: disabled ? 'default' : 'pointer',
})
</script>

<template>
  <div
    data-testid="workflow-editor"
    style="background:var(--surface); border:1px solid var(--line); border-radius:18px; box-shadow:var(--shadow); padding:26px; margin-bottom:22px;"
  >
    <h2 style="margin:0 0 16px; font-size:18px; font-weight:700; letter-spacing:-.01em;">
      {{ workflow ? t('workflowsUi.form.editTitle') : t('workflowsUi.form.createTitle') }}
    </h2>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div>
        <label style="display:block;">
          <span style="display:block; font-size:12.5px; font-weight:700; color:var(--ink-2); margin-bottom:6px;">{{ t('workflowsUi.form.name') }}</span>
          <input
            v-model="form.name"
            type="text"
            :placeholder="t('workflowsUi.form.namePlaceholder')"
            :aria-invalid="!!fieldErrors.name"
            :style="inputStyle(fieldErrors.name)"
          />
        </label>
        <span v-if="fieldErrors.name" style="display:block; margin-top:6px; font-size:12px; color:var(--err);">{{ fieldErrors.name }}</span>
      </div>
      <div>
        <ScheduleField
          v-model="form.schedule"
          :label="t('workflowsUi.form.schedule')"
          :placeholder="t('workflowsUi.form.schedulePlaceholder')"
          :empty-hint="t('workflowsUi.form.scheduleManual')"
          :error="fieldErrors.schedule"
        />
      </div>
    </div>

    <label style="display:block; margin-top:14px;">
      <span style="display:block; font-size:12.5px; font-weight:700; color:var(--ink-2); margin-bottom:6px;">{{ t('workflowsUi.form.description') }}</span>
      <textarea
        v-model="form.description"
        rows="2"
        :placeholder="t('workflowsUi.form.descriptionPlaceholder')"
        :style="{ ...inputStyle(fieldErrors.description), height: 'auto', padding: '10px 13px', lineHeight: 1.5, resize: 'vertical' }"
      ></textarea>
    </label>
    <span v-if="fieldErrors.description" style="display:block; margin-top:6px; font-size:12px; color:var(--err);">{{ fieldErrors.description }}</span>

    <div style="display:flex; align-items:center; gap:12px; margin-top:14px;">
      <template v-if="workflow">
        <Toggle v-model="form.enabled" :aria-label="t('workflowsUi.form.enabled')" />
        <div>
          <div style="font-size:13px; font-weight:700; color:var(--ink-2);">{{ t('workflowsUi.form.enabled') }}</div>
          <div style="font-size:12px; color:var(--ink-3);">{{ t('workflowsUi.form.enabledHint') }}</div>
        </div>
      </template>
      <div v-else style="font-size:12px; color:var(--ink-3);">{{ t('workflowsUi.form.enabledOnCreate') }}</div>
    </div>

    <!-- Step builder -->
    <div style="margin-top:20px;">
      <div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:4px;">
        <span style="font-size:12.5px; font-weight:700; color:var(--ink-2);">{{ t('workflowsUi.form.steps') }}</span>
        <span style="font-size:11.5px; color:var(--ink-3);">{{ steps.length }} / {{ MAX_WORKFLOW_STEPS }}</span>
      </div>
      <div style="font-size:12px; color:var(--ink-3); margin-bottom:10px; line-height:1.5;">{{ t('workflowsUi.form.stepsHint') }}</div>

      <div
        :style="{ border: `1px solid ${fieldErrors.steps ? 'var(--err)' : 'var(--line)'}`, borderRadius: '13px', overflow: 'hidden', background: 'var(--surface-2)' }"
      >
        <div v-if="steps.length === 0" style="padding:16px; font-size:13px; color:var(--ink-3);">{{ t('workflowsUi.form.stepsEmpty') }}</div>
        <div
          v-for="(step, i) in steps"
          :key="stepKey(step)"
          data-testid="workflow-step"
          :style="{ padding: '10px 12px', borderTop: i === 0 ? 'none' : '1px solid var(--line-2)' }"
        >
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="width:20px; text-align:right; font-size:12px; font-weight:700; color:var(--ink-3); flex:none;">{{ i + 1 }}</span>
            <StepKindBadge :kind="step.kind" :size="26" />
            <div style="flex:1; min-width:0;">
              <div style="font-weight:600; font-size:13.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ targetName(step) }}</div>
              <div style="font-size:11.5px; color:var(--ink-3);">
                {{ step.kind === 'pipeline' ? t('workflowsUi.kind.pipeline') : t('workflowsUi.kind.transformation') }}
                <template v-if="targetSchedule(step)"> · {{ cronText.summarize(targetSchedule(step)) || targetSchedule(step) }}</template>
              </div>
            </div>
            <button type="button" :title="t('workflowsUi.form.moveUp')" :aria-label="t('workflowsUi.form.moveUp')" :disabled="i === 0" :style="iconBtn(i === 0)" @click="move(i, -1)">
              <Icon name="chevronUp" :size="16" />
            </button>
            <button type="button" :title="t('workflowsUi.form.moveDown')" :aria-label="t('workflowsUi.form.moveDown')" :disabled="i === steps.length - 1" :style="iconBtn(i === steps.length - 1)" @click="move(i, 1)">
              <Icon name="chevronDown" :size="16" />
            </button>
            <button type="button" :title="t('workflowsUi.form.remove')" :aria-label="t('workflowsUi.form.remove')" :style="iconBtn(false)" @click="remove(i)">
              <Icon name="x" :size="15" />
            </button>
          </div>

          <div v-if="stepErrors[i]" style="margin:6px 0 0 30px; font-size:12px; color:var(--err);">{{ stepErrors[i] }}</div>

          <div
            v-for="(w, wi) in warnings[i] ?? []"
            :key="wi"
            data-testid="workflow-step-warning"
            :style="{
              display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '8px 0 0 30px', padding: '8px 11px',
              borderRadius: '10px', fontSize: '12.5px', lineHeight: 1.5,
              background: w.type === 'missing' ? 'var(--err-soft)' : 'var(--warn-soft)',
              color: w.type === 'missing' ? 'var(--err-ink)' : 'var(--warn-ink)',
            }"
          >
            <Icon name="danger" :size="14" :style="{ flex: 'none', marginTop: '2px' }" />
            <div>
              {{ warningText(step, w) }}
              <RouterLink
                v-if="w.type !== 'missing'"
                :to="fixLink(step)"
                target="_blank"
                style="margin-left:4px; font-weight:700; color:inherit; text-decoration:underline; white-space:nowrap;"
              >{{ step.kind === 'pipeline' ? t('workflowsUi.warn.openPipeline') : t('workflowsUi.warn.openTransformation') }}</RouterLink>
            </div>
          </div>
        </div>
      </div>
      <span v-if="fieldErrors.steps" style="display:block; margin-top:6px; font-size:12px; color:var(--err);">{{ fieldErrors.steps }}</span>

      <div style="margin-top:10px; max-width:380px;">
        <Select
          v-model="picked"
          :options="pickerOptions"
          :placeholder="t('workflowsUi.form.addStep')"
          :aria-label="t('workflowsUi.form.addStep')"
          :disabled="full"
        />
        <span v-if="full" style="display:block; margin-top:6px; font-size:12px; color:var(--ink-3);">{{ t('workflowsUi.form.stepsFull', { max: MAX_WORKFLOW_STEPS }) }}</span>
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; align-items:center; gap:12px; margin-top:22px;">
      <button
        type="button"
        @click="emit('cancel')"
        style="border:none; background:transparent; color:var(--ink-2); font-family:inherit; font-size:13px; font-weight:700; cursor:pointer;"
      >{{ t('workflowsUi.form.cancel') }}</button>
      <button
        type="button"
        @click="submit"
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
        {{ workflow ? t('workflowsUi.form.save') : t('workflowsUi.form.create') }}
      </button>
    </div>
  </div>
</template>
