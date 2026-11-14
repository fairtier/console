/**
 * A fake workspace API at the network layer, for specs that need the app past
 * the login: `page.route` answers the Connect (JSON) calls the Console makes,
 * and an init script seeds a session in localStorage so the router lets the
 * page in. No backend, no identity provider — still hermetic.
 *
 * The data is invented and deliberately small. Only the RPCs the specs touch
 * are implemented; everything else answers `unimplemented`, which the
 * Console treats as an unavailable feature, the way an older box would.
 */

import type { Page, Route } from '@playwright/test'

/** The dummy API origin playwright.config.ts hands server.ts. */
export const API = 'http://localhost:9098'

type Json = Record<string, unknown>

const now = Date.now()
const ago = (min: number) => new Date(now - min * 60_000).toISOString()

// --- Targets ----------------------------------------------------------------

export const PIPELINES: Json[] = [
    { id: '11111111-0000-4000-8000-000000000001', name: 'orders', sourceType: 'rest_api', sourceConfig: '{}', datasetName: 'raw_orders', schedule: '0 6 * * *', enabled: true, lastRunStatus: 'success', lastRunAt: ago(300) },
    { id: '11111111-0000-4000-8000-000000000002', name: 'customers', sourceType: 'rest_api', sourceConfig: '{}', datasetName: 'raw_customers', schedule: '', enabled: true, lastRunStatus: 'success', lastRunAt: ago(130) },
    { id: '11111111-0000-4000-8000-000000000003', name: 'web_events', sourceType: 'duckdb', sourceConfig: '{}', datasetName: 'raw_events', schedule: '', enabled: false },
]
export const TRANSFORMATIONS: Json[] = [
    { id: '22222222-0000-4000-8000-000000000001', name: 'stg_orders', repoRef: 'main', dbtSelector: 'stg_orders', schedule: '', enabled: true, triggerAfterPipelineId: PIPELINES[0]!.id },
    { id: '22222222-0000-4000-8000-000000000002', name: 'marts', repoRef: 'main', dbtSelector: 'marts', schedule: '', enabled: true, triggerAfterPipelineId: '' },
]
const [orders, customers, webEvents] = PIPELINES as [Json, Json, Json, ...Json[]]
const [stgOrders, marts] = TRANSFORMATIONS as [Json, Json, ...Json[]]

const step = (kind: 'pipeline' | 'transformation', target: Json, position: number) => ({
    kind,
    refId: target.id,
    name: target.name,
    position,
})

// --- Workflows --------------------------------------------------------------

export const NIGHTLY = '33333333-0000-4000-8000-000000000001'
export const EVENTS = '33333333-0000-4000-8000-000000000002'
export const BACKFILL = '33333333-0000-4000-8000-000000000003'

const DBT_ERROR = `Database Error in model stg_orders (models/stg_orders.sql)
  Binder Error: Referenced column "order_total" not found in FROM clause!
  Candidate bindings: "total_amount", "order_id"
  compiled code at target/run/fairtier/models/stg_orders.sql`

function initialWorkflows(): Json[] {
    return [
        {
            id: NIGHTLY,
            name: 'nightly_orders',
            description: 'Load orders and customers, then rebuild the order models and marts.',
            schedule: '0 5 * * *',
            enabled: true,
            steps: [step('pipeline', orders, 0), step('pipeline', customers, 1), step('transformation', stgOrders, 2), step('transformation', marts, 3)],
            lastRunAt: ago(125),
            lastRunStatus: 'failed',
            // workspace-api's failure summary (first line, failed step).
            lastRunError: DBT_ERROR.split('\n')[0],
            lastFailedStepPosition: 2,
            lastFailedStepName: 'stg_orders',
        },
        {
            id: EVENTS,
            name: 'hourly_events',
            description: '',
            schedule: '0 * * * *',
            enabled: true,
            steps: [step('pipeline', webEvents, 0), step('transformation', marts, 1)],
            lastRunAt: ago(2),
            lastRunStatus: 'running',
        },
        {
            id: BACKFILL,
            name: 'adhoc_backfill',
            description: '',
            schedule: '',
            enabled: false,
            steps: [step('pipeline', customers, 0)],
        },
    ]
}

/** A finished run of nightly_orders; `fail` stops it at stg_orders. */
function nightlyRun(id: string, startedMin: number, fail: boolean, trigger = 'schedule'): Json {
    const at = (m: number) => ago(startedMin - m)
    const ok = (target: Json, kind: 'pipeline' | 'transformation', pos: number, from: number, to: number) => ({
        position: pos, kind, refId: target.id, name: target.name, status: 'success',
        pipelineRunId: kind === 'pipeline' ? `${id}-p${pos}` : '',
        transformationRunId: kind === 'transformation' ? `${id}-t${pos}` : '',
        startedAt: at(from), completedAt: at(to),
    })
    const steps: Json[] = [ok(orders, 'pipeline', 0, 0, 2.4), ok(customers, 'pipeline', 1, 2.4, 3.1)]
    if (fail) {
        steps.push(
            { ...ok(stgOrders, 'transformation', 2, 3.1, 3.6), status: 'failed', errorMessage: DBT_ERROR },
            { position: 3, kind: 'transformation', refId: marts.id, name: marts.name, status: 'skipped' },
        )
    } else {
        steps.push(ok(stgOrders, 'transformation', 2, 3.1, 3.9), ok(marts, 'transformation', 3, 3.9, 4.6))
    }
    return {
        id, workflowId: NIGHTLY, status: fail ? 'failed' : 'success', trigger,
        startedAt: at(0), completedAt: at(fail ? 3.6 : 4.6), createdAt: at(0),
        errorMessage: fail ? 'step 3 (stg_orders) failed' : '',
        stepRuns: steps,
    }
}

function initialRuns(): Record<string, Json[]> {
    const nightly: Json[] = [nightlyRun('run-n-1', 125, true)]
    for (let d = 1; d <= 14; d++) nightly.push(nightlyRun(`run-n-${d + 1}`, 125 + d * 1440, d === 6, d === 3 ? 'manual' : 'schedule'))
    return {
        [NIGHTLY]: nightly,
        [EVENTS]: [
            {
                id: 'run-e-1', workflowId: EVENTS, status: 'running', trigger: 'schedule', startedAt: ago(2), createdAt: ago(2),
                stepRuns: [
                    { position: 0, kind: 'pipeline', refId: webEvents.id, name: webEvents.name, status: 'running', startedAt: ago(2), pipelineRunId: 'run-e-1-p0' },
                    { position: 1, kind: 'transformation', refId: marts.id, name: marts.name, status: 'pending' },
                ],
            },
        ],
        [BACKFILL]: [],
    }
}

// --- Access tokens ----------------------------------------------------------

const inDays = (d: number) => new Date(now + d * 86_400_000).toISOString()

function initialTokens(): Json[] {
    return [
        { id: 'tok-1', name: 'laptop claude code', prefix: 'ftw_1a2b3c4d', scopes: ['workspace:read'], createdAt: ago(60 * 24 * 20), expiresAt: inDays(70), lastUsedAt: ago(180) },
        { id: 'tok-2', name: 'cursor on the build box', prefix: 'ftw_9f8e7d6c', scopes: ['workspace:read', 'workspace:write'], createdAt: ago(60 * 24 * 85), expiresAt: inDays(5), lastUsedAt: ago(60 * 24 * 2) },
        { id: 'tok-3', name: 'old experiment', prefix: 'ftw_0badcafe', scopes: ['workspace:read', 'workspace:write'], createdAt: ago(60 * 24 * 60), expiresAt: inDays(30), revokedAt: ago(60 * 24 * 10) },
    ]
}

/** The secret CreateAccessToken hands out: "ftw_" + 64 hex characters. */
export const NEW_SECRET = `ftw_${'5e'.repeat(32)}`

// --- Wire helpers -----------------------------------------------------------

const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-expose-headers': '*',
}

function ok(route: Route, body: Json) {
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

/** A Connect error; `violations` become a pipeline.v1.ValidationErrors detail. */
function fail(route: Route, code: string, message: string, violations: { field: string; description: string }[] = []) {
    const status = { invalid_argument: 400, not_found: 404, already_exists: 409, failed_precondition: 400, unimplemented: 501 }[code] ?? 500
    const body: Json = { code, message }
    if (violations.length) {
        body.details = [{ type: 'pipeline.v1.ValidationErrors', value: encodeViolations(violations) }]
    }
    return route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

// Hand-rolled protobuf for one tiny message, so the fixture needs no generated
// code: ValidationErrors{ repeated FieldViolation violations = 1 } and
// FieldViolation{ string field = 1; string description = 2 }.
function encodeViolations(vs: { field: string; description: string }[]): string {
    const varint = (n: number) => {
        const out: number[] = []
        while (n > 0x7f) {
            out.push((n & 0x7f) | 0x80)
            n >>>= 7
        }
        out.push(n)
        return out
    }
    const str = (tag: number, s: string) => {
        const b = [...Buffer.from(s, 'utf8')]
        return [tag, ...varint(b.length), ...b]
    }
    const bytes: number[] = []
    for (const v of vs) {
        const inner = [...str(0x0a, v.field), ...str(0x12, v.description)]
        bytes.push(0x0a, ...varint(inner.length), ...inner)
    }
    // Connect's JSON error details are unpadded base64.
    return Buffer.from(bytes).toString('base64').replace(/=+$/, '')
}

// --- The fake -----------------------------------------------------------------

export interface FakeApi {
    workflows: Json[]
    /** access_token.v1 tokens; only served when `mcp` is on. */
    tokens: Json[]
    runs: Record<string, Json[]>
    /** Every RPC the page made, as "Service/Method". */
    calls: string[]
    /** Request bodies by "Service/Method", newest last. */
    bodies: Record<string, Json[]>
}

export interface FakeOptions {
    /** Start with no workflows (the empty state). */
    empty?: boolean
    /**
     * Serve access_token.v1 as a box with MCP_ENABLED=true does. Off, its
     * paths answer a bare 404, as an API without MCP enabled does.
     */
    mcp?: boolean
    /** Answer as a workspace-api from before SetWorkflowEnabled (Unimplemented). */
    legacyWorkflows?: boolean
    /** What NotificationService/ListNotifications returns (default: none). */
    notifications?: Json[]
}

export async function fakeWorkspaceApi(page: Page, opts: FakeOptions = {}): Promise<FakeApi> {
    const api: FakeApi = {
        workflows: opts.empty ? [] : initialWorkflows(),
        runs: opts.empty ? {} : initialRuns(),
        tokens: opts.mcp ? initialTokens() : [],
        calls: [],
        bodies: {},
    }

    await page.addInitScript(() => {
        localStorage.setItem('ft_access_token', 'e2e-token')
        localStorage.setItem(
            'ft_user',
            JSON.stringify({ id: 'e2e', name: 'e2e', displayName: 'Test User', email: 'test@example.com', avatar: '', organization: 'smoke' }),
        )
        localStorage.setItem('ft_locale', 'en')
    })

    await page.route(`${API}/**`, async (route) => {
        const req = route.request()
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
        const path = new URL(req.url()).pathname

        if (path === '/.well-known/fairtier-workspace') {
            return ok(route, {
                slug: 'demo', customer_domain: 'example.com', casdoor_issuer: '', casdoor_org: 'smoke', console_client_id: 'smoke-e2e',
                capabilities: { control_plane: false, rill: false, cube: false, duckflight: false, filedrop: false, google_oauth: false },
            })
        }

        const rpc = path.replace(/^\/[a-z_]+\.v1\./, '')
        api.calls.push(rpc)
        let body: Json = {}
        try {
            body = (req.postDataJSON() as Json) ?? {}
        } catch {
            body = {}
        }
        ;(api.bodies[rpc] ??= []).push(body)

        // Without MCP_ENABLED the service is not mounted at all: the Go mux
        // answers a plain 404, which Connect clients read as Unimplemented.
        if (!opts.mcp && rpc.startsWith('AccessTokenService/')) {
            return route.fulfill({ status: 404, headers: { ...CORS, 'content-type': 'text/plain' }, body: '404 page not found\n' })
        }

        switch (rpc) {
            case 'PipelineService/ListPipelines':
                return ok(route, { pipelines: PIPELINES })
            case 'TransformationService/ListTransformations':
                return ok(route, { transformations: TRANSFORMATIONS })
            case 'NotificationService/ListNotifications': {
                const notifications = opts.notifications ?? []
                return ok(route, { notifications, unreadCount: notifications.filter((n) => !n.read).length })
            }
            case 'PipelineService/GetPipeline': {
                const pipeline = PIPELINES.find((p) => p.id === body.id)
                if (!pipeline) return fail(route, 'not_found', 'pipeline not found')
                return ok(route, { pipeline, recentRuns: [] })
            }
            case 'TransformationService/GetTransformation': {
                const transformation = TRANSFORMATIONS.find((x) => x.id === body.id)
                if (!transformation) return fail(route, 'not_found', 'transformation not found')
                return ok(route, { transformation, recentRuns: [] })
            }
            case 'DemoService/GetDemoStatus':
                return ok(route, { status: { available: false } })

            case 'WorkflowService/ListWorkflows':
                return ok(route, { workflows: api.workflows })

            case 'WorkflowService/ListWorkflowRuns': {
                const all = api.runs[String(body.workflowId)] ?? []
                const start = body.pageToken ? Number(body.pageToken) : 0
                const size = Number(body.pageSize) || 20
                const slice = all.slice(start, start + size)
                const next = start + size < all.length ? String(start + size) : ''
                return ok(route, { runs: slice, nextPageToken: next })
            }

            case 'WorkflowService/CreateWorkflow':
            case 'WorkflowService/UpdateWorkflow': {
                const name = String(body.name ?? '').trim()
                const steps = (body.steps as Json[] | undefined) ?? []
                if (api.workflows.some((w) => w.name === name && w.id !== body.id)) {
                    return fail(route, 'already_exists', `a workflow named "${name}" already exists`)
                }
                if (name === 'invalid') {
                    return fail(route, 'invalid_argument', 'steps[0].ref_id: pipeline not found', [
                        { field: 'steps[0].ref_id', description: 'pipeline not found' },
                    ])
                }
                const named = steps.map((s, i) => {
                    const list = s.kind === 'pipeline' ? PIPELINES : TRANSFORMATIONS
                    return { ...s, position: i, name: list.find((x) => x.id === s.refId)?.name ?? '' }
                })
                const existing = api.workflows.find((w) => w.id === body.id)
                const wf: Json = {
                    ...(existing ?? { id: `33333333-0000-4000-8000-${String(api.workflows.length + 1).padStart(12, '0')}`, enabled: true }),
                    name,
                    description: body.description ?? '',
                    schedule: body.schedule ?? '',
                    // Optional on create: absent means enabled.
                    enabled: existing ? !!body.enabled : body.enabled !== false,
                    steps: named,
                }
                if (existing) api.workflows.splice(api.workflows.indexOf(existing), 1, wf)
                else api.workflows.push(wf)
                api.runs[String(wf.id)] ??= []
                return ok(route, { workflow: wf })
            }

            case 'WorkflowService/SetWorkflowEnabled': {
                if (opts.legacyWorkflows) break
                const wf = api.workflows.find((w) => w.id === body.id)
                if (!wf) return fail(route, 'not_found', 'workflow not found')
                wf.enabled = !!body.enabled
                return ok(route, { workflow: wf })
            }

            case 'WorkflowService/TriggerWorkflow': {
                const wf = api.workflows.find((w) => w.id === body.id)
                if (!wf) return fail(route, 'not_found', 'workflow not found')
                const run = { id: `run-manual-${api.calls.length}`, workflowId: wf.id, status: 'pending', trigger: 'manual', createdAt: new Date().toISOString(), stepRuns: [] }
                ;(api.runs[String(wf.id)] ??= []).unshift(run)
                wf.lastRunStatus = 'pending'
                wf.lastRunAt = run.createdAt
                return ok(route, { run })
            }

            case 'WorkflowService/DeleteWorkflow':
                api.workflows = api.workflows.filter((w) => w.id !== body.id)
                return ok(route, {})

            case 'AccessTokenService/ListAccessTokens':
                return ok(route, { tokens: api.tokens })

            case 'AccessTokenService/CreateAccessToken': {
                const name = String(body.name ?? '').trim()
                if (name === 'taken') {
                    return fail(route, 'invalid_argument', 'name: pick another name', [{ field: 'name', description: 'pick another name' }])
                }
                const token: Json = {
                    id: `tok-${api.tokens.length + 1}`,
                    name,
                    prefix: NEW_SECRET.slice(0, 12),
                    scopes: (body.scopes as string[] | undefined) ?? [],
                    createdAt: new Date().toISOString(),
                    expiresAt: inDays(Number(body.expiresInDays) || 90),
                }
                api.tokens.unshift(token)
                return ok(route, { token, secret: NEW_SECRET })
            }

            case 'AccessTokenService/RevokeAccessToken': {
                const tok = api.tokens.find((x) => x.id === body.id)
                if (!tok) return fail(route, 'not_found', 'access token not found')
                tok.revokedAt ??= new Date().toISOString()
                return ok(route, {})
            }
        }
        return fail(route, 'unimplemented', `${rpc} is not faked`)
    })

    return api
}
