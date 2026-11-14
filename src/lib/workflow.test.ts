import { describe, expect, test } from 'bun:test'
import {
    MAX_WORKFLOW_STEPS,
    addStep,
    canAddStep,
    chainSummary,
    failedStep,
    firstLine,
    formatDuration,
    mergeRuns,
    moveStep,
    parseStepKey,
    removeStep,
    stepKey,
    stepWarnings,
    usedStepKeys,
    violationTarget,
    type StepDraft,
} from './workflow'

const p = (refId: string): StepDraft => ({ kind: 'pipeline', refId })
const tr = (refId: string): StepDraft => ({ kind: 'transformation', refId })

describe('step builder', () => {
    test('stepKey round-trips through parseStepKey', () => {
        expect(parseStepKey(stepKey(p('a-1')))).toEqual(p('a-1'))
        expect(parseStepKey(stepKey(tr('b')))).toEqual(tr('b'))
        expect(parseStepKey('')).toBeNull()
        expect(parseStepKey('pipeline:')).toBeNull()
        expect(parseStepKey('model:x')).toBeNull()
    })

    test('a pipeline and a transformation with the same id are different targets', () => {
        const steps = addStep([p('x')], tr('x'))
        expect(steps).toHaveLength(2)
        expect(usedStepKeys(steps)).toEqual(new Set(['pipeline:x', 'transformation:x']))
    })

    test('adding a target twice is a no-op', () => {
        const steps = addStep([p('a'), tr('b')], p('a'))
        expect(steps).toEqual([p('a'), tr('b')])
    })

    test('the list stops at the server maximum', () => {
        let steps: StepDraft[] = []
        for (let i = 0; i < MAX_WORKFLOW_STEPS + 3; i++) steps = addStep(steps, p(`p${i}`))
        expect(steps).toHaveLength(MAX_WORKFLOW_STEPS)
        expect(canAddStep(steps)).toBe(false)
    })

    test('addStep does not mutate its input', () => {
        const steps = [p('a')]
        addStep(steps, p('b'))
        expect(steps).toEqual([p('a')])
    })

    test('moveStep swaps neighbours and ignores moves past either end', () => {
        const steps = [p('a'), p('b'), p('c')]
        expect(moveStep(steps, 1, -1)).toEqual([p('b'), p('a'), p('c')])
        expect(moveStep(steps, 1, 1)).toEqual([p('a'), p('c'), p('b')])
        expect(moveStep(steps, 0, -1)).toEqual(steps)
        expect(moveStep(steps, 2, 1)).toEqual(steps)
        expect(moveStep(steps, 7, 1)).toEqual(steps)
        expect(steps).toEqual([p('a'), p('b'), p('c')])
    })

    test('removeStep drops one index', () => {
        expect(removeStep([p('a'), p('b'), p('c')], 1)).toEqual([p('a'), p('c')])
        expect(removeStep([p('a')], 3)).toEqual([p('a')])
    })
})

describe('chainSummary', () => {
    test('joins names with arrows', () => {
        expect(chainSummary(['orders', 'stg_orders', 'marts'])).toBe('orders → stg_orders → marts')
        expect(chainSummary(['only'])).toBe('only')
        expect(chainSummary([])).toBe('')
    })

    test('collapses a long tail into a count', () => {
        expect(chainSummary(['a', 'b', 'c', 'd'])).toBe('a → b → c → d')
        expect(chainSummary(['a', 'b', 'c', 'd', 'e', 'f'])).toBe('a → b → c → +3')
        expect(chainSummary(['a', 'b', 'c'], 2)).toBe('a → +2')
        expect(chainSummary(['a', 'b'], 1)).toBe('a → +1')
    })
})

describe('stepWarnings', () => {
    const pipelines = [
        { id: 'p1', name: 'orders', schedule: '0 6 * * *', enabled: true },
        { id: 'p2', name: 'customers', schedule: '', enabled: true },
        { id: 'p3', name: 'paused', schedule: '', enabled: false },
    ]
    const transformations = [
        { id: 't1', name: 'stg_orders', schedule: '', enabled: true, triggerAfterPipelineId: 'p1' },
        { id: 't2', name: 'marts', schedule: '@daily', enabled: true, triggerAfterPipelineId: 'p9' },
    ]

    test('a clean step has no warnings', () => {
        expect(stepWarnings([p('p2')], pipelines, transformations)).toEqual([[]])
    })

    test('a target with its own schedule will run twice', () => {
        expect(stepWarnings([p('p1')], pipelines, transformations)).toEqual([
            [{ type: 'ownSchedule', schedule: '0 6 * * *' }],
        ])
    })

    test('trigger_after_pipeline only warns when that pipeline is in the workflow', () => {
        // Alone: t1 waits for p1, which is not a step — nothing doubles up.
        expect(stepWarnings([tr('t1')], pipelines, transformations)).toEqual([[]])
        // With p1 as step 1, t1 runs after p1 finishes AND as its own step.
        const w = stepWarnings([p('p2'), p('p1'), tr('t1')], pipelines, transformations)
        expect(w[2]).toEqual([{ type: 'triggerAfter', pipelineId: 'p1', pipelineName: 'orders', pipelineStep: 1 }])
        // The order does not matter: it is a double run either way.
        expect(stepWarnings([tr('t1'), p('p1')], pipelines, transformations)[0]).toEqual([
            { type: 'triggerAfter', pipelineId: 'p1', pipelineName: 'orders', pipelineStep: 1 },
        ])
    })

    test('disabled and missing targets are flagged', () => {
        expect(stepWarnings([p('p3'), tr('gone')], pipelines, transformations)).toEqual([
            [{ type: 'disabled' }],
            [{ type: 'missing' }],
        ])
    })

    test('warnings stack', () => {
        expect(stepWarnings([tr('t2')], pipelines, transformations)).toEqual([
            [{ type: 'ownSchedule', schedule: '@daily' }],
        ])
    })
})

describe('runs', () => {
    test('failedStep finds the step that stopped the run', () => {
        const steps = [
            { position: 0, name: 'orders', status: 'success', errorMessage: '' },
            { position: 1, name: 'stg', status: 'failed', errorMessage: 'boom' },
            { position: 2, name: 'marts', status: 'skipped', errorMessage: '' },
        ]
        expect(failedStep(steps)?.name).toBe('stg')
        expect(failedStep(steps.slice(0, 1))).toBeUndefined()
    })

    test('firstLine trims to the first line', () => {
        expect(firstLine('  Database Error\n  in model x\n')).toBe('Database Error')
        expect(firstLine('')).toBe('')
    })

    test('formatDuration buckets', () => {
        const t0 = '2026-01-01T00:00:00Z'
        expect(formatDuration(t0, '2026-01-01T00:00:00.250Z')).toBe('250ms')
        expect(formatDuration(t0, '2026-01-01T00:00:42Z')).toBe('42s')
        expect(formatDuration(t0, '2026-01-01T00:03:05Z')).toBe('3m 05s')
        expect(formatDuration(t0, '2026-01-01T01:02:30Z')).toBe('1h 02m')
        expect(formatDuration('', '')).toBe('')
        expect(formatDuration('nope', '')).toBe('')
        // Still running: measured to now.
        expect(formatDuration(t0, '', new Date('2026-01-01T00:00:10Z').getTime())).toBe('10s')
    })

    test('mergeRuns puts polled runs on top and keeps older pages', () => {
        const shown = [
            { id: 'r3', status: 'running' },
            { id: 'r2', status: 'success' },
            { id: 'r1', status: 'failed' },
        ]
        const fresh = [
            { id: 'r4', status: 'pending' },
            { id: 'r3', status: 'success' },
        ]
        expect(mergeRuns(shown, fresh)).toEqual([
            { id: 'r4', status: 'pending' },
            { id: 'r3', status: 'success' },
            { id: 'r2', status: 'success' },
            { id: 'r1', status: 'failed' },
        ])
    })
})

describe('violationTarget', () => {
    test('maps proto field paths onto the form', () => {
        expect(violationTarget('name')).toEqual({ field: 'name' })
        expect(violationTarget('schedule')).toEqual({ field: 'schedule' })
        expect(violationTarget('steps')).toEqual({ field: 'steps' })
        expect(violationTarget('steps[3].ref_id')).toEqual({ step: 3 })
        expect(violationTarget('steps[0].kind')).toEqual({ step: 0 })
        expect(violationTarget('run_id')).toBeNull()
    })
})
