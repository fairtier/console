// The pipeline source-type registry.
//
// Everything the console knows per source type — its label, its badge, its
// guided form's shape, the defaults selecting it applies — lives in one module
// per type. Before this, that knowledge sat in four places at once: a
// hardcoded <option> list, the wizard's guided branches, the wizard's unpack
// branches, and a second colour/label map in the pipelines list.
//
// Adding a source is now a file plus a line in SOURCES.

import { duckDb } from './duckDb'
import { fileUpload } from './fileUpload'
import { genericSource } from './generic'
import { googleSheets } from './googleSheets'
import { restApi } from './restApi'
import type { PipelineSource } from './types'

export type { GoogleScope, PipelineForm, PipelineSource, RestResource, SourceBadge } from './types'
export { toRestResource } from './restApi'

/** Every source the wizard offers, in the order it offers them. */
export const SOURCES: PipelineSource[] = [
    restApi,
    // Shapes below mirror workspace-api's validators (workspace/
    // pipeline_schema.go) — an example that would be rejected on save is
    // just a slower version of the wrong placeholder these replace.
    genericSource(
        'sql_database',
        'pipelines.sourceTypes.sql_database',
        { abbr: 'SQL', bg: 'var(--info-soft)', fg: 'var(--info-ink)' },
        {
            config: '{\n  "tables": ["orders", "customers"]\n}',
            // PostgreSQL only — the worker image installs no other driver,
            // and the save refuses any other dialect.
            credentials: '{"connection_string": "postgresql://user:password@host:5432/shop"}',
        },
    ),
    genericSource(
        'filesystem',
        'pipelines.sourceTypes.filesystem',
        { abbr: 'FS', bg: 'var(--clay-soft)', fg: 'var(--clay-soft-ink)' },
        {
            config: '{\n  "bucket_url": "s3://my-bucket/exports",\n  "file_glob": "*.csv"\n}',
            credentials: '{"access_key_id": "…", "secret_access_key": "…"}',
        },
    ),
    googleSheets,
    fileUpload,
    duckDb,
]

const BY_ID = new Map(SOURCES.map((s) => [s.id, s]))

/**
 * sourceFor looks a `source_type` up, and always answers.
 *
 * `source_type` is a plain proto string: a workspace running a newer
 * workspace-api, or a self-hoster with a source of their own, can hold a type
 * this build has never heard of. Refusing to render it would hide a pipeline
 * the customer owns, so an unknown type gets a generic entry — the raw JSON
 * editor, a neutral badge abbreviated from the type itself, and an empty
 * labelKey meaning "show the raw type, there is no string for this".
 */
export function sourceFor(type: string): PipelineSource {
    const known = BY_ID.get(type)
    if (known) return known
    return genericSource(type, '', {
        abbr: type.slice(0, 3).toUpperCase(),
        bg: 'var(--inset)',
        fg: 'var(--ink-2)',
    })
}
