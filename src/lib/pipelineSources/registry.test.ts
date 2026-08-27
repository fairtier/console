import { describe, expect, test } from 'bun:test'
import { SOURCES, sourceFor, sourceForKey, toRestResource, visibleSources } from './index'
import type { PipelineForm } from './types'

/** A blank wizard form, as the view initializes it. */
function blankForm(over: Partial<PipelineForm> = {}): PipelineForm {
    return {
        name: '',
        sourceKey: 'rest_api',
        baseUrl: '',
        resources: [],
        authMethod: 'bearer',
        pagination: 'none',
        spreadsheet: '',
        rangeNames: [],
        dbHost: '',
        dbPort: '',
        dbDatabase: '',
        dbUser: '',
        dbPassword: '',
        tables: [],
        readerUrl: '',
        readerFn: '',
        readerTable: '',
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

/**
 * toForm → toConfig, the trip a config makes when opened and saved again.
 *
 * Resolved through the config, so a duckdb config lands on the variant that
 * owns it rather than on the family's advanced entry.
 */
function roundTrip(type: string, parsed: Record<string, unknown>): Record<string, unknown> {
    const source = sourceFor(type, parsed)
    return source.toConfig(blankForm({ sourceKey: source.key, ...source.toForm(parsed) }))
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

    test('every listed source has a distinct key and a label key', () => {
        // Distinct *keys*, not ids: several duckdb variants share one proto
        // source_type on purpose. Two entries with the same key would make the
        // picker ambiguous and SOURCE_FORMS pick one at random.
        const keys = SOURCES.map((s) => s.key)
        expect(new Set(keys).size).toBe(keys.length)
        for (const s of SOURCES) expect(s.labelKey).toStartWith('pipelines.sourceTypes.')
    })

    test('a variant is claimed by its config, and only by its config', () => {
        // The resolution the whole family rests on: what the customer picked
        // has to be recoverable from what was saved, or an edit reopens on the
        // advanced JSON entry and the guided forms are invisible.
        expect(sourceFor('duckdb', { extension: 'mysql' }).key).toBe('duckdb/mysql')
        expect(sourceFor('duckdb', { extension: 'gdrive' }).key).toBe('duckdb/gdrive')
        // An extension no variant knows: the base entry, not nothing.
        expect(sourceFor('duckdb', { extension: 'oracle_scanner' }).key).toBe('duckdb')
        // And a caller with no config at hand (the pipelines-list badge).
        expect(sourceFor('duckdb').key).toBe('duckdb')
    })

    test('the picker key is what resolves a source, and an unknown one still answers', () => {
        expect(sourceForKey('duckdb/pdf').id).toBe('duckdb')
        expect(sourceForKey('rest_api').id).toBe('rest_api')
        // A source_type from a newer box arrives as its own key.
        expect(sourceForKey('clickhouse').id).toBe('clickhouse')
        expect(sourceForKey('clickhouse').guided).toBe(false)
    })

    test('the picker offers only extensions this box accepts', () => {
        // The fourth parity leg this avoids: the box serves its allowlist, the
        // Console renders the intersection. A tile the box would refuse on save
        // is a promise the product cannot keep.
        const keys = visibleSources(['mysql', 'gdrive']).map((s) => s.key)
        expect(keys).toContain('duckdb/mysql')
        expect(keys).toContain('duckdb/gdrive')
        expect(keys).not.toContain('duckdb/mssql')
        expect(keys).not.toContain('duckdb/pdf')
        // Everything that needs no extension is untouched...
        expect(keys).toContain('rest_api')
        expect(keys).toContain('duckdb')
        // ...and a box too old to say gets the whole list, as before.
        expect(visibleSources(undefined)).toEqual(SOURCES)
    })

    test('every source belongs to a section the picker renders', () => {
        const groups = new Set(['databases', 'files', 'google', 'apis', 'advanced'])
        for (const s of SOURCES) expect(groups.has(s.group)).toBe(true)
    })

    test('shows its own shape in the raw editors, never another type\'s', () => {
        // The bug this replaces: one hardcoded rest_api example served as the
        // placeholder for sql_database, filesystem and duckdb alike, over a
        // credentials box that always said api_key. A wrong example is worse
        // than none — it is the only hint the screen offers.
        for (const s of SOURCES) {
            // An ellipsis stands for the value the user types; everything
            // around it has to be JSON the backend would actually accept.
            for (const ph of [s.configPlaceholder, s.credentialsPlaceholder]) {
                expect(() => JSON.parse(ph.replace(/\{ … \}/g, '{}').replace(/…/g, 'x'))).not.toThrow()
            }
        }
        // Each unguided type names a key only it has.
        expect(sourceFor('sql_database').configPlaceholder).toContain('tables')
        expect(sourceFor('sql_database').credentialsPlaceholder).toContain('connection_string')
        expect(sourceFor('filesystem').configPlaceholder).toContain('bucket_url')
        expect(sourceFor('filesystem').credentialsPlaceholder).toContain('access_key_id')
        expect(sourceFor('duckdb').configPlaceholder).toContain('extension')
        expect(sourceFor('duckdb').credentialsPlaceholder).toContain('attach_params')
        // And a type we have never heard of claims nothing at all.
        expect(sourceFor('clickhouse').configPlaceholder).toBe('{}')
        expect(sourceFor('clickhouse').credentialsPlaceholder).toBe('{}')
    })

    test('a guided source\'s advanced-JSON example is one its own form accepts', () => {
        for (const s of SOURCES.filter((s) => s.guided)) {
            expect(s.isGuidable(JSON.parse(s.configPlaceholder.replace(/…/g, 'x')))).toBe(true)
        }
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

    test('asks for Sheets access, never Drive', () => {
        // Reading a spreadsheet by id needs no Drive scope, and asking for one
        // would drag the customer's own Google app into a restricted-scope
        // review it never needed.
        expect(sheets.googleScope({})).toBe('sheets')
    })

    test('only the two Google sources sign in, and each for its own access', () => {
        // A Sheets pipeline must never put a "see your Google Drive"
        // permission in front of a customer, and a MySQL one must never put a
        // Google consent in front of them at all.
        const always = SOURCES.filter((s) => s.googleScope({}) !== '').map((s) => [s.key, s.googleScope({})])
        expect(always).toEqual([
            ['google_sheets', 'sheets'],
            ['duckdb/gdrive', 'drive'],
        ])
    })
})

describe('duckdb (the advanced entry)', () => {
    const duckdb = sourceFor('duckdb')

    test('signs in with Google for gdrive, and for nothing else', () => {
        // Still config-dependent here: a hand-written gdrive config signs in
        // rather than asking for a pasted refresh token.
        expect(duckdb.googleScope({ extension: 'gdrive' })).toBe('drive')
        expect(duckdb.googleScope({ extension: 'mysql' })).toBe('')
        expect(duckdb.googleScope({})).toBe('')
    })

    test('is the raw JSON editor, which is what reaching it means', () => {
        expect(duckdb.guided).toBe(false)
        expect(duckdb.isGuidable({ extension: 'gdrive' })).toBe(false)
    })
})

describe('duckdb databases', () => {
    const mysql = sourceForKey('duckdb/mysql')
    const mssql = sourceForKey('duckdb/mssql')

    test('saves the proto source_type, never the picker key', () => {
        expect(mysql.id).toBe('duckdb')
        expect(mysql.requiresExtension).toBe('mysql')
    })

    test('a MySQL form renders the extension ATTACH syntax, password apart', () => {
        const cfg = mysql.toConfig(
            blankForm({
                sourceKey: 'duckdb/mysql',
                dbHost: 'db.internal',
                dbPort: '3306',
                dbUser: 'readonly',
                dbDatabase: 'shop',
                dbPassword: 'never-in-here',
                tables: [{ name: 'orders', query: '', cursorColumn: 'updated_at', primaryKey: 'id' }],
            }),
        )
        expect(cfg).toEqual({
            extension: 'mysql',
            attach: 'host=db.internal port=3306 user=readonly database=shop password={password}',
            tables: [{ name: 'orders', cursor_column: 'updated_at', primary_key: 'id' }],
        })
        // The password is a credential; it must never reach source_config.
        expect(JSON.stringify(cfg)).not.toContain('never-in-here')
    })

    test('SQL Server renders its own dialect, not MySQL\'s', () => {
        const cfg = mssql.toConfig(
            blankForm({
                sourceKey: 'duckdb/mssql',
                dbHost: 'sql.internal',
                dbPort: '1433',
                dbUser: 'sa',
                dbDatabase: 'shop',
                tables: [{ name: 'orders', query: '', cursorColumn: '', primaryKey: '' }],
            }),
        ) as Record<string, string>
        expect(cfg.attach).toBe('Server=sql.internal,1433;Database=shop;User Id=sa;Password={password}')
    })

    test('a generated config survives the round trip unchanged', () => {
        for (const [key, cfg] of [
            [
                'duckdb/mysql',
                {
                    extension: 'mysql',
                    attach: 'host=db.internal port=3306 user=readonly database=shop password={password}',
                    tables: [{ name: 'orders', cursor_column: 'updated_at', primary_key: 'id' }],
                },
            ],
            [
                'duckdb/mssql',
                {
                    extension: 'mssql',
                    attach: 'Server=sql.internal,1433;Database=shop;User Id=sa;Password={password}',
                    tables: [{ name: 'orders' }],
                },
            ],
        ] as [string, Record<string, unknown>][]) {
            const source = sourceForKey(key)
            expect(source.isGuidable(cfg)).toBe(true)
            expect(source.toConfig(blankForm({ sourceKey: key, ...source.toForm(cfg) }))).toEqual(cfg)
        }
    })

    test('a template the form cannot hold opens in the JSON editor instead', () => {
        // Everything here is a real MySQL option with no control on the form.
        // Guessing at them would drop them silently on save.
        expect(mysql.isGuidable({ extension: 'mysql', attach: 'host=db ssl_mode=REQUIRED password={password}' })).toBe(false)
        // A literal password would be plaintext in the box repo.
        expect(mysql.isGuidable({ extension: 'mysql', attach: 'host=db password=hunter2' })).toBe(false)
        // A table carrying a key the form has no control for.
        expect(
            mysql.isGuidable({
                extension: 'mysql',
                attach: 'host=db password={password}',
                tables: [{ name: 'orders', initial_value: 5 }],
            }),
        ).toBe(false)
        // ...and another extension's config is never this variant's.
        expect(mysql.isGuidable({ extension: 'mssql', attach: 'Password={password}' })).toBe(false)
    })

    test('the password never comes back from the server into the form', () => {
        const fields = mysql.toForm({
            extension: 'mysql',
            attach: 'host=db.internal password={password}',
            tables: [{ name: 'orders' }],
        })
        expect(fields.dbPassword).toBe('')
        expect(fields.dbHost).toBe('db.internal')
    })

    test('names what the save would refuse, before the save', () => {
        const empty = blankForm({ sourceKey: 'duckdb/mysql' })
        expect(mysql.formErrors?.(empty)).toEqual([
            'pipelines.validation.hostRequired',
            'pipelines.validation.databaseRequired',
            'pipelines.validation.tablesRequired',
        ])
    })
})

describe('duckdb readers', () => {
    const pdf = sourceForKey('duckdb/pdf')
    const gdrive = sourceForKey('duckdb/gdrive')

    test('a PDF at a URL becomes one table with a generated query', () => {
        const cfg = pdf.toConfig(
            blankForm({
                sourceKey: 'duckdb/pdf',
                readerUrl: 'https://example.com/report.pdf',
                readerFn: 'read_pdf',
                readerTable: 'report_pages',
            }),
        )
        expect(cfg).toEqual({
            extension: 'pdf',
            tables: [{ name: 'report_pages', query: "SELECT * FROM read_pdf('https://example.com/report.pdf')" }],
        })
        expect(pdf.isGuidable(cfg as Record<string, unknown>)).toBe(true)
    })

    test('a hand-edited query keeps the pipeline in the JSON editor', () => {
        expect(
            pdf.isGuidable({
                extension: 'pdf',
                tables: [{ name: 'pages', query: "SELECT page, text FROM read_pdf('https://x/a.pdf') WHERE page < 3" }],
            }),
        ).toBe(false)
        // A reader function this variant does not offer is not this form's.
        expect(
            pdf.isGuidable({ extension: 'pdf', tables: [{ name: 'pages', query: "SELECT * FROM read_html('https://x')" }] }),
        ).toBe(false)
        // More than one table needs the editor: the form has one address.
        expect(
            pdf.isGuidable({
                extension: 'pdf',
                tables: [
                    { name: 'a', query: "SELECT * FROM read_pdf('https://x/a.pdf')" },
                    { name: 'b', query: "SELECT * FROM read_pdf('https://x/b.pdf')" },
                ],
            }),
        ).toBe(false)
    })

    test('Drive addresses a file by id, and takes the id out of a pasted link', () => {
        const cfg = gdrive.toConfig(
            blankForm({
                sourceKey: 'duckdb/gdrive',
                readerUrl: 'https://drive.google.com/file/d/1a2b3c/view?usp=sharing',
                readerFn: 'read_csv',
                readerTable: 'invoices',
            }),
        )
        // One extension stays singular: `extension`, not a one-item list.
        expect(cfg).toEqual({
            extension: 'gdrive',
            tables: [{ name: 'invoices', query: "SELECT * FROM read_csv('gdrive://id:1a2b3c')" }],
        })
        expect(gdrive.toForm(cfg as Record<string, unknown>).readerUrl).toBe('1a2b3c')
    })

    test('a Drive reader declares the extension that provides it', () => {
        // DuckDB autoloads no community extension's functions (verified
        // against duckdb 1.5.5: with only gdrive loaded, read_pdf does not
        // exist), so a Drive PDF is two extensions, not one. Built-in readers
        // declare nothing — they cost no second LOAD.
        const byFn = new Map((gdrive.reader?.functions ?? []).map((f) => [f.fn, f.requiresExtension]))
        expect(byFn.get('read_csv')).toBeUndefined()
        expect(byFn.get('read_pdf')).toBe('pdf')
        expect(byFn.get('read_xml')).toBe('webbed')
    })

    test('a Drive PDF loads gdrive AND pdf, gdrive first', () => {
        // Order is meaning: the first extension is the ATTACH TYPE and the
        // default secret type, and the secret here is gdrive's.
        const cfg = gdrive.toConfig(
            blankForm({
                sourceKey: 'duckdb/gdrive',
                readerUrl: '1a2b3c',
                readerFn: 'read_pdf',
                readerTable: 'invoice_pages',
            }),
        )
        expect(cfg).toEqual({
            extensions: ['gdrive', 'pdf'],
            tables: [{ name: 'invoice_pages', query: "SELECT * FROM read_pdf('gdrive://id:1a2b3c')" }],
        })
        expect(gdrive.isGuidable(cfg as Record<string, unknown>)).toBe(true)
        expect(gdrive.toForm(cfg as Record<string, unknown>).readerFn).toBe('read_pdf')
        // Still a Google source: gdrive anywhere in the list, not just first.
        expect(gdrive.googleScope(cfg as Record<string, unknown>)).toBe('drive')
    })

    test('a reader and a LOAD list that disagree open in the JSON editor', () => {
        // This exact config — read_pdf under gdrive alone — is what validated,
        // saved, and then failed on the box. The form must not silently
        // rewrite it into the pairing on save.
        expect(
            gdrive.isGuidable({
                extension: 'gdrive',
                tables: [{ name: 'pages', query: "SELECT * FROM read_pdf('gdrive://id:1a2b3c')" }],
            }),
        ).toBe(false)
        // ...and the other way round: a list carrying an extension no reader
        // in this form asks for.
        expect(
            gdrive.isGuidable({
                extensions: ['gdrive', 'webbed'],
                tables: [{ name: 'rows', query: "SELECT * FROM read_csv('gdrive://id:1a2b3c')" }],
            }),
        ).toBe(false)
    })

    test('the plural form belongs to the extension it leads with', () => {
        // ["gdrive", "pdf"] is a Drive source that reads a PDF, not a PDF
        // source that happens to sit in Drive.
        expect(sourceFor('duckdb', { extensions: ['gdrive', 'pdf'] }).key).toBe('duckdb/gdrive')
        expect(sourceFor('duckdb', { extension: 'pdf' }).key).toBe('duckdb/pdf')
        // Both forms at once is not a config any variant claims.
        expect(sourceFor('duckdb', { extension: 'pdf', extensions: ['pdf'] }).key).toBe('duckdb')
    })

    test('a public URL is not asked for credentials at all', () => {
        // The card used to appear over a public PDF with `{"api_key": "…"}`
        // in it, leaving the user to guess that empty was allowed.
        expect(pdf.credentials).toBe(false)
        expect(gdrive.credentials).toBe(true)
        expect(gdrive.googleScope({})).toBe('drive')
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
