// The "AI agents" page's logic: the MCP endpoint of this workspace, the
// copy-paste setup for common MCP clients, access-token state, and the static
// table of what an agent can do there.
//
// Framework-free so it can be unit-tested in place; the view only renders.
//
// The server side is workspace-api's embedded MCP endpoint (`<api>/mcp`, off
// unless the box sets MCP_ENABLED=true) and access_token.v1, whose tokens are
// accepted by /mcp only.

/** What the snippets show until a freshly created token is on screen. */
export const TOKEN_PLACEHOLDER = '<your-access-token>'

/** The MCP server name the snippets register this workspace under. */
export const MCP_SERVER_NAME = 'fairtier'

export const SCOPE_READ = 'workspace:read'
export const SCOPE_WRITE = 'workspace:write'

/** Presets offered for a new token's lifetime; the server caps at 365. */
export const EXPIRY_PRESETS = [30, 90, 365] as const
export type ExpiryPreset = (typeof EXPIRY_PRESETS)[number]

/** A token within this many days of expiring gets a warning chip. */
export const EXPIRY_WARNING_DAYS = 14

/**
 * The URL an MCP client connects to: the workspace API's base (the same one
 * the RPC transport uses) plus `/mcp`. Trailing slashes on the configured base
 * are tolerated, since `FT_WORKSPACE_API_URL` is typed by a person.
 */
export function mcpEndpoint(apiBase: string): string {
    return `${apiBase.trim().replace(/\/+$/, '')}/mcp`
}

/**
 * How the AI agents page learns whether MCP is on: from the bootstrap
 * document's `capabilities.mcp` when the box sends it, and only for a box
 * too old to send it by probing `ListAccessTokens`.
 */
export type McpAvailability = 'enabled' | 'disabled' | 'probe'

export function mcpAvailability(advertised: boolean | undefined): McpAvailability {
    if (advertised === undefined) return 'probe'
    return advertised ? 'enabled' : 'disabled'
}

/** The endpoint the box advertises, else the one derived from the API base. */
export function resolveMcpEndpoint(advertised: string, apiBase: string): string {
    return advertised.trim() !== '' ? advertised.trim() : mcpEndpoint(apiBase)
}

export type ClientId = 'claude-code' | 'cursor' | 'generic'
export const CLIENTS: readonly ClientId[] = ['claude-code', 'cursor', 'generic']

/**
 * The setup snippet for one client. `token` is the secret while it is on
 * screen, otherwise empty — the placeholder stands in for it.
 */
export function clientSnippet(client: ClientId, endpoint: string, token: string): string {
    const bearer = `Bearer ${token || TOKEN_PLACEHOLDER}`
    switch (client) {
        case 'claude-code':
            return `claude mcp add --transport http ${MCP_SERVER_NAME} ${endpoint} \\\n  --header "Authorization: ${bearer}"`
        case 'cursor':
            return JSON.stringify(
                { mcpServers: { [MCP_SERVER_NAME]: { url: endpoint, headers: { Authorization: bearer } } } },
                null,
                2,
            )
        case 'generic':
            return `URL:       ${endpoint}\nTransport: Streamable HTTP (POST)\nHeader:    Authorization: ${bearer}`
    }
}

/** The file name the snippet's frame shows, for orientation. */
export function clientSnippetFile(client: ClientId): string {
    switch (client) {
        case 'claude-code':
            return 'terminal'
        case 'cursor':
            return '~/.cursor/mcp.json'
        case 'generic':
            return 'MCP'
    }
}

// --- Scopes -----------------------------------------------------------------

/** The two choices the create form offers, rather than raw scope strings. */
export type Access = 'read' | 'operate'

/**
 * Scopes to request for a choice. The server stores write as read+write
 * anyway; asking for both makes the request say what it means.
 */
export function scopesFor(access: Access): string[] {
    return access === 'operate' ? [SCOPE_READ, SCOPE_WRITE] : [SCOPE_READ]
}

/** Whether a token can use the write tools (write implies read). */
export function canOperate(scopes: readonly string[]): boolean {
    return scopes.includes(SCOPE_WRITE)
}

/** Short chip label for a scope: `workspace:write` → `write`. */
export function scopeLabel(scope: string): string {
    return scope.replace(/^workspace:/, '')
}

// --- Token state ------------------------------------------------------------

export type TokenState = 'active' | 'expiring' | 'expired' | 'revoked'

export interface TokenTimes {
    expiresAt: string
    revokedAt: string
}

const DAY_MS = 86_400_000

/**
 * Where a token stands at `now`. Revoked wins over expired (it is the act a
 * person took); "expiring" is active with fewer than EXPIRY_WARNING_DAYS left.
 * An unparseable expiry is treated as active — the server owns the truth and
 * a bad timestamp is not a reason to scare anyone.
 */
export function tokenState(t: TokenTimes, now: number = Date.now()): TokenState {
    if (t.revokedAt) return 'revoked'
    const exp = Date.parse(t.expiresAt)
    if (Number.isNaN(exp)) return 'active'
    if (exp <= now) return 'expired'
    if (exp - now < EXPIRY_WARNING_DAYS * DAY_MS) return 'expiring'
    return 'active'
}

/** Whole days until expiry, rounded up (0 when expired or unparseable). */
export function daysLeft(expiresAt: string, now: number = Date.now()): number {
    const exp = Date.parse(expiresAt)
    if (Number.isNaN(exp) || exp <= now) return 0
    return Math.ceil((exp - now) / DAY_MS)
}

/** Usable tokens first (newest first, as the server sends them), then the rest. */
export function sortTokens<T extends TokenTimes>(tokens: readonly T[], now: number = Date.now()): T[] {
    const usable = (t: T) => {
        const s = tokenState(t, now)
        return s === 'active' || s === 'expiring'
    }
    return [...tokens.filter(usable), ...tokens.filter((t) => !usable(t))]
}

// --- Form -------------------------------------------------------------------

/** The server's limit on a token name. */
export const MAX_NAME_LENGTH = 100

export type TokenField = 'name' | 'scopes' | 'expiresInDays'

/** Client-side check, mirroring the server's; returns the failing field. */
export function validateTokenName(name: string): 'required' | 'tooLong' | null {
    const trimmed = name.trim()
    if (!trimmed) return 'required'
    if (trimmed.length > MAX_NAME_LENGTH) return 'tooLong'
    return null
}

/**
 * Where a server FieldViolation goes on the form. The server names fields in
 * proto terms (`name`, `scopes`, `expires_in_days`).
 */
export function tokenViolationField(field: string): TokenField | null {
    switch (field) {
        case 'name':
            return 'name'
        case 'scopes':
            return 'scopes'
        case 'expires_in_days':
            return 'expiresInDays'
        default:
            return null
    }
}

// --- What the agent can do --------------------------------------------------

export interface McpTool {
    /** The tool's name as the agent sees it. */
    name: string
    scope: 'read' | 'write'
}

/**
 * The tools workspace-api's /mcp serves (docs/mcp.md there). Static: the list
 * is descriptive copy for people deciding what to grant, not a capability
 * probe — the agent itself discovers the real list with tools/list.
 */
export const MCP_TOOLS: readonly McpTool[] = [
    { name: 'workspace_status', scope: 'read' },
    { name: 'list_tables', scope: 'read' },
    { name: 'describe_table', scope: 'read' },
    { name: 'run_query', scope: 'read' },
    { name: 'list_pipelines', scope: 'read' },
    { name: 'get_pipeline', scope: 'read' },
    { name: 'list_transformations', scope: 'read' },
    { name: 'get_transformation', scope: 'read' },
    { name: 'list_workflows', scope: 'read' },
    { name: 'get_workflow', scope: 'read' },
    { name: 'list_workflow_runs', scope: 'read' },
    { name: 'list_repo_files', scope: 'read' },
    { name: 'read_repo_file', scope: 'read' },
    { name: 'list_notifications', scope: 'read' },
    { name: 'trigger_pipeline', scope: 'write' },
    { name: 'trigger_transformation', scope: 'write' },
    { name: 'trigger_workflow', scope: 'write' },
    { name: 'create_workflow', scope: 'write' },
    { name: 'update_workflow', scope: 'write' },
    { name: 'write_repo_file', scope: 'write' },
]

/**
 * What the page lists, in plain words: a handful of capabilities per scope,
 * each backed by one or more tools (shown on hover).
 */
export interface Capability {
    key: string
    scope: 'read' | 'write'
    tools: string[]
}

export const CAPABILITIES: readonly Capability[] = [
    { key: 'status', scope: 'read', tools: ['workspace_status', 'list_notifications'] },
    { key: 'tables', scope: 'read', tools: ['list_tables', 'describe_table'] },
    { key: 'query', scope: 'read', tools: ['run_query'] },
    {
        key: 'runs',
        scope: 'read',
        tools: [
            'list_pipelines',
            'get_pipeline',
            'list_transformations',
            'get_transformation',
            'list_workflows',
            'get_workflow',
            'list_workflow_runs',
        ],
    },
    { key: 'repos', scope: 'read', tools: ['list_repo_files', 'read_repo_file'] },
    { key: 'trigger', scope: 'write', tools: ['trigger_pipeline', 'trigger_transformation', 'trigger_workflow'] },
    { key: 'workflows', scope: 'write', tools: ['create_workflow', 'update_workflow'] },
    { key: 'commit', scope: 'write', tools: ['write_repo_file'] },
]

/** Capabilities grouped by scope, read first. */
export function capabilitiesByScope(): { scope: 'read' | 'write'; items: Capability[] }[] {
    return (['read', 'write'] as const).map((scope) => ({
        scope,
        items: CAPABILITIES.filter((c) => c.scope === scope),
    }))
}
