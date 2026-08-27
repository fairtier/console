// The contract every pipeline source type implements.
//
// `source_type` is a plain proto string, not an enum, so this registry is
// keyed by string and always has to answer for a type it has never heard of
// (a newer workspace-api, a self-hoster's own source). See `sourceFor` in
// ./index.ts — the fallback is part of the contract, not a safety net.

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

/**
 * The wizard's form, in full. Source modules read and write it through
 * `toConfig`/`toForm`/`defaults`, which is why it is declared here rather
 * than in the view: the registry's interface is defined over this shape.
 */
export interface PipelineForm {
    name: string
    sourceType: string
    // rest_api guided fields
    baseUrl: string
    resources: RestResource[]
    authMethod: string
    pagination: string
    // google_sheets guided fields
    spreadsheet: string
    rangeNames: string[]
    // google_sheets credential references (see the view for the full story)
    connectionId: string
    detach: boolean
    oauthGrantId: string
    oauthEmail: string
    // generic / advanced raw source_config
    sourceConfigRaw: string
    // credentials (secret)
    credentialsRaw: string
    // destination
    datasetName: string
    writeDisposition: string
    mergeStrategy: string
    schedule: string
}

/**
 * Which Google authorization a source needs to read its data.
 *
 * Not a boolean, because *which* one matters: the consent asks for exactly
 * what the source reads, so a Sheets pipeline never puts a "see your Google
 * Drive" permission in front of the user. '' means the source does not sign in
 * with Google at all.
 */
export type GoogleScope = '' | 'sheets' | 'drive'

/** Badge presentation for the pipelines list. */
export interface SourceBadge {
    abbr: string
    bg: string
    fg: string
}

/**
 * PipelineSource is everything the console knows about one source type.
 * Adding a source means adding a module here and listing it in ./index.ts —
 * not another branch in the wizard.
 */
export interface PipelineSource {
    /** The proto `source_type` value. */
    id: string
    /** i18n key for the human label, or '' for a type we have no string for. */
    labelKey: string
    badge: SourceBadge

    // --- Capabilities. Each one replaces a branch the wizard used to make. ---
    /** Has a guided form; without it the raw JSON editor is the only view. */
    guided: boolean
    /** Takes credentials from the user (file_upload does not — the platform
     *  injects the workspace's own storage credentials server-side). */
    credentials: boolean
    /** Can run on a cron. */
    schedulable: boolean
    /** Its data arrives by upload, so the wizard shows the file drop. */
    fileDrop: boolean
    /**
     * Which Google authorization this source needs, given its config — '' for
     * the sources that do not sign in with Google.
     *
     * A function of the config rather than a flag, because for `duckdb` the
     * answer lives inside it: the gdrive extension reads Google Drive, mysql
     * reads a database and must never trigger a Google consent. Every other
     * type ignores the argument.
     */
    googleScope(config: Record<string, unknown>): GoogleScope

    // --- Placeholders for the raw editors. ---
    /**
     * What the raw source_config editor shows when empty: a minimal, real
     * example of *this* type's shape.
     *
     * Per-source because one card renders that editor for every unguided
     * type, for any guided type switched to Advanced JSON, and for a type
     * this build has never heard of. A single hardcoded example is therefore
     * wrong for all but one of them — and was: a rest_api config greeted
     * sql_database, filesystem and duckdb alike. `{}` is the honest
     * placeholder for a shape we do not know.
     */
    configPlaceholder: string
    /** The same, for the raw credentials editor. */
    credentialsPlaceholder: string

    /**
     * True when a parsed config fits the guided form. False sends the wizard
     * to the advanced JSON editor so nothing the form cannot render is
     * silently dropped on save. Always false for an unguided type.
     */
    isGuidable(parsed: Record<string, unknown>): boolean

    /** Unpack a guidable config into the guided form fields. */
    toForm(parsed: Record<string, unknown>): Partial<PipelineForm>

    /** Build the source_config object from the guided form fields. */
    toConfig(form: PipelineForm): Record<string, unknown>

    /** Fields forced when the user selects this type while creating. */
    defaults?: Partial<PipelineForm>
}
