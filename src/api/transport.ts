// The workspace transport.
//
// One plane, one session: the Console is served by the workspace it manages,
// authenticates against that workspace's own Casdoor, and talks to exactly one
// API — `runtimeConfig().workspaceApiUrl`. The base URL is resolved per call
// rather than at import time because it arrives from /config.json at runtime;
// `createConnectTransport` bakes `baseUrl` in at construction, so a
// module-level constant cannot express that. Delegating costs one method hop
// and leaves every `import { pipelineClient }` call site — and the plain-HTTP
// helpers in filedrop.ts / googleOAuth.ts — untouched.

import type { Interceptor, Transport } from '@connectrpc/connect'
import { Code, ConnectError } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { runtimeConfig } from '../config/runtime'

function apiBase(): string {
    const base = runtimeConfig().workspaceApiUrl
    if (!base) {
        // server.ts refuses to start without FT_WORKSPACE_API_URL, so this is
        // a config regression (or a dev server without VITE_*), not a
        // reachable production state. Fail loudly rather than aim requests at
        // the page's own origin.
        throw new ConnectError('no workspace API URL configured', Code.Unimplemented)
    }
    return base
}

/** Base URL for the API's plain-HTTP endpoints (file-drop upload, OAuth). */
export function workspaceApiBase(): string {
    return runtimeConfig().workspaceApiUrl
}

/** The bearer token for plain-HTTP calls (same session as the RPCs). */
export function workspaceAuthToken(): string | null {
    return localStorage.getItem('ft_access_token')
}

// ── Interceptors ────────────────────────────────────────────────────────────

const auth: Interceptor = (next) => async (req) => {
    const token = localStorage.getItem('ft_access_token')
    if (token) req.header.set('Authorization', `Bearer ${token}`)
    return await next(req)
}

/**
 * Ends the session on a 401: the token that signed us in is no longer good,
 * so drop it and go back to the login screen.
 */
const logoutOnUnauthenticated: Interceptor = (next) => async (req) => {
    try {
        return await next(req)
    } catch (err) {
        if (err instanceof ConnectError && err.code === Code.Unauthenticated) {
            localStorage.removeItem('ft_access_token')
            localStorage.removeItem('ft_refresh_token')
            localStorage.removeItem('ft_user')
            window.location.href = '/'
        }
        throw err
    }
}

// ── Transport ───────────────────────────────────────────────────────────────

const cache = new Map<string, Transport>()

function transportFor(baseUrl: string): Transport {
    let found = cache.get(baseUrl)
    if (!found) {
        found = createConnectTransport({
            baseUrl,
            interceptors: [auth, logoutOnUnauthenticated],
        })
        cache.set(baseUrl, found)
    }
    return found
}

/** The workspace API transport every generated client rides on. */
export const transport: Transport = {
    unary: (...args) => transportFor(apiBase()).unary(...args),
    stream: (...args) => transportFor(apiBase()).stream(...args),
}
