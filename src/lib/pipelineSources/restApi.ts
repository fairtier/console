import type { PipelineForm, PipelineSource, RestResource } from './types'

// Keys the guided rest_api form can fully represent. Any config carrying more
// than these (params, paginator, incremental, per-resource primary_key, …)
// falls back to the advanced JSON editor so nothing is silently dropped.
const GUIDED_KEYS = new Set(['base_url', 'resources', 'auth_method', 'pagination'])

/**
 * toRestResource normalizes one entry of a `resources` array into the object
 * shape the guided form edits. A bare string is the shorthand the backend also
 * accepts; its endpoint is derived the same way the Add button derives one.
 * Returns null for anything unnamed, which the caller filters out.
 */
export function toRestResource(r: unknown): RestResource | null {
    if (typeof r === 'string') return r ? { name: r, endpoint: '/' + r } : null
    if (r && typeof r === 'object') {
        const o = r as Record<string, unknown>
        const name = typeof o.name === 'string' ? o.name : ''
        if (!name) return null
        const endpoint = typeof o.endpoint === 'string' && o.endpoint ? o.endpoint : '/' + name
        return { name, endpoint }
    }
    return null
}

export const restApi: PipelineSource = {
    key: 'rest_api',
    id: 'rest_api',
    group: 'apis',
    labelKey: 'pipelines.sourceTypes.rest_api',
    badge: { abbr: 'API', bg: 'var(--accent-soft)', fg: 'var(--accent-soft-ink)' },

    guided: true,
    credentials: true,
    credentialFields: [],
    schedulable: true,
    fileDrop: false,
    googleScope: () => '',

    // Only ever seen in Advanced JSON — the guided form is the default view.
    configPlaceholder:
        '{\n' +
        '  "base_url": "https://api.example.com",\n' +
        '  "resources": [{"name": "orders", "endpoint": "/orders"}]\n' +
        '}',
    // Every field is optional: an unauthenticated API needs none of it.
    credentialsPlaceholder: '{"api_key": "…"}',

    isGuidable(parsed) {
        for (const k of Object.keys(parsed)) {
            if (!GUIDED_KEYS.has(k)) return false
        }
        if (parsed.resources !== undefined) {
            if (!Array.isArray(parsed.resources)) return false
            for (const r of parsed.resources) {
                if (typeof r === 'string') continue
                if (r && typeof r === 'object' && !Array.isArray(r)) {
                    for (const rk of Object.keys(r)) {
                        if (rk !== 'name' && rk !== 'endpoint') return false
                    }
                    continue
                }
                return false
            }
        }
        return true
    },

    toForm(parsed): Partial<PipelineForm> {
        // Every field is written, defaults included: the form may be carrying
        // another type's leftovers, and a half-populated guided form would
        // save values the config never had.
        return {
            baseUrl: typeof parsed.base_url === 'string' ? parsed.base_url : '',
            resources: Array.isArray(parsed.resources)
                ? parsed.resources.map(toRestResource).filter((r): r is RestResource => r !== null)
                : [],
            authMethod: typeof parsed.auth_method === 'string' ? parsed.auth_method : 'bearer',
            pagination: typeof parsed.pagination === 'string' ? parsed.pagination : 'none',
        }
    },

    toConfig(form) {
        const cfg: Record<string, unknown> = {}
        if (form.baseUrl.trim()) cfg.base_url = form.baseUrl.trim()
        if (form.resources.length) {
            cfg.resources = form.resources.map((r) => ({ name: r.name, endpoint: r.endpoint }))
        }
        cfg.auth_method = form.authMethod
        cfg.pagination = form.pagination
        return cfg
    },
}
