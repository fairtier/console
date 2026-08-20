// Runtime configuration.
//
// Vite bakes `VITE_*` into the bundle at build time, which is fine for local
// development but cannot express a deployed workspace: the API and Casdoor
// URLs are per box (`api.customer-<slug>.<domain>`), so one image cannot
// carry them. The image therefore ships neutral and the deployment supplies
// the real values at runtime via `GET /config.json`, served by server.ts from
// `FT_*` env vars. The prefix is deliberately NOT `VITE_`: those are
// compile-time constants, and reusing the prefix for runtime values invites
// exactly the confusion where a variable appears set but was never baked in.
//
// Precedence: build-time `VITE_*`  <  non-null `/config.json` values.
// server.ts refuses to start without the required `FT_*` set, so a deployed
// Console always has a complete document; the build-time floor only matters
// for `bun run dev`, which has no server.ts in front of it.

/** Resolved configuration the app runs against. */
export interface RuntimeConfig {
    /** Workspace API base URL (this box's own API). */
    workspaceApiUrl: string
    /** OIDC issuer — this workspace's own Casdoor. */
    authUrl: string
    authClientId: string
    authRedirectUri: string
    authOrganization: string
    /**
     * External "Account & Billing" URL, when this workspace is managed by a
     * hosting provider (a FairTier-hosted box points at the central Console).
     * Null hides the link — the self-host default.
     */
    accountUrl: string | null
    /**
     * Error-tracking DSN, in the Sentry SDK's format (see lib/sentry.ts).
     * Empty means error tracking is off, which is the default: a deployment
     * only reports when whoever runs it opts in.
     */
    sentryDsn: string
}

/** Shape of /config.json. Every field is optional; null never overrides. */
interface ConfigDocument {
    workspaceApiUrl?: string | null
    authUrl?: string | null
    authClientId?: string | null
    authRedirectUri?: string | null
    authOrganization?: string | null
    accountUrl?: string | null
    sentryDsn?: string | null
}

/** Build-time values, the floor of the precedence chain (dev only). */
function buildTimeConfig(): RuntimeConfig {
    return {
        workspaceApiUrl: import.meta.env.VITE_WORKSPACE_API_URL ?? '',
        authUrl: import.meta.env.VITE_AUTH_URL ?? '',
        authClientId: import.meta.env.VITE_AUTH_CLIENT_ID ?? '',
        authRedirectUri: import.meta.env.VITE_AUTH_REDIRECT_URI ?? '',
        authOrganization: import.meta.env.VITE_AUTH_ORGANIZATION ?? '',
        accountUrl: null,
        sentryDsn: import.meta.env.VITE_SENTRY_DSN ?? '',
    }
}

let resolved: RuntimeConfig = buildTimeConfig()
let loaded = false

/**
 * Fetches /config.json and folds it over the build-time defaults. Call once,
 * before mounting the app — `main.ts` awaits it so nothing reads a half-built
 * config.
 *
 * Never throws and never blocks for long: the config document is a same-origin
 * static response, so a slow one means something is wrong with the deployment,
 * not with the network.
 */
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
    if (loaded) return resolved

    try {
        const resp = await fetch('/config.json', {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(1000),
        })
        if (resp.ok) {
            resolved = merge(resolved, (await resp.json()) as ConfigDocument)
        }
    } catch {
        // No /config.json (dev server), bad JSON, or too slow — the
        // build-time values stand.
    }

    loaded = true
    return resolved
}

/** Folds a config document over a base, ignoring null/undefined entries. */
function merge(base: RuntimeConfig, doc: ConfigDocument): RuntimeConfig {
    const next = { ...base }
    if (doc.workspaceApiUrl != null) next.workspaceApiUrl = doc.workspaceApiUrl
    if (doc.authUrl != null) next.authUrl = doc.authUrl
    if (doc.authClientId != null) next.authClientId = doc.authClientId
    if (doc.authRedirectUri != null) next.authRedirectUri = doc.authRedirectUri
    if (doc.authOrganization != null) next.authOrganization = doc.authOrganization
    if (doc.accountUrl != null) next.accountUrl = doc.accountUrl || null
    // An empty string is a meaningful value here, not an absent one: it is how
    // a deployment turns error tracking off.
    if (doc.sentryDsn != null) next.sentryDsn = doc.sentryDsn
    return next
}

/**
 * The resolved config. Safe to call before loadRuntimeConfig() — it returns
 * the build-time values until the document lands.
 */
export function runtimeConfig(): RuntimeConfig {
    return resolved
}
