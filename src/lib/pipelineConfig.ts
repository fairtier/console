// Pipeline config assembly and validation, lifted out of PipelineWizardView.
//
// The wizard offers two ways to describe a source: a guided form with named
// fields, and a raw JSON editor. What each source type knows about its own
// guided form lives in ./pipelineSources; this module is the part that is the
// same for all of them — packing the form into a config, unpacking a stored
// config back into the form, and routing a server validation error to the
// field that caused it.

import { sourceFor, sourceForKey } from './pipelineSources'
import type { GoogleScope, PipelineForm, PipelineSource } from './pipelineSources'

/**
 * parseConfigObject turns a stored source_config string into an object, or null
 * when it is not one. Used wherever a *variant* has to be resolved from a
 * config — the wizard on edit, the pipelines list for its label.
 */
export function parseConfigObject(sourceConfig: string): Record<string, unknown> | null {
    if (!sourceConfig.trim()) return null
    try {
        const v: unknown = JSON.parse(sourceConfig)
        if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    } catch {
        // A config we cannot read resolves to the base entry, which renders it
        // in the JSON editor — the same place a valid but unguidable one goes.
    }
    return null
}

/** The source the form is currently editing, resolved from the picker's key. */
export function sourceForForm(form: PipelineForm): PipelineSource {
    return sourceForKey(form.sourceKey)
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
 * buildSourceConfig produces the source_config to save. Advanced JSON always
 * wins when the user has switched it on, and it is the only option for a type
 * with no guided form. Throws on unparseable JSON — the caller reports it as a
 * validation error rather than saving something the box cannot read.
 */
export function buildSourceConfig(form: PipelineForm, advancedJson: boolean): unknown {
    const source = sourceForForm(form)
    if (advancedJson || !source.guided) {
        const raw = form.sourceConfigRaw.trim()
        return raw ? JSON.parse(raw) : {}
    }
    return source.toConfig(form)
}

/**
 * googleScopeFor answers what the form's source needs from Google right now:
 * '' (nothing), 'sheets', or 'drive'.
 *
 * It parses the raw config because for `duckdb` the answer is inside it — the
 * gdrive extension reads Drive, mysql reads a database. A config still being
 * typed is not an error here: an unparseable one simply claims nothing, and
 * the sign-in appears the moment it becomes valid JSON naming the extension.
 */
export function googleScopeFor(form: PipelineForm): GoogleScope {
    const source = sourceForForm(form)
    let parsed: Record<string, unknown> = {}
    const raw = form.sourceConfigRaw.trim()
    if (raw) {
        try {
            const v: unknown = JSON.parse(raw)
            if (v && typeof v === 'object' && !Array.isArray(v)) parsed = v as Record<string, unknown>
        } catch {
            // Mid-edit; the guided types ignore the argument anyway.
        }
    }
    return source.googleScope(parsed)
}

/**
 * buildCredentials produces the source_credentials to save.
 *
 * For a Google source the preferred answer is a *reference*, not a secret: the
 * backend resolves the connection's refresh token at serve/render time, so the
 * pipeline follows the connection and a reconnect happens once, in
 * Integrations. The one-shot grant below it is the fallback for a workspace
 * plane that does not serve ConnectionService yet — the backend swaps it for
 * the stored refresh token and injects the client credentials. Either way the
 * raw textarea is ignored.
 *
 * Throws on unparseable JSON, like buildSourceConfig.
 */
export function buildCredentials(form: PipelineForm, advancedJson = false): unknown {
    // A source that takes no credentials sends none, whatever another type
    // left in the raw box: file_upload (the platform injects the workspace's
    // own storage credentials) and the public-URL readers have no card at all,
    // so there is no field the user could have meant this by.
    if (!sourceForForm(form).credentials) return {}
    // One envelope for every Google-backed type: google_sheets and
    // duckdb/gdrive both carry the credential under "oauth", which is what
    // lets one sign-in feed either.
    const usesGoogle = googleScopeFor(form) !== ''
    if (usesGoogle && form.connectionId) {
        return { oauth: { connection_id: form.connectionId } }
    }
    if (usesGoogle && form.oauthGrantId) {
        return { oauth: { grant_id: form.oauthGrantId } }
    }
    // A guided source that names its credentials (a database's password) packs
    // them by path — `attach_params.password`, the shape the worker fills the
    // ATTACH template from. Advanced JSON hands the whole card back to the
    // textarea, config and credentials together: a hand-written template can
    // carry placeholders no named field knows about.
    const named = namedCredentials(form, advancedJson)
    if (named) return named
    const raw = form.credentialsRaw.trim()
    return raw ? JSON.parse(raw) : {}
}

/**
 * namedCredentials packs the guided form's declared credential fields into the
 * nested object their `path` names, or null when this source declares none —
 * or when every one of them was left blank, which on update is how the user
 * says "keep what is stored".
 */
function namedCredentials(form: PipelineForm, advancedJson: boolean): Record<string, unknown> | null {
    const source = sourceForForm(form)
    if (advancedJson || !source.guided || source.credentialFields.length === 0) return null
    const out: Record<string, unknown> = {}
    let any = false
    for (const field of source.credentialFields) {
        const value = form[field.field].trim()
        if (!value) continue
        any = true
        const segments = field.path.split('.')
        let node = out
        for (const segment of segments.slice(0, -1)) {
            node[segment] ??= {}
            node = node[segment] as Record<string, unknown>
        }
        node[segments[segments.length - 1]!] = value
    }
    return any ? out : null
}

/**
 * credentialsProvided reports whether the user supplied new credentials this
 * session. It decides a contract, not a display: on update, empty credentials
 * mean "keep what is stored", so answering true for an untouched form would
 * overwrite a working credential with {}.
 */
export function credentialsProvided(form: PipelineForm, advancedJson = false): boolean {
    if (!sourceForForm(form).credentials) return false
    if (form.connectionId || form.oauthGrantId || form.credentialsRaw.trim()) return true
    return namedCredentials(form, advancedJson) !== null
}

/** What a stored source_config unpacks into. */
export interface UnpackedConfig {
    /**
     * The picker key the config resolved to — 'duckdb/mysql' for a duckdb
     * config naming the mysql extension. The caller writes it to
     * form.sourceKey, which is how an edit and a draft land on the right tile
     * instead of on the advanced JSON one.
     */
    key: string
    /** Guided form fields to merge into the wizard's form. */
    fields: Partial<PipelineForm>
    /** Pretty-printed config for the JSON editor, kept whichever mode wins. */
    raw: string
    /** True when the config cannot be shown in a guided form. */
    advanced: boolean
}

/**
 * unpackSourceConfig turns a stored (or drafted) source_config into form
 * state. One function for both entry points: an edit and an AI draft land on
 * the same form, and they used to unpack it with two near-identical copies
 * that had already drifted apart at the edges.
 *
 * A guidable config fills the guided fields; anything else opens the JSON
 * editor. The raw text is kept either way so the guided/advanced toggle
 * always has something to show — except for a type whose config is not
 * hand-edited at all (file_upload's platform-managed file list), which is kept
 * so saving round-trips it but never switches the wizard into JSON mode.
 */
export function unpackSourceConfig(sourceType: string, sourceConfig: string): UnpackedConfig {
    const parsed = sourceConfig ? parseConfigObject(sourceConfig) : {}
    // The config decides which variant this is: a duckdb pipeline naming the
    // mysql extension is the MySQL tile. Without this a drafted or stored
    // config would land in the JSON box and the guided forms would be
    // invisible to everyone who did not pick the tile by hand first.
    const source = sourceFor(sourceType, parsed)
    if (source.guided && parsed && source.isGuidable(parsed)) {
        return {
            key: source.key,
            fields: source.toForm(parsed),
            raw: JSON.stringify(parsed, null, 2),
            advanced: false,
        }
    }
    return {
        key: source.key,
        fields: {},
        raw: sourceConfig ? JSON.stringify(parsed ?? {}, null, 2) : '',
        advanced: !source.fileDrop,
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
        case 'dataset_name':
            return 'datasetName'
        case 'connection_string':
        case 'access_key_id':
        case 'secret_access_key':
        case 'service_account_key':
            return 'credentialsRaw'
        case 'oauth':
            // The Google credential is chosen in the connection picker, not
            // typed: "this account is not authorized for Drive" has to land
            // beside the picker, not inside the collapsed advanced textarea.
            return 'connectionId'
        // --- duckdb ---
        case 'extension':
            // Chosen by picking a system, so the refusal belongs at the picker
            // — "this box does not accept the mysql extension" under a MySQL
            // tile, not inside a config the user never typed.
            return 'sourceKey'
        case 'attach':
            // Generated from host/port/user/database; the group they form is
            // the closest thing to a field it has.
            return 'attach'
        case 'tables':
        case 'tables.name':
        case 'tables.query':
        case 'tables.cursor_column':
        case 'tables.primary_key':
            return 'tables'
        case 'attach_params':
        case 'attach_params.password':
            return 'dbPassword'
        default:
            // Everything else (bucket_url, tables_config.*, incremental.*, …)
            // belongs to the source config. SourceCard renders this one
            // whether or not the JSON editor is open — in guided mode there is
            // no field to point at, and a violation with nowhere to render is
            // a violation the user never sees.
            return 'sourceConfigRaw'
    }
}
