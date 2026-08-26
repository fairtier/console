import type { PipelineSource, SourceBadge } from './types'

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
export function genericSource(id: string, labelKey: string, badge: SourceBadge): PipelineSource {
    return {
        id,
        labelKey,
        badge,
        guided: false,
        credentials: true,
        schedulable: true,
        fileDrop: false,
        googleOAuth: false,
        isGuidable: () => false,
        toForm: () => ({}),
        toConfig: () => ({}),
    }
}
