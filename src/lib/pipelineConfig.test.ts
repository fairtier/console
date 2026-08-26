import { describe, expect, test } from 'bun:test'
import { buildSourceConfig, formFieldFor, isValidJson, unpackSourceConfig } from './pipelineConfig'
import type { PipelineForm } from './pipelineSources'

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

describe('isValidJson', () => {
    test('blank counts as valid — it means "nothing supplied"', () => {
        expect(isValidJson('')).toBe(true)
        expect(isValidJson('   \n ')).toBe(true)
    })

    test('accepts an object and rejects a truncated one', () => {
        expect(isValidJson('{"a":1}')).toBe(true)
        expect(isValidJson('{"a":')).toBe(false)
    })
})

describe('buildSourceConfig', () => {
    test('a guided type builds from its fields', () => {
        const cfg = buildSourceConfig(blankForm({ baseUrl: 'https://api.example.com' }), false)
        expect(cfg).toEqual({ base_url: 'https://api.example.com', auth_method: 'bearer', pagination: 'none' })
    })

    test('advanced JSON wins over the guided fields', () => {
        const form = blankForm({ baseUrl: 'https://ignored', sourceConfigRaw: '{"base_url":"https://typed"}' })
        expect(buildSourceConfig(form, true)).toEqual({ base_url: 'https://typed' })
    })

    test('a type with no guided form uses the raw editor whatever the toggle says', () => {
        const form = blankForm({ sourceType: 'sql_database', sourceConfigRaw: '{"table_names":["t"]}' })
        expect(buildSourceConfig(form, false)).toEqual({ table_names: ['t'] })
    })

    test('an empty raw editor means an empty config, not a parse error', () => {
        expect(buildSourceConfig(blankForm({ sourceType: 'filesystem' }), false)).toEqual({})
    })

    test('throws on unparseable JSON rather than saving something the box cannot read', () => {
        const form = blankForm({ sourceType: 'filesystem', sourceConfigRaw: '{oops' })
        expect(() => buildSourceConfig(form, false)).toThrow()
    })
})

describe('unpackSourceConfig', () => {
    // One function now serves both entry points — opening a pipeline to edit
    // and applying an AI draft. They must land on the same form.
    test('a guidable config fills the guided fields and stays out of JSON mode', () => {
        const out = unpackSourceConfig('rest_api', '{"base_url":"https://x","resources":["users"]}')
        expect(out.advanced).toBe(false)
        expect(out.fields).toEqual({
            baseUrl: 'https://x',
            resources: [{ name: 'users', endpoint: '/users' }],
            authMethod: 'bearer',
            pagination: 'none',
        })
    })

    test('a config the form cannot render opens the JSON editor', () => {
        const out = unpackSourceConfig('rest_api', '{"base_url":"https://x","paginator":{"type":"json_link"}}')
        expect(out.advanced).toBe(true)
        expect(out.fields).toEqual({})
        // …and the JSON editor gets the whole config, pretty-printed, so the
        // key that caused the fallback is right there to edit.
        expect(JSON.parse(out.raw)).toEqual({ base_url: 'https://x', paginator: { type: 'json_link' } })
        expect(out.raw).toContain('\n')
    })

    test('an unknown source type opens the JSON editor rather than nothing', () => {
        const out = unpackSourceConfig('clickhouse', '{"dsn":"…"}')
        expect(out.advanced).toBe(true)
        expect(JSON.parse(out.raw)).toEqual({ dsn: '…' })
    })

    test('file_upload keeps its config but never switches into JSON mode', () => {
        // The platform-managed file list is not hand-edited; the wizard shows
        // the file drop where the editor would be. The raw is kept so saving
        // round-trips the list instead of erasing it.
        const out = unpackSourceConfig('file_upload', '{"files":[{"name":"a.csv"}]}')
        expect(out.advanced).toBe(false)
        expect(JSON.parse(out.raw)).toEqual({ files: [{ name: 'a.csv' }] })
    })

    test('an empty config leaves the editor empty, not showing "{}"', () => {
        expect(unpackSourceConfig('rest_api', '').raw).toBe('{}')
        expect(unpackSourceConfig('sql_database', '').raw).toBe('')
    })

    test('the guided form always wins back a config that fits it', () => {
        // The regression this guards: a pipeline saved from the guided form
        // must reopen in the guided form, not fall to advanced JSON.
        const saved = JSON.stringify({
            spreadsheet_url_or_id: 'abc',
            range_names: ['Sheet1'],
        })
        expect(unpackSourceConfig('google_sheets', saved).advanced).toBe(false)
    })
})

describe('formFieldFor', () => {
    test('routes the guided fields to their own inputs', () => {
        expect(formFieldFor('base_url')).toBe('baseUrl')
        expect(formFieldFor('spreadsheet_url_or_id')).toBe('spreadsheet')
        expect(formFieldFor('range_names')).toBe('rangeNames')
    })

    test('strips array indices so a per-resource violation finds the chip list', () => {
        expect(formFieldFor('resources')).toBe('resources')
        expect(formFieldFor('resources[0].endpoint')).toBe('resources')
        expect(formFieldFor('resources[3].name')).toBe('resources')
    })

    test('routes every credential path to the one credentials box', () => {
        for (const p of ['connection_string', 'access_key_id', 'secret_access_key', 'service_account_key']) {
            expect(formFieldFor(p)).toBe('credentialsRaw')
        }
    })

    test('falls back to the source-config editor for everything else', () => {
        for (const p of ['bucket_url', 'tables_config.name', 'incremental.cursor_path', 'wat']) {
            expect(formFieldFor(p)).toBe('sourceConfigRaw')
        }
    })

    test('every mapping names a real form field', () => {
        // The wizard renders an error only where a field with this id exists;
        // a typo here is an error that disappears.
        const known = new Set(['baseUrl', 'resources', 'spreadsheet', 'rangeNames', 'credentialsRaw', 'sourceConfigRaw'])
        const paths = [
            'base_url', 'resources', 'resources[0].name', 'resources[0].endpoint',
            'spreadsheet_url_or_id', 'range_names', 'connection_string', 'access_key_id',
            'secret_access_key', 'service_account_key', 'dataset_name', 'bucket_url',
        ]
        for (const p of paths) expect(known.has(formFieldFor(p))).toBe(true)
    })
})
