import { genericSource } from './generic'
import type { GoogleScope, PipelineSource } from './types'

/**
 * Extraction through a DuckDB extension: DuckDB reads, dlt lands. The config
 * is {extension, attach, tables} and the JSON editor is still its whole UI —
 * the guided per-system forms are Phase 2 of docs/plans/duckdb-source-ui.md
 * in the platform monorepo.
 *
 * It is a module of its own rather than another `genericSource(...)` line for
 * one reason: it is the only source type whose credentials depend on its
 * config. With `extension: "gdrive"` it reads Google Drive and signs in with
 * Google like google_sheets does; with any other extension a Google consent
 * would be nonsense. The backend accepts the Drive credential as of
 * workspace-api v0.33.0 — this is the half that lets a customer actually give
 * it one, instead of pasting a refresh token into a JSON box.
 */
const GDRIVE_EXTENSION = 'gdrive'

export const duckDb: PipelineSource = {
    ...genericSource(
        'duckdb',
        'pipelines.sourceTypes.duckdb',
        { abbr: 'DDB', bg: 'var(--info-soft)', fg: 'var(--info-ink)' },
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
    ),

    // The gdrive extension reads the customer's Google Drive; every other
    // extension reads something that has nothing to do with Google. The
    // backend takes the same view from the other end — it refuses an oauth
    // credential on any extension but this one — so the two agree without
    // either consulting the other.
    googleScope: (config): GoogleScope => (config.extension === GDRIVE_EXTENSION ? 'drive' : ''),
}
