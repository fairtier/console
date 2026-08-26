import { describe, expect, test } from 'bun:test'
import { SOURCES, sourceFor, toRestResource } from './index'
import type { PipelineForm } from './types'

/** A blank wizard form, as the view initializes it. */
function blankForm(over: Partial<PipelineForm> = {}): PipelineForm {
    return {
        name: '',
        sourceType: 'rest_api',
        baseUrl: '',
        resources: [],
        authMethod: 'bearer',
        pagination: 'none',
        spreadsheet: '',
        rangeNames: [],
        connectionId: '',
        detach: false,
        oauthGrantId: '',
        oauthEmail: '',
        sourceConfigRaw: '',
        credentialsRaw: '',
        datasetName: '',
        writeDisposition: 'append',
        mergeStrategy: '',
        schedule: '',
        ...over,
    }
}

/** toForm → toConfig, the trip a config makes when opened and saved again. */
function roundTrip(type: string, parsed: Record<string, unknown>): Record<string, unknown> {
    const source = sourceFor(type)
    return source.toConfig(blankForm({ sourceType: type, ...source.toForm(parsed) }))
}

describe('the registry', () => {
    test('answers for a source type it has never heard of', () => {
        // source_type is a plain proto string: a newer workspace-api or a
        // self-hoster can hold a type this build does not know. Hiding that
        // pipeline is not an option, so it renders through the JSON editor.
        const unknown = sourceFor('clickhouse')
        expect(unknown.id).toBe('clickhouse')
        expect(unknown.guided).toBe(false)
        expect(unknown.isGuidable({ anything: 1 })).toBe(false)
        expect(unknown.badge.abbr).toBe('CLI')
        // No label key means "print the raw type" — never a missing-key box.
        expect(unknown.labelKey).toBe('')
    })

    test('every listed source has a distinct id and a label key', () => {
        const ids = SOURCES.map((s) => s.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const s of SOURCES) expect(s.labelKey).toStartWith('pipelines.sourceTypes.')
    })

    test('an unguided source never claims a config is guidable', () => {
        for (const s of SOURCES.filter((s) => !s.guided)) {
            expect(s.isGuidable({})).toBe(false)
        }
    })
})

describe('rest_api', () => {
    const restApi = sourceFor('rest_api')

    test('accepts the four keys the guided form has fields for', () => {
        expect(
            restApi.isGuidable({
                base_url: 'https://api.example.com',
                resources: ['users', 'orders'],
                auth_method: 'bearer',
                pagination: 'cursor',
            }),
        ).toBe(true)
        expect(restApi.isGuidable({})).toBe(true)
    })

    test('rejects any key the form would drop on save', () => {
        // The exact keys named in the review: a config carrying these opens in
        // the JSON editor rather than losing them.
        for (const extra of ['params', 'paginator', 'incremental', 'headers']) {
            expect(restApi.isGuidable({ base_url: 'https://x', [extra]: {} })).toBe(false)
        }
    })

    test('accepts object resources with exactly name and endpoint', () => {
        expect(restApi.isGuidable({ resources: [{ name: 'users', endpoint: '/v2/users' }] })).toBe(true)
        expect(restApi.isGuidable({ resources: [{ name: 'users' }] })).toBe(true)
    })

    test('rejects a resource carrying anything else', () => {
        expect(restApi.isGuidable({ resources: [{ name: 'users', primary_key: 'id' }] })).toBe(false)
    })

    test('rejects resources that are not an array of strings or objects', () => {
        expect(restApi.isGuidable({ resources: 'users' })).toBe(false)
        expect(restApi.isGuidable({ resources: [42] })).toBe(false)
        expect(restApi.isGuidable({ resources: [null] })).toBe(false)
        expect(restApi.isGuidable({ resources: [['users']] })).toBe(false)
    })

    test('a fully specified config survives the round trip unchanged', () => {
        const cfg = {
            base_url: 'https://api.example.com',
            resources: [{ name: 'users', endpoint: '/v2/users' }],
            auth_method: 'api_key',
            pagination: 'cursor',
        }
        expect(roundTrip('rest_api', cfg)).toEqual(cfg)
    })

    test('a partial config gains the two defaults it was already treated as having', () => {
        // auth_method and pagination are always written: the form has a
        // selected value for each, and an omitted key means the default.
        expect(roundTrip('rest_api', { base_url: 'https://x' })).toEqual({
            base_url: 'https://x',
            auth_method: 'bearer',
            pagination: 'none',
        })
    })

    test('the string shorthand expands to the object form on save', () => {
        expect(roundTrip('rest_api', { resources: ['users'] })).toEqual({
            resources: [{ name: 'users', endpoint: '/users' }],
            auth_method: 'bearer',
            pagination: 'none',
        })
    })

    test('an empty guided form writes no base_url and no resources', () => {
        expect(restApi.toConfig(blankForm())).toEqual({ auth_method: 'bearer', pagination: 'none' })
    })

    test('toForm always writes every field, so another type leaves no residue', () => {
        const fields = restApi.toForm({})
        expect(fields).toEqual({ baseUrl: '', resources: [], authMethod: 'bearer', pagination: 'none' })
    })

    test('toForm drops resource entries it cannot name', () => {
        const fields = restApi.toForm({ resources: ['users', '', { endpoint: '/x' }] })
        expect(fields.resources).toEqual([{ name: 'users', endpoint: '/users' }])
    })
})

describe('toRestResource', () => {
    test('expands the string shorthand into name + derived endpoint', () => {
        expect(toRestResource('users')).toEqual({ name: 'users', endpoint: '/users' })
    })

    test('keeps an explicit endpoint', () => {
        expect(toRestResource({ name: 'users', endpoint: '/v2/users' })).toEqual({
            name: 'users',
            endpoint: '/v2/users',
        })
    })

    test('derives the endpoint when the object omits or blanks it', () => {
        expect(toRestResource({ name: 'users' })).toEqual({ name: 'users', endpoint: '/users' })
        expect(toRestResource({ name: 'users', endpoint: '' })).toEqual({ name: 'users', endpoint: '/users' })
    })

    test('drops anything unnamed rather than inventing a name', () => {
        expect(toRestResource('')).toBeNull()
        expect(toRestResource({ endpoint: '/users' })).toBeNull()
        expect(toRestResource(null)).toBeNull()
        expect(toRestResource(42)).toBeNull()
    })
})

describe('google_sheets', () => {
    const sheets = sourceFor('google_sheets')

    test('accepts the spreadsheet reference and its range list', () => {
        expect(sheets.isGuidable({ spreadsheet_url_or_id: 'abc', range_names: ['Sheet1!A:D'] })).toBe(true)
        expect(sheets.isGuidable({})).toBe(true)
    })

    test('rejects an unknown key', () => {
        expect(sheets.isGuidable({ spreadsheet_url_or_id: 'abc', credentials: {} })).toBe(false)
    })

    test('rejects ranges that are not a list of strings', () => {
        expect(sheets.isGuidable({ range_names: 'Sheet1' })).toBe(false)
        expect(sheets.isGuidable({ range_names: [{ sheet: 'Sheet1' }] })).toBe(false)
    })

    test('a guidable config survives the round trip unchanged', () => {
        const cfg = { spreadsheet_url_or_id: 'abc123', range_names: ['Sheet1!A:D', 'Sheet2'] }
        expect(roundTrip('google_sheets', cfg)).toEqual(cfg)
    })

    test('omits the keys the user left blank rather than sending empties', () => {
        expect(roundTrip('google_sheets', {})).toEqual({})
    })

    test('is the only source that signs in with Google', () => {
        expect(SOURCES.filter((s) => s.googleOAuth).map((s) => s.id)).toEqual(['google_sheets'])
    })
})

describe('file_upload', () => {
    const upload = sourceFor('file_upload')

    test('takes no credentials and does not run on a schedule', () => {
        // The platform injects the workspace's own storage credentials, and
        // the pipeline runs when the user hits run after dropping a file.
        expect(upload.credentials).toBe(false)
        expect(upload.schedulable).toBe(false)
        expect(upload.fileDrop).toBe(true)
    })

    test('selecting it clears credentials, clears the schedule, replaces', () => {
        expect(upload.defaults).toEqual({ credentialsRaw: '', schedule: '', writeDisposition: 'replace' })
    })

    test('is the only source with a file drop', () => {
        expect(SOURCES.filter((s) => s.fileDrop).map((s) => s.id)).toEqual(['file_upload'])
    })
})

describe('labels', () => {
    // Adding a source is meant to be one file plus a line in SOURCES. The
    // failure mode of forgetting the strings is a picker reading
    // "pipelines.sourceTypes.whatever", which type-check cannot see.
    test('every source has a string in both locales', async () => {
        const en = (await import('../../i18n/locales/en')).default as Record<string, unknown>
        const cs = (await import('../../i18n/locales/cs')).default as Record<string, unknown>
        for (const locale of [en, cs]) {
            for (const s of SOURCES) {
                const value = s.labelKey.split('.').reduce<unknown>(
                    (node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined),
                    locale,
                )
                expect(typeof value).toBe('string')
                expect(value).not.toBe('')
            }
        }
    })
})
