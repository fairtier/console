// The pipeline source-type registry.
//
// Everything the console knows per source type — its label, its badge, its
// guided form's shape, the defaults selecting it applies — lives in one module
// per type. Before this, that knowledge sat in four places at once: a
// hardcoded <option> list, the wizard's guided branches, the wizard's unpack
// branches, and a second colour/label map in the pipelines list.
//
// Adding a source is now a file plus a line in SOURCES.
//
// Since the duckdb family arrived there are two keys, not one. `id` is the
// proto `source_type` and is what the API sees; `key` is what the picker and
// this registry use, and one `id` can have several — 'duckdb/mysql',
// 'duckdb/gdrive'. The customer picks a system they have; the wire keeps the
// type it always had.

import { duckDb } from './duckDb'
import { duckDbDatabases } from './duckDbDatabase'
import { duckDbReaders } from './duckDbReader'
import { fileUpload } from './fileUpload'
import { genericSource } from './generic'
import { googleSheets } from './googleSheets'
import { restApi } from './restApi'
import type { PipelineSource, SourceGroup } from './types'

export type {
    CredentialField,
    DuckTable,
    GoogleScope,
    PipelineForm,
    PipelineSource,
    ReaderFunction,
    ReaderSpec,
    RestResource,
    SourceBadge,
    SourceGroup,
} from './types'
export { toRestResource } from './restApi'
export { toDriveId } from './duckDbReader'

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
            // and the save refuses any other dialect. Which is why MySQL and
            // SQL Server sit beside it in the picker as duckdb variants: the
            // split is ours, not the customer's.
            credentials: '{"connection_string": "postgresql://user:password@host:5432/shop"}',
        },
        'databases',
    ),
    genericSource(
        'filesystem',
        'pipelines.sourceTypes.filesystem',
        { abbr: 'FS', bg: 'var(--clay-soft)', fg: 'var(--clay-soft-ink)' },
        {
            config: '{\n  "bucket_url": "s3://my-bucket/exports",\n  "file_glob": "*.csv"\n}',
            credentials: '{"access_key_id": "…", "secret_access_key": "…"}',
        },
        'files',
    ),
    googleSheets,
    fileUpload,
    ...duckDbDatabases,
    ...duckDbReaders,
    // Last: the raw-JSON escape for a duckdb config no variant above claims.
    duckDb,
]

/** The order the picker renders its sections in. */
export const SOURCE_GROUPS: SourceGroup[] = ['databases', 'files', 'google', 'apis', 'advanced']

const BY_KEY = new Map(SOURCES.map((s) => [s.key, s]))

/** Every variant of one proto source_type, in registry order. */
const BY_ID = new Map<string, PipelineSource[]>()
for (const s of SOURCES) {
    const list = BY_ID.get(s.id)
    if (list) list.push(s)
    else BY_ID.set(s.id, [s])
}

/**
 * sourceFor looks a `source_type` up, and always answers.
 *
 * `source_type` is a plain proto string: a workspace running a newer
 * workspace-api, or a self-hoster with a source of their own, can hold a type
 * this build has never heard of. Refusing to render it would hide a pipeline
 * the customer owns, so an unknown type gets a generic entry — the raw JSON
 * editor, a neutral badge abbreviated from the type itself, and an empty
 * labelKey meaning "show the raw type, there is no string for this".
 *
 * Pass the parsed source_config to resolve a *variant*: `duckdb` with
 * `extension: "mysql"` is the MySQL tile, not the advanced one. Callers with
 * no config at hand (the pipelines-list badge) land on the family's base entry,
 * which is exactly what a badge wants.
 */
export function sourceFor(type: string, parsed?: Record<string, unknown> | null): PipelineSource {
    const variants = BY_ID.get(type)
    if (variants) {
        if (parsed) {
            const hit = variants.find((v) => v.match?.(parsed))
            if (hit) return hit
        }
        // The base entry — the one that claims nothing in particular.
        return variants.find((v) => !v.match) ?? variants[0]!
    }
    return genericSource(type, '', {
        abbr: type.slice(0, 3).toUpperCase(),
        bg: 'var(--inset)',
        fg: 'var(--ink-2)',
    })
}

/**
 * sourceForKey resolves what the picker is bound to.
 *
 * An unknown key is an unknown *type*: the two are the same string for every
 * source that is not a variant, and a pipeline holding a source_type this build
 * has never heard of reaches the picker as exactly that key.
 */
export function sourceForKey(key: string): PipelineSource {
    return BY_KEY.get(key) ?? sourceFor(key)
}

/**
 * visibleSources is what the picker offers, given the DuckDB extensions this
 * box accepts (`capabilities.duckdb_extensions` in the bootstrap document).
 *
 * The intersection of what the Console has a form for and what the box would
 * accept on save. A box too old to advertise the list (undefined) gets
 * everything, which is what happened before the field existed; an extension the
 * box accepts and this build has no form for stays reachable through the
 * advanced entry, which is why nothing here has to be released in lockstep.
 */
export function visibleSources(duckdbExtensions?: string[]): PipelineSource[] {
    if (!duckdbExtensions) return SOURCES
    const allowed = new Set(duckdbExtensions)
    return SOURCES.filter((s) => !s.requiresExtension || allowed.has(s.requiresExtension))
}
