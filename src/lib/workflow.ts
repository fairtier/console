// The logic behind the Workflows view, kept out of the SFCs so it is testable:
// the step builder's list operations, the one-line chain summary, the editor's
// double-run warnings, run-status helpers and where a server FieldViolation
// belongs on the form.
//
// A workflow is a linear list of steps, each running an existing pipeline or
// transformation (workspace-api `workflow.v1`): 1..MAX_WORKFLOW_STEPS steps, a
// target at most once, first failure stops the run and skips the rest.

export type StepKind = 'pipeline' | 'transformation'

/** Mirrors the server's MaxWorkflowSteps. */
export const MAX_WORKFLOW_STEPS = 20

/** One step as the editor holds it — what Create/UpdateWorkflow read. */
export interface StepDraft {
    kind: StepKind
    refId: string
}

/** The fields of a pipeline the editor needs (a subset of `Pipeline`). */
export interface PipelineRef {
    id: string
    name: string
    schedule: string
    enabled: boolean
}

/** The fields of a transformation the editor needs (a subset of `Transformation`). */
export interface TransformationRef extends PipelineRef {
    triggerAfterPipelineId: string
}

// --- Step builder --------------------------------------------------------------

/** Stable identity of a step target: a target may appear once per workflow. */
export function stepKey(step: StepDraft): string {
    return `${step.kind}:${step.refId}`
}

/** Parses a picker value produced by stepKey back into a draft. */
export function parseStepKey(key: string): StepDraft | null {
    const i = key.indexOf(':')
    if (i < 0) return null
    const kind = key.slice(0, i)
    const refId = key.slice(i + 1)
    if ((kind !== 'pipeline' && kind !== 'transformation') || !refId) return null
    return { kind, refId }
}

/** The step keys already in the list — the picker disables these. */
export function usedStepKeys(steps: readonly StepDraft[]): Set<string> {
    return new Set(steps.map(stepKey))
}

export function canAddStep(steps: readonly StepDraft[]): boolean {
    return steps.length < MAX_WORKFLOW_STEPS
}

/**
 * Appends a step. A target already present, or a full list, returns the list
 * unchanged — the server would refuse either, so the builder never builds it.
 */
export function addStep(steps: readonly StepDraft[], step: StepDraft): StepDraft[] {
    if (!canAddStep(steps) || usedStepKeys(steps).has(stepKey(step))) return [...steps]
    return [...steps, { ...step }]
}

/** Removes the step at index; an out-of-range index is a no-op. */
export function removeStep(steps: readonly StepDraft[], index: number): StepDraft[] {
    if (index < 0 || index >= steps.length) return [...steps]
    return steps.filter((_, i) => i !== index)
}

/**
 * Moves the step at index one place up (-1) or down (+1). Moving past either
 * end is a no-op, so the up button on the first step needs no special case.
 */
export function moveStep(steps: readonly StepDraft[], index: number, delta: -1 | 1): StepDraft[] {
    const target = index + delta
    if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) return [...steps]
    const next = [...steps]
    const a = next[index]!
    next[index] = next[target]!
    next[target] = a
    return next
}

// --- Chain summary -----------------------------------------------------------

export const CHAIN_SEPARATOR = ' → '

/**
 * One line of step names for a list row: `orders → stg_orders → marts`.
 * Past `max` names the tail collapses to `+N`, so a long workflow still reads
 * as a chain rather than an ellipsis that hides how long it is.
 */
export function chainSummary(names: readonly string[], max = 4): string {
    if (names.length <= max) return names.join(CHAIN_SEPARATOR)
    const shown = names.slice(0, Math.max(1, max - 1))
    return `${shown.join(CHAIN_SEPARATOR)}${CHAIN_SEPARATOR}+${names.length - shown.length}`
}

// --- Editor warnings ---------------------------------------------------------

export type StepWarning =
    /** The target also runs on its own cron: it will run twice. */
    | { type: 'ownSchedule'; schedule: string }
    /** A transformation chained after a pipeline that is also a step: it will run twice. */
    | { type: 'triggerAfter'; pipelineId: string; pipelineName: string; pipelineStep: number }
    /** A disabled target fails its step without running. */
    | { type: 'disabled' }
    /** The target no longer exists (deleted since the list was loaded). */
    | { type: 'missing' }

/**
 * The warnings for each step, index-aligned with `steps`. None of these block
 * saving — the server accepts all of them — but each one is a run the person
 * did not mean to get (or a step that cannot succeed), so the editor says so
 * next to the step.
 */
export function stepWarnings(
    steps: readonly StepDraft[],
    pipelines: readonly PipelineRef[],
    transformations: readonly TransformationRef[],
): StepWarning[][] {
    const pById = new Map(pipelines.map((p) => [p.id, p]))
    const tById = new Map(transformations.map((t) => [t.id, t]))
    const pipelineStep = new Map<string, number>()
    steps.forEach((s, i) => {
        if (s.kind === 'pipeline') pipelineStep.set(s.refId, i)
    })

    return steps.map((s) => {
        const target = s.kind === 'pipeline' ? pById.get(s.refId) : tById.get(s.refId)
        if (!target) return [{ type: 'missing' }]
        const out: StepWarning[] = []
        if (!target.enabled) out.push({ type: 'disabled' })
        if (target.schedule.trim()) out.push({ type: 'ownSchedule', schedule: target.schedule.trim() })
        if (s.kind === 'transformation') {
            const after = (target as TransformationRef).triggerAfterPipelineId
            const at = after ? pipelineStep.get(after) : undefined
            if (after && at !== undefined) {
                out.push({
                    type: 'triggerAfter',
                    pipelineId: after,
                    pipelineName: pById.get(after)?.name ?? '',
                    pipelineStep: at,
                })
            }
        }
        return out
    })
}

// --- Runs --------------------------------------------------------------------

/** A run (or a workflow's last run) that is still going: worth polling for. */
export function isActiveStatus(status: string): boolean {
    return status === 'pending' || status === 'running'
}

/** The fields of a step run the helpers below read (a subset of `WorkflowStepRun`). */
export interface StepRunLike {
    position: number
    name: string
    status: string
    errorMessage: string
}

/** The step that failed a run, if any — the one thing a failed row must say. */
export function failedStep<T extends StepRunLike>(stepRuns: readonly T[]): T | undefined {
    return stepRuns.find((s) => s.status === 'failed')
}

/** First line of an error, for a one-line row; the expanded view shows all of it. */
export function firstLine(text: string): string {
    const line = text.trim().split('\n', 1)[0] ?? ''
    return line.trim()
}

/**
 * Elapsed time between two RFC 3339 stamps, compact (`850ms`, `42s`,
 * `3m 05s`, `1h 02m`). An unfinished span runs to `now`; an unstarted or
 * unparseable one is empty.
 */
export function formatDuration(startedAt: string, completedAt: string, now: number = Date.now()): string {
    if (!startedAt) return ''
    const start = new Date(startedAt).getTime()
    const end = completedAt ? new Date(completedAt).getTime() : now
    if (Number.isNaN(start) || Number.isNaN(end)) return ''
    const ms = Math.max(0, end - start)
    if (ms < 1000) return `${ms}ms`
    const sec = Math.floor(ms / 1000)
    if (sec < 60) return `${sec}s`
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min}m ${String(sec % 60).padStart(2, '0')}s`
    const hr = Math.floor(min / 60)
    return `${hr}h ${String(min % 60).padStart(2, '0')}m`
}

/** Relative time ("5 minutes ago") — the same buckets the other run lists use. */
export function formatRelative(iso: string, now: number = Date.now(), locale?: string): string {
    if (!iso) return ''
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return ''
    const sec = Math.round((now - then) / 1000)
    const min = Math.round(sec / 60)
    const hr = Math.round(min / 60)
    const day = Math.round(hr / 24)
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    if (Math.abs(sec) < 60) return rtf.format(-sec, 'second')
    if (Math.abs(min) < 60) return rtf.format(-min, 'minute')
    if (Math.abs(hr) < 24) return rtf.format(-hr, 'hour')
    return rtf.format(-day, 'day')
}

/**
 * Merges a freshly polled first page into the runs already shown: polled runs
 * replace their stale copies and new ones go on top, while older pages the
 * person loaded with "load more" stay where they are. Newest first throughout.
 */
export function mergeRuns<T extends { id: string }>(shown: readonly T[], fresh: readonly T[]): T[] {
    const freshIds = new Set(fresh.map((r) => r.id))
    return [...fresh, ...shown.filter((r) => !freshIds.has(r.id))]
}

// --- Server validation -------------------------------------------------------

export type FormField = 'name' | 'description' | 'schedule' | 'steps'

/**
 * Where a server FieldViolation goes on the form. The server names fields in
 * proto terms: `name`, `description`, `schedule`, `steps`, and
 * `steps[<i>].ref_id` / `steps[<i>].kind` for one step.
 */
export function violationTarget(field: string): { field: FormField } | { step: number } | null {
    const m = /^steps\[(\d+)\]/.exec(field)
    if (m) return { step: Number(m[1]) }
    if (field === 'name' || field === 'description' || field === 'schedule' || field === 'steps') {
        return { field }
    }
    return null
}
