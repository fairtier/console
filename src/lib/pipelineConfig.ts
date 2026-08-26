// Pure pipeline-config logic, lifted out of PipelineWizardView.
//
// The wizard offers two ways to describe a source: a guided form with named
// fields, and a raw JSON editor. Everything that decides *which* of the two a
// stored config can be shown in — and how a server validation error finds the
// field that caused it — is plain data-in/data-out, so it lives here where
// `bun test` can reach it rather than inside an SFC where nothing can.

/**
 * A rest_api resource as the backend expects it: name and endpoint are both
 * required (see domain.restAPIResource). The guided form models the full
 * object so object-shaped configs round-trip instead of being flattened to
 * bare names.
 */
export interface RestResource {
    name: string
    endpoint: string
}

// Keys the guided rest_api form can fully represent. Any config carrying more
// than these (params, paginator, incremental, per-resource primary_key, …)
// falls back to the advanced JSON editor so nothing is silently dropped.
const GUIDED_REST_KEYS = new Set(['base_url', 'resources', 'auth_method', 'pagination'])

// Keys the guided google_sheets form can fully represent (mirrors
// domain.googleSheetsConfig). Anything else falls back to advanced JSON.
const GUIDED_SHEETS_KEYS = new Set(['spreadsheet_url_or_id', 'range_names'])

/**
 * toRestResource normalizes one entry of a rest_api `resources` array into the
 * object shape the guided form edits. A bare string is the shorthand the
 * backend also accepts; its endpoint is derived the same way the Add button
 * derives one. Returns null for anything unnamed, which the caller filters out.
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

/**
 * restApiIsGuidable reports whether a parsed rest_api config fits the guided
 * form: only known top-level keys, and every resource either a string or a
 * plain {name, endpoint} object. A false here is what sends the wizard to the
 * advanced JSON editor.
 */
export function restApiIsGuidable(parsed: Record<string, unknown>): boolean {
    for (const k of Object.keys(parsed)) {
        if (!GUIDED_REST_KEYS.has(k)) return false
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
}

/** sheetsIsGuidable is restApiIsGuidable's counterpart for google_sheets. */
export function sheetsIsGuidable(parsed: Record<string, unknown>): boolean {
    for (const k of Object.keys(parsed)) {
        if (!GUIDED_SHEETS_KEYS.has(k)) return false
    }
    if (parsed.range_names !== undefined) {
        if (!Array.isArray(parsed.range_names)) return false
        for (const r of parsed.range_names) {
            if (typeof r !== 'string') return false
        }
    }
    return true
}

/**
 * isValidJson treats blank as valid — an empty credentials or config box means
 * "nothing supplied", which the callers turn into `{}`, not a parse error.
 */
export function isValidJson(s: string): boolean {
    if (!s.trim()) return true
    try {
        JSON.parse(s)
        return true
    } catch {
        return false
    }
}

/**
 * formFieldFor maps a server FieldViolation path (e.g. "base_url",
 * "resources[0].endpoint") to the id of the form field that should display it.
 * Anything with no field of its own lands on the source-config editor, which is
 * where a hand-written config's keys are edited.
 */
export function formFieldFor(path: string): string {
    const p = path.replace(/\[\d+\]/g, '') // strip array indices
    switch (p) {
        case 'base_url':
            return 'baseUrl'
        case 'resources':
        case 'resources.name':
        case 'resources.endpoint':
            return 'resources'
        case 'spreadsheet_url_or_id':
            return 'spreadsheet'
        case 'range_names':
            return 'rangeNames'
        case 'connection_string':
        case 'access_key_id':
        case 'secret_access_key':
        case 'service_account_key':
            return 'credentialsRaw'
        default:
            // Everything else (bucket_url, tables_config.*, incremental.*, …)
            // lives in the advanced/generic source config editor.
            return 'sourceConfigRaw'
    }
}
