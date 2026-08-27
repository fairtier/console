import { describe, expect, test } from 'bun:test'
import {
    buildCredentials,
    buildSourceConfig,
    credentialsProvided,
    formFieldFor,
    googleScopeFor,
    isValidJson,
    unpackSourceConfig,
} from './pipelineConfig'
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

describe('buildCredentials', () => {
    const sheets = (over: Partial<PipelineForm> = {}) => blankForm({ sourceType: 'google_sheets', ...over })

    test('a Google connection is sent as a reference, not a secret', () => {
        // The point of the connection: the backend resolves the refresh token
        // at render time, so reconnecting once in Integrations fixes every
        // pipeline that references it.
        expect(buildCredentials(sheets({ connectionId: 'conn-1' }))).toEqual({
            oauth: { connection_id: 'conn-1' },
        })
    })

    test('the connection wins over a one-shot grant and a pasted key', () => {
        const form = sheets({ connectionId: 'conn-1', oauthGrantId: 'g-1', credentialsRaw: '{"service_account_key":{}}' })
        expect(buildCredentials(form)).toEqual({ oauth: { connection_id: 'conn-1' } })
    })

    test('a one-shot grant is the fallback for a plane without connections', () => {
        expect(buildCredentials(sheets({ oauthGrantId: 'g-1' }))).toEqual({ oauth: { grant_id: 'g-1' } })
    })

    test('a service-account key is the fallback below that', () => {
        expect(buildCredentials(sheets({ credentialsRaw: '{"service_account_key":{"x":1}}' }))).toEqual({
            service_account_key: { x: 1 },
        })
    })

    test('a non-Google source ignores any stray connection reference', () => {
        // Selecting another type clears these, but the precedence must not
        // depend on that having happened: a rest_api pipeline must never be
        // saved with an oauth credential.
        const form = blankForm({ connectionId: 'conn-1', oauthGrantId: 'g-1', credentialsRaw: '{"api_key":"k"}' })
        expect(buildCredentials(form)).toEqual({ api_key: 'k' })
    })

    test('nothing supplied is an empty object, not a parse error', () => {
        expect(buildCredentials(blankForm())).toEqual({})
    })

    test('a duckdb/gdrive pipeline sends the same connection reference', () => {
        // The half that was missing: the backend has accepted this envelope on
        // duckdb since workspace-api v0.32.0, but the Console could only offer
        // a JSON box to paste a refresh token into.
        const form = blankForm({
            sourceType: 'duckdb',
            sourceConfigRaw: '{"extension":"gdrive","tables":[{"name":"invoices","query":"SELECT 1"}]}',
            connectionId: 'conn-1',
        })
        expect(buildCredentials(form)).toEqual({ oauth: { connection_id: 'conn-1' } })
    })

    test('a duckdb pipeline on another extension never sends one', () => {
        const form = blankForm({
            sourceType: 'duckdb',
            sourceConfigRaw: '{"extension":"mysql","attach":"host=db"}',
            connectionId: 'conn-1',
            credentialsRaw: '{"attach_params":{"password":"p"}}',
        })
        expect(buildCredentials(form)).toEqual({ attach_params: { password: 'p' } })
    })
})

describe('googleScopeFor', () => {
    test('names what the source reads, so the consent can ask for just that', () => {
        expect(googleScopeFor(blankForm({ sourceType: 'google_sheets' }))).toBe('sheets')
        expect(googleScopeFor(blankForm())).toBe('')
    })

    test('reads the duckdb answer out of its config', () => {
        const duck = (raw: string) => googleScopeFor(blankForm({ sourceType: 'duckdb', sourceConfigRaw: raw }))
        expect(duck('{"extension":"gdrive"}')).toBe('drive')
        expect(duck('{"extension":"mysql"}')).toBe('')
    })

    test('a config still being typed claims nothing rather than throwing', () => {
        // The editor is a textarea: every keystroke is a parse attempt, and
        // most of them are half a config.
        const duck = (raw: string) => googleScopeFor(blankForm({ sourceType: 'duckdb', sourceConfigRaw: raw }))
        expect(duck('{"extension": "gdri')).toBe('')
        expect(duck('')).toBe('')
        expect(duck('[1,2]')).toBe('')
    })
})

describe('credentialsProvided', () => {
    // On update, empty credentials mean "keep what is stored". Answering true
    // for an untouched form would overwrite a working credential with {}.
    test('false for an untouched form', () => {
        expect(credentialsProvided(blankForm())).toBe(false)
        expect(credentialsProvided(blankForm({ credentialsRaw: '   ' }))).toBe(false)
    })

    test('true for each of the three ways to supply one', () => {
        expect(credentialsProvided(blankForm({ connectionId: 'conn-1' }))).toBe(true)
        expect(credentialsProvided(blankForm({ oauthGrantId: 'g-1' }))).toBe(true)
        expect(credentialsProvided(blankForm({ credentialsRaw: '{"api_key":"k"}' }))).toBe(true)
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

    test('routes an oauth violation to the connection picker', () => {
        // "This account is not authorized for Drive" is about the account the
        // picker chose; inside the collapsed advanced textarea nobody sees it.
        expect(formFieldFor('oauth')).toBe('connectionId')
    })

    test('routes the dataset name to the destination field', () => {
        expect(formFieldFor('dataset_name')).toBe('datasetName')
    })

    test('falls back to the source-config editor for everything else', () => {
        for (const p of ['bucket_url', 'tables_config.name', 'incremental.cursor_path', 'wat']) {
            expect(formFieldFor(p)).toBe('sourceConfigRaw')
        }
    })

    test('every mapping names a real form field', () => {
        // The wizard renders an error only where a field with this id exists;
        // a typo here is an error that disappears.
        const known = new Set([
            'baseUrl', 'resources', 'spreadsheet', 'rangeNames',
            'credentialsRaw', 'sourceConfigRaw', 'datasetName', 'connectionId',
        ])
        const paths = [
            'base_url', 'resources', 'resources[0].name', 'resources[0].endpoint',
            'spreadsheet_url_or_id', 'range_names', 'connection_string', 'access_key_id',
            'secret_access_key', 'service_account_key', 'oauth', 'dataset_name', 'bucket_url',
        ]
        for (const p of paths) expect(known.has(formFieldFor(p))).toBe(true)
    })
})
