import type { PipelineSource, SourceBadge, SourceGroup } from './types'

/**
 * genericSource builds an entry for a source type the console can list and
 * badge but has no guided form for: the raw JSON editor is its whole UI.
 *
 * It is also what `sourceFor` hands back for a `source_type` the console has
 * never heard of — a newer workspace-api, or a self-hoster's own source. That
 * pipeline still renders, still edits, and still saves; it just does so
 * through the JSON editor, which is the honest answer for a config whose
 * shape we do not know.
 */
export function genericSource(
    id: string,
    labelKey: string,
    badge: SourceBadge,
    placeholders: { config?: string; credentials?: string } = {},
    group: SourceGroup = 'advanced',
): PipelineSource {
    return {
        // A type with no variants is its own key. Only the duckdb family
        // splits the two, and its base entry keeps this identity.
        key: id,
        id,
        group,
        labelKey,
        badge,
        guided: false,
        credentials: true,
        credentialFields: [],
        schedulable: true,
        fileDrop: false,
        googleScope: () => '',
        // A type we know the shape of says so; a type we do not defaults to
        // `{}`, which claims nothing. Never another type's example.
        configPlaceholder: placeholders.config ?? '{}',
        credentialsPlaceholder: placeholders.credentials ?? '{}',
        isGuidable: () => false,
        toForm: () => ({}),
        toConfig: () => ({}),
    }
}
