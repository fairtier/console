// The workspace's unauthenticated bootstrap document.
//
// Everything here has to be readable BEFORE the Console can authenticate,
// because it is what tells the Console which Casdoor to authenticate against.
// That is why it is plain HTTP rather than an RPC, and why it carries only
// public facts: the issuer is a public DNS name, the slug is in the hostname
// the request was sent to, and an OAuth public-client id is public by design
// (PKCE, no secret). Same disclosure class as an OIDC discovery document.
//
// It is the Console's only discovery path, which is why the capabilities
// travel with it.

import { workspaceApiBase } from './transport'

export interface WorkspaceCapabilities {
    /**
     * Served by the API but always false here: a workspace deployment has no
     * billing, provisioning or central identity. Kept so the interface
     * matches the wire document; nothing reads it.
     */
    control_plane: boolean
    rill: boolean
    cube: boolean
    duckflight: boolean
    filedrop: boolean
    google_oauth: boolean
}

export interface WorkspaceBootstrap {
    slug: string
    customer_domain: string
    casdoor_issuer: string
    casdoor_org: string
    console_client_id: string
    capabilities: WorkspaceCapabilities
}

let cached: WorkspaceBootstrap | null = null
let inFlight: Promise<WorkspaceBootstrap | null> | null = null

/**
 * Fetches the workspace's bootstrap document, or null if the API is
 * unreachable. Cached for the session — the document only changes when the
 * workspace is redeployed.
 */
export async function loadWorkspaceBootstrap(): Promise<WorkspaceBootstrap | null> {
    if (cached) return cached
    if (!inFlight) {
        inFlight = fetchBootstrap().catch(() => null)
    }
    const doc = await inFlight
    if (doc) cached = doc
    return doc
}

async function fetchBootstrap(): Promise<WorkspaceBootstrap | null> {
    const base = workspaceApiBase()
    const resp = await fetch(`${base}/.well-known/fairtier-workspace`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
    })
    if (!resp.ok) return null
    return (await resp.json()) as WorkspaceBootstrap
}

/** Drops the cached document, e.g. after the workspace target changes. */
export function resetWorkspaceBootstrap(): void {
    cached = null
    inFlight = null
}
