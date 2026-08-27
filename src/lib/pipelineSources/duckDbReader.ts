// The reader-shaped `duckdb` variants: a PDF, a web page, a file at a URL, and
// a file in Google Drive.
//
// These extensions have no ATTACH concept — they are table functions — so the
// config is one `tables[]` entry whose `query` calls the reader. The form is
// therefore an address, a "Read as" picker and a table name; the SQL is
// generated here and parsed back here, and hand-editing it in the JSON editor
// is what moves the pipeline there for good (the rule every guided form
// follows).
//
// Which readers each variant may offer is not a style choice. The worker LOADs
// exactly ONE extension per pipeline, and DuckDB does not autoload a community
// extension's functions — verified against duckdb 1.5.5: with only `gdrive`
// loaded, read_pdf is "Table Function with name read_pdf does not exist". So a
// Drive source offers the readers DuckDB has built in (read_csv, read_parquet,
// read_json) and nothing else: a PDF *inside* Drive needs both `gdrive` and
// `pdf` loaded, which the config cannot express today. A PDF at an http(s) URL
// is the `pdf` variant and works — httpfs is baked and core extensions do
// autoload.

import { DUCKDB_BADGE, GDRIVE_EXTENSION, onlyGuidedKeys, sqlString } from './duckDb'
import type { GoogleScope, PipelineForm, PipelineSource, ReaderFunction } from './types'

/** `gdrive://id:<file id>` — by id, never by folder path. See toDriveId. */
const DRIVE_PREFIX = 'gdrive://id:'

/** The generated query, and the pattern that reads it back. */
const QUERY_RE = /^SELECT \* FROM ([a-z_]+)\('((?:[^']|'')*)'\)$/

function renderQuery(fn: string, address: string): string {
    return `SELECT * FROM ${fn}('${sqlString(address)}')`
}

/**
 * toDriveId accepts what a customer actually has — a Drive URL copied from the
 * address bar — and returns the file id inside it, or the input unchanged when
 * it already is one.
 *
 * The id, not a path, because the consent grants `drive.file`: it reaches the
 * individual files the customer points at, not the folders around them, so
 * `gdrive://Reports/monthly.pdf` resolves segment by segment against a listing
 * that cannot see them. Verified 2026-08-27 against the real extension.
 */
export function toDriveId(input: string): string {
    const v = input.trim()
    if (!v) return ''
    const byPath = v.match(/\/d\/([A-Za-z0-9_-]+)/) // /file/d/<id>/…, /spreadsheets/d/<id>/…
    if (byPath) return byPath[1]!
    const byQuery = v.match(/[?&]id=([A-Za-z0-9_-]+)/) // /open?id=<id>
    if (byQuery) return byQuery[1]!
    if (v.startsWith(DRIVE_PREFIX)) return v.slice(DRIVE_PREFIX.length)
    return v
}

interface ReaderVariant {
    extension: string
    labelKey: string
    group: 'files' | 'google'
    address: 'url' | 'drive'
    functions: ReaderFunction[]
    /** Example address for the JSON placeholder. */
    example: string
}

const READER_VARIANTS: ReaderVariant[] = [
    {
        extension: 'pdf',
        labelKey: 'pipelines.sourceTypes.duckdb_pdf',
        group: 'files',
        address: 'url',
        functions: [
            { fn: 'read_pdf', labelKey: 'pipelinesUi.wizard.configure.duckdb.readers.pdfText' },
            { fn: 'read_pdf_tables', labelKey: 'pipelinesUi.wizard.configure.duckdb.readers.pdfTables' },
        ],
        example: 'https://example.com/report.pdf',
    },
    {
        extension: 'webbed',
        labelKey: 'pipelines.sourceTypes.duckdb_webbed',
        group: 'files',
        address: 'url',
        functions: [
            { fn: 'html_extract_tables', labelKey: 'pipelinesUi.wizard.configure.duckdb.readers.htmlTables' },
            { fn: 'read_html', labelKey: 'pipelinesUi.wizard.configure.duckdb.readers.html' },
            { fn: 'read_xml', labelKey: 'pipelinesUi.wizard.configure.duckdb.readers.xml' },
        ],
        example: 'https://example.com/prices',
    },
    {
        extension: 'httpfs',
        labelKey: 'pipelines.sourceTypes.duckdb_httpfs',
        group: 'files',
        address: 'url',
        functions: [
            { fn: 'read_csv', labelKey: 'pipelinesUi.wizard.configure.duckdb.readers.csv' },
            { fn: 'read_parquet', labelKey: 'pipelinesUi.wizard.configure.duckdb.readers.parquet' },
            { fn: 'read_json', labelKey: 'pipelinesUi.wizard.configure.duckdb.readers.json' },
        ],
        example: 'https://example.com/exports/orders.csv',
    },
    {
        extension: GDRIVE_EXTENSION,
        labelKey: 'pipelines.sourceTypes.duckdb_gdrive',
        group: 'google',
        address: 'drive',
        // Built-in readers only — see the note at the top of this file.
        // read_csv is also how a *native* Google Sheet is read.
        functions: [
            { fn: 'read_csv', labelKey: 'pipelinesUi.wizard.configure.duckdb.readers.driveCsv' },
            { fn: 'read_parquet', labelKey: 'pipelinesUi.wizard.configure.duckdb.readers.parquet' },
            { fn: 'read_json', labelKey: 'pipelinesUi.wizard.configure.duckdb.readers.json' },
        ],
        example: '1a2b3c',
    },
]

function readerSource(v: ReaderVariant): PipelineSource {
    const defaultFn = v.functions[0]!.fn
    const known = new Set(v.functions.map((f) => f.fn))
    const addressOf = (raw: string): string =>
        v.address === 'drive' ? DRIVE_PREFIX + toDriveId(raw) : raw.trim()

    return {
        key: `duckdb/${v.extension}`,
        id: 'duckdb',
        group: v.group,
        requiresExtension: v.extension,
        labelKey: v.labelKey,
        badge: DUCKDB_BADGE,

        guided: true,
        // A public URL needs no credential, and a Credentials card offering
        // `{"api_key": "…"}` over one is worse than no card: the user has to
        // guess that leaving it empty is allowed. Drive is the exception — it
        // is paid for by signing in, which googleScope turns on.
        credentials: v.address === 'drive',
        credentialFields: [],
        schedulable: true,
        fileDrop: false,
        googleScope: (): GoogleScope => (v.address === 'drive' ? 'drive' : ''),
        reader: { address: v.address, functions: v.functions },

        configPlaceholder:
            '{\n' +
            `  "extension": "${v.extension}",\n` +
            `  "tables": [{"name": "pages", "query": "${renderQuery(defaultFn, addressOf(v.example))}"}]\n` +
            '}',
        // For Drive this is the advanced fallback shown when signing in is
        // unavailable, so it must be what a hand-written Drive credential
        // looks like — the DuckDB secret the extension reads — not the
        // connection reference the picker writes for you. For the public-URL
        // readers it is `{}`, because their credentials really are nothing.
        credentialsPlaceholder:
            v.address === 'drive'
                ? '{"secret": {"REFRESH_TOKEN": "…", "CLIENT_ID": "…", "CLIENT_SECRET": "…"}}'
                : '{}',

        match: (parsed) => parsed.extension === v.extension,

        isGuidable(parsed) {
            if (parsed.extension !== v.extension) return false
            // An `attach` here would be a shape this form cannot show at all.
            if (!onlyGuidedKeys(parsed, new Set(['extension', 'tables']))) return false
            if (!Array.isArray(parsed.tables) || parsed.tables.length !== 1) return false
            const t = parsed.tables[0] as Record<string, unknown> | null
            if (!t || typeof t !== 'object' || Array.isArray(t)) return false
            if (!onlyGuidedKeys(t, new Set(['name', 'query']))) return false
            if (typeof t.name !== 'string' || !t.name) return false
            if (typeof t.query !== 'string') return false
            const m = t.query.match(QUERY_RE)
            if (!m || !known.has(m[1]!)) return false
            const address = m[2]!.replace(/''/g, "'")
            return v.address !== 'drive' || address.startsWith(DRIVE_PREFIX)
        },

        toForm(parsed) {
            const t = (Array.isArray(parsed.tables) ? parsed.tables[0] : null) as Record<string, unknown> | null
            const query = t && typeof t.query === 'string' ? t.query : ''
            const m = query.match(QUERY_RE)
            const address = m ? m[2]!.replace(/''/g, "'") : ''
            return {
                readerUrl: v.address === 'drive' ? address.slice(DRIVE_PREFIX.length) : address,
                readerFn: m && known.has(m[1]!) ? m[1]! : defaultFn,
                readerTable: t && typeof t.name === 'string' ? t.name : '',
            }
        },

        toConfig(form: PipelineForm) {
            const table: Record<string, string> = {
                name: form.readerTable.trim(),
                query: renderQuery(form.readerFn || defaultFn, addressOf(form.readerUrl)),
            }
            return { extension: v.extension, tables: [table] }
        },

        formErrors(form) {
            const errors: string[] = []
            if (!form.readerUrl.trim()) {
                errors.push(
                    v.address === 'drive'
                        ? 'pipelines.validation.driveFileRequired'
                        : 'pipelines.validation.readerUrlRequired',
                )
            }
            if (!form.readerTable.trim()) errors.push('pipelines.validation.tableNameRequired')
            return errors
        },

        defaults: {
            readerFn: defaultFn,
            readerUrl: '',
            readerTable: '',
            // A reader takes no pasted credential; Drive is paid for by the
            // connection picker, which writes connectionId, not this.
            credentialsRaw: '',
        },
    }
}

export const duckDbReaders = READER_VARIANTS.map(readerSource)
