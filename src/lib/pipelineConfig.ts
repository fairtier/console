// Pipeline config assembly and validation, lifted out of PipelineWizardView.
//
// The wizard offers two ways to describe a source: a guided form with named
// fields, and a raw JSON editor. What each source type knows about its own
// guided form lives in ./pipelineSources; this module is the part that is the
// same for all of them — packing the form into a config, unpacking a stored
// config back into the form, and routing a server validation error to the
// field that caused it.

import { sourceFor } from './pipelineSources'
import type { PipelineForm } from './pipelineSources'

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
    const source = sourceFor(form.sourceType)
    if (advancedJson || !source.guided) {
        const raw = form.sourceConfigRaw.trim()
        return raw ? JSON.parse(raw) : {}
    }
    return source.toConfig(form)
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
export function buildCredentials(form: PipelineForm): unknown {
    const source = sourceFor(form.sourceType)
    if (source.googleOAuth && form.connectionId) {
        return { oauth: { connection_id: form.connectionId } }
    }
    if (source.googleOAuth && form.oauthGrantId) {
        return { oauth: { grant_id: form.oauthGrantId } }
    }
    const raw = form.credentialsRaw.trim()
    return raw ? JSON.parse(raw) : {}
}

/**
 * credentialsProvided reports whether the user supplied new credentials this
 * session. It decides a contract, not a display: on update, empty credentials
 * mean "keep what is stored", so answering true for an untouched form would
 * overwrite a working credential with {}.
 */
export function credentialsProvided(form: PipelineForm): boolean {
    return !!form.connectionId || !!form.oauthGrantId || form.credentialsRaw.trim() !== ''
}

/** What a stored source_config unpacks into. */
export interface UnpackedConfig {
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
    const source = sourceFor(sourceType)
    let parsed: Record<string, unknown> | null = null
    try {
        parsed = sourceConfig ? (JSON.parse(sourceConfig) as Record<string, unknown>) : {}
    } catch {
        parsed = null
    }
    if (source.guided && parsed && source.isGuidable(parsed)) {
        return { fields: source.toForm(parsed), raw: JSON.stringify(parsed, null, 2), advanced: false }
    }
    return {
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
        default:
            // Everything else (bucket_url, tables_config.*, incremental.*, …)
            // belongs to the source config. SourceCard renders this one
            // whether or not the JSON editor is open — in guided mode there is
            // no field to point at, and a violation with nowhere to render is
            // a violation the user never sees.
            return 'sourceConfigRaw'
    }
}
