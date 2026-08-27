import type { PipelineForm, PipelineSource } from './types'

// Keys the guided form can fully represent (mirrors domain.googleSheetsConfig).
// Anything else falls back to advanced JSON.
const GUIDED_KEYS = new Set(['spreadsheet_url_or_id', 'range_names'])

export const googleSheets: PipelineSource = {
    key: 'google_sheets',
    id: 'google_sheets',
    group: 'google',
    labelKey: 'pipelines.sourceTypes.google_sheets',
    badge: { abbr: 'GS', bg: 'var(--ok-soft)', fg: 'var(--ok-ink)' },

    guided: true,
    credentials: true,
    // The credential is a Google connection, which googleScope turns on — not
    // a named field this card could render.
    credentialFields: [],
    schedulable: true,
    fileDrop: false,
    // Authenticates by signing in rather than by pasting a key. The raw
    // service-account textarea stays as the advanced fallback. Sheets only:
    // reading a spreadsheet by id needs no Drive access, which is what keeps
    // the customer's own Google app clear of a restricted scope.
    googleScope: () => 'sheets',

    configPlaceholder: '{\n  "spreadsheet_url_or_id": "…",\n  "range_names": ["Sheet1"]\n}',
    // For a Google source the raw editor is the service-account fallback,
    // not an api_key box: it is what the advanced <details> holds open when
    // signing in is unavailable.
    credentialsPlaceholder: '{"service_account_key": { … }}',

    isGuidable(parsed) {
        for (const k of Object.keys(parsed)) {
            if (!GUIDED_KEYS.has(k)) return false
        }
        if (parsed.range_names !== undefined) {
            if (!Array.isArray(parsed.range_names)) return false
            for (const r of parsed.range_names) {
                if (typeof r !== 'string') return false
            }
        }
        return true
    },

    toForm(parsed): Partial<PipelineForm> {
        return {
            spreadsheet: typeof parsed.spreadsheet_url_or_id === 'string' ? parsed.spreadsheet_url_or_id : '',
            rangeNames: Array.isArray(parsed.range_names)
                ? parsed.range_names.filter((r): r is string => typeof r === 'string')
                : [],
        }
    },

    toConfig(form) {
        const cfg: Record<string, unknown> = {}
        if (form.spreadsheet.trim()) cfg.spreadsheet_url_or_id = form.spreadsheet.trim()
        if (form.rangeNames.length) cfg.range_names = [...form.rangeNames]
        return cfg
    },
}
