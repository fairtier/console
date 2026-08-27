// The `duckdb` source family: one entry per system the customer has.
//
// Extraction through a DuckDB extension — DuckDB reads, dlt lands — is one
// proto `source_type` covering a MySQL database, a PDF, a web page, a file at a
// URL and a file in Google Drive. Nobody has a DuckDB engine, so the picker
// does not offer one: each of those is its own variant, keyed 'duckdb/<ext>',
// all saving `source_type: "duckdb"` with `extension` preset.
//
// Nothing is hidden by that — the Advanced JSON editor shows
// `"extension": "mysql"` verbatim, the badge still says DDB, and the base
// entry below is the raw-JSON escape hatch for a config no form can hold.
//
// The config shape is unchanged: everything here renders to the same
// {extension, attach, tables} the worker runs and the validator accepts. This
// module is a projection of it.

import { genericSource } from './generic'
import type { DuckTable, GoogleScope, PipelineSource } from './types'

/** The extension whose data lives in the customer's Google Drive. */
export const GDRIVE_EXTENSION = 'gdrive'

/** One badge for the whole family: the transport is what they share. */
export const DUCKDB_BADGE = { abbr: 'DDB', bg: 'var(--info-soft)', fg: 'var(--info-ink)' }

/** Keys a guided duckdb form can represent. Anything else opens as JSON. */
const GUIDED_KEYS = new Set(['extension', 'attach', 'tables'])
/** Keys of one `tables[]` entry the guided forms have controls for. */
const GUIDED_TABLE_KEYS = new Set(['name', 'query', 'cursor_column', 'primary_key'])

/** True when `parsed` carries no key beyond the guided set. */
export function onlyGuidedKeys(parsed: Record<string, unknown>, allowed = GUIDED_KEYS): boolean {
    return Object.keys(parsed).every((k) => allowed.has(k))
}

/**
 * parseTables normalizes a config's `tables` into the form's shape, or returns
 * null when the array carries something the form has no control for — an
 * `initial_value`, a key a newer box knows. Null means "open the JSON editor",
 * never "drop it".
 */
export function parseTables(value: unknown): DuckTable[] | null {
    if (!Array.isArray(value) || value.length === 0) return null
    const out: DuckTable[] = []
    for (const entry of value) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
        const o = entry as Record<string, unknown>
        if (!onlyGuidedKeys(o, GUIDED_TABLE_KEYS)) return null
        if (typeof o.name !== 'string' || !o.name) return null
        for (const k of ['query', 'cursor_column', 'primary_key']) {
            if (o[k] !== undefined && typeof o[k] !== 'string') return null
        }
        out.push({
            name: o.name,
            query: typeof o.query === 'string' ? o.query : '',
            cursorColumn: typeof o.cursor_column === 'string' ? o.cursor_column : '',
            primaryKey: typeof o.primary_key === 'string' ? o.primary_key : '',
        })
    }
    return out
}

/** The inverse: form rows back to `tables[]`, omitting every blank. */
export function tablesToConfig(tables: DuckTable[]): Record<string, string>[] {
    return tables
        .filter((t) => t.name.trim())
        .map((t) => {
            const row: Record<string, string> = { name: t.name.trim() }
            if (t.query.trim()) row.query = t.query.trim()
            if (t.cursorColumn.trim()) row.cursor_column = t.cursorColumn.trim()
            if (t.primaryKey.trim()) row.primary_key = t.primaryKey.trim()
            return row
        })
}

/** Escape a value for a single-quoted SQL string literal, as the worker does. */
export function sqlString(value: string): string {
    return value.replace(/'/g, "''")
}

/**
 * The base entry: `duckdb` with no form, which is where a config none of the
 * variants claims lands — an extension this build has no form for, or a shape
 * the form cannot hold. Its label says advanced, because reaching it means the
 * JSON editor is the UI.
 *
 * It keeps the config-dependent Google scope: a hand-written gdrive config
 * still signs in with Google rather than asking for a pasted refresh token.
 */
export const duckDb: PipelineSource = {
    ...genericSource(
        'duckdb',
        'pipelines.sourceTypes.duckdb',
        DUCKDB_BADGE,
        {
            // A database extension, which is the shape that needs the most
            // explaining: an ATTACH template whose every secret part is a
            // {placeholder} filled from the credentials below. Reader
            // extensions (pdf, webbed, httpfs, gdrive) take no attach and
            // give each table an explicit query over the reader function.
            config:
                '{\n' +
                '  "extension": "mysql",\n' +
                '  "attach": "host=db.internal port=3306 user=readonly database=shop password={password}",\n' +
                '  "tables": [{"name": "orders", "cursor_column": "updated_at"}]\n' +
                '}',
            credentials: '{"attach_params": {"password": "…"}}',
        },
        'advanced',
    ),

    // The gdrive extension reads the customer's Google Drive; every other
    // extension reads something that has nothing to do with Google. The
    // backend takes the same view from the other end — it refuses an oauth
    // credential on any extension but this one — so the two agree without
    // either consulting the other.
    googleScope: (config): GoogleScope => (config.extension === GDRIVE_EXTENSION ? 'drive' : ''),
}
