import { describe, expect, test } from 'bun:test'
import {
    formFieldFor,
    isValidJson,
    restApiIsGuidable,
    sheetsIsGuidable,
    toRestResource,
} from './pipelineConfig'

// These characterize the guided-vs-advanced decision as it stands. The
// promise being pinned is not "the guided form is clever" but the opposite:
// it must refuse anything it cannot render, because accepting a config it
// only half-understands means saving it back with the rest silently dropped.

describe('restApiIsGuidable', () => {
    test('accepts the four keys the guided form has fields for', () => {
        expect(
            restApiIsGuidable({
                base_url: 'https://api.example.com',
                resources: ['users', 'orders'],
                auth_method: 'bearer',
                pagination: 'cursor',
            }),
        ).toBe(true)
    })

    test('accepts an empty config — a brand new pipeline', () => {
        expect(restApiIsGuidable({})).toBe(true)
    })

    test('rejects any key the form would drop on save', () => {
        // The exact keys named in the review: a config carrying these opens in
        // the JSON editor rather than losing them.
        for (const extra of ['params', 'paginator', 'incremental', 'headers']) {
            expect(restApiIsGuidable({ base_url: 'https://x', [extra]: {} })).toBe(false)
        }
    })

    test('accepts object resources with exactly name and endpoint', () => {
        expect(restApiIsGuidable({ resources: [{ name: 'users', endpoint: '/v2/users' }] })).toBe(true)
        expect(restApiIsGuidable({ resources: [{ name: 'users' }] })).toBe(true)
    })

    test('rejects a resource carrying anything else', () => {
        expect(restApiIsGuidable({ resources: [{ name: 'users', primary_key: 'id' }] })).toBe(false)
    })

    test('rejects resources that are not an array of strings or objects', () => {
        expect(restApiIsGuidable({ resources: 'users' })).toBe(false)
        expect(restApiIsGuidable({ resources: [42] })).toBe(false)
        expect(restApiIsGuidable({ resources: [null] })).toBe(false)
        expect(restApiIsGuidable({ resources: [['users']] })).toBe(false)
    })
})

describe('sheetsIsGuidable', () => {
    test('accepts the spreadsheet reference and its range list', () => {
        expect(sheetsIsGuidable({ spreadsheet_url_or_id: 'abc', range_names: ['Sheet1!A:D'] })).toBe(true)
        expect(sheetsIsGuidable({})).toBe(true)
    })

    test('rejects an unknown key', () => {
        expect(sheetsIsGuidable({ spreadsheet_url_or_id: 'abc', credentials: {} })).toBe(false)
    })

    test('rejects ranges that are not a list of strings', () => {
        expect(sheetsIsGuidable({ range_names: 'Sheet1' })).toBe(false)
        expect(sheetsIsGuidable({ range_names: [{ sheet: 'Sheet1' }] })).toBe(false)
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
