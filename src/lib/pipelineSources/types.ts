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
 * One `tables[]` entry of a `duckdb` config, as the guided form edits it.
 *
 * Only the keys the form has controls for. A config carrying more (an
 * `initial_value`, a key a newer box knows) is not guidable and opens in the
 * JSON editor instead — the rule every guided form here follows.
 */
export interface DuckTable {
    name: string
    /** Empty = the worker's default, SELECT * FROM src."<name>". */
    query: string
    cursorColumn: string
    primaryKey: string
}

/**
 * The wizard's form, in full. Source modules read and write it through
 * `toConfig`/`toForm`/`defaults`, which is why it is declared here rather
 * than in the view: the registry's interface is defined over this shape.
 */
export interface PipelineForm {
    name: string
    /**
     * The picker's value: a *variant* key, not the proto `source_type`.
     *
     * They are the same string for every source that is one thing
     * ('rest_api'), and differ for the ones that are many: 'duckdb/mysql' and
     * 'duckdb/gdrive' both save `source_type: "duckdb"`. What goes on the wire
     * is `sourceForKey(form.sourceKey).id`, never this.
     */
    sourceKey: string
    // rest_api guided fields
    baseUrl: string
    resources: RestResource[]
    authMethod: string
    pagination: string
    // google_sheets guided fields
    spreadsheet: string
    rangeNames: string[]
    // duckdb database fields (mysql, mssql). Everything but the password is
    // plaintext in the box repo, on purpose — see PipelineSource.database.
    dbHost: string
    dbPort: string
    dbDatabase: string
    dbUser: string
    dbPassword: string
    // duckdb tables, for the database forms. Shared with nothing else: the
    // rest_api `resources` list is a different shape and reading one as the
    // other is how a form silently drops half a config.
    tables: DuckTable[]
    // duckdb reader fields (pdf, webbed, httpfs, gdrive)
    readerUrl: string
    readerFn: string
    readerTable: string
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

/**
 * Where a source sits in the picker.
 *
 * The picker lists *systems the customer has*, not our transports: MySQL sits
 * next to PostgreSQL under Databases even though one is a dlt source and the
 * other a DuckDB extension, because that difference is ours and not theirs.
 * 'advanced' is the raw-JSON end of the list — the base entry of a variant
 * family, and where a source type this build has never heard of lands.
 */
export type SourceGroup = 'databases' | 'files' | 'google' | 'apis' | 'advanced'

/** One reader function offered by a document/file source's "Read as" picker. */
export interface ReaderFunction {
    /** The DuckDB table function, e.g. 'read_pdf'. */
    fn: string
    labelKey: string
    /**
     * The extension that PROVIDES this function, when it is not the variant's
     * own — read_pdf over a Drive file needs `pdf` loaded beside `gdrive`.
     *
     * DuckDB autoloads no community extension's functions, so the pairing is
     * not an optimization: with gdrive alone, read_pdf does not exist. The
     * config says `extensions: ["gdrive", "pdf"]`, and the box has to accept
     * both — which is why the form filters this list against the allowlist the
     * bootstrap document serves rather than assuming it.
     */
    requiresExtension?: string
}

/**
 * What a reader-style duckdb source (pdf, webbed, httpfs, gdrive) needs from
 * the form: how the file is addressed, and which reader functions may read it.
 *
 * The reader list is data rather than markup so the generated query can be
 * round-tripped in a unit test — a generated `query` is exactly the kind of
 * string that drifts from the parser meant to read it back.
 */
export interface ReaderSpec {
    /** 'url' takes an http(s) URL; 'drive' takes a Google Drive file id. */
    address: 'url' | 'drive'
    /** Offered in order; the first is the default for a new pipeline. */
    functions: ReaderFunction[]
}

/** What a database-style duckdb source (mysql, mssql) needs from the form. */
export interface DatabaseSpec {
    /** Prefilled in the port field when the type is selected. */
    defaultPort: string
}

/**
 * A credential the guided form asks for by name, instead of by JSON textarea.
 *
 * Declared per source because the answer differs completely: a database wants
 * one password, a PDF at a public URL wants nothing at all (and used to be
 * shown a Credentials card with `{"api_key": "…"}` in it), and a Google source
 * wants a connection — which is the picker `googleScope` already turns on, not
 * a field.
 */
export interface CredentialField {
    /** The PipelineForm key it binds to. */
    field: 'dbPassword'
    labelKey: string
    /** Where it lands in source_credentials, e.g. 'attach_params.password'. */
    path: string
}

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
    /**
     * The registry's and the picker's identity — 'rest_api', 'duckdb/mysql'.
     *
     * Distinct from `id` because one proto source_type can be several things
     * the customer would name differently. Nobody has a DuckDB engine; they
     * have a MySQL database, a PDF, a file in Drive.
     */
    key: string
    /** The proto `source_type` value — what `submit()` actually sends. */
    id: string
    /** Which section of the picker this appears under. */
    group: SourceGroup
    /**
     * Claims a stored config for this variant, e.g. `cfg.extension === 'mysql'`.
     *
     * A family's base entry has no `match` and is the fallback: an extension
     * with no form of its own still opens, still edits, still saves — through
     * the JSON editor, the same contract `sourceFor` keeps for an unknown type.
     */
    match?(parsed: Record<string, unknown>): boolean
    /**
     * The DuckDB extension this variant needs the box to accept, if any.
     *
     * The box serves its allowlist in the bootstrap document, and the picker
     * offers the intersection — so adding an extension stays a three-repo
     * change (worker ↔ validator ↔ drafter) rather than a four-repo one, and a
     * box ahead of its Console is a non-event.
     */
    requiresExtension?: string
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

    /**
     * Guided-form problems the server would refuse, named before the save —
     * i18n keys, in the order they should be shown.
     *
     * The guided forms can produce a config the validator rejects (a reader
     * with no file, a database with no tables), and the discovery mechanism
     * for that must not be a round trip and a toast.
     */
    formErrors?(form: PipelineForm): string[]

    /** Fields forced when the user selects this type while creating. */
    defaults?: Partial<PipelineForm>

    /** Named credential fields the guided form asks for; [] means none. */
    credentialFields: CredentialField[]
    /** Present on the reader-style duckdb variants (pdf, webbed, httpfs, gdrive). */
    reader?: ReaderSpec
    /** Present on the database-style duckdb variants (mysql, mssql). */
    database?: DatabaseSpec
}
