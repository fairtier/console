// The database-shaped `duckdb` variants: MySQL and SQL Server.
//
// What the user sees is a host, a port, a database, a user and a password. What
// is saved is the ATTACH template the worker fills — DuckDB's own connection
// syntax, one dialect per extension, generated here and parsed back here so the
// form and the config never disagree about what a template means.
//
// The one real trade-off, and it is deliberate: every {placeholder} in the
// template is a credential (they live in `attach_params`, which lands
// encrypted), and everything else is plaintext in the customer's own box Gitea
// repo. So only the password is a placeholder. Making host/user/database
// placeholders too would encrypt a hostname and make the edit form unfillable —
// credentials are write-only, so re-opening the pipeline would show empty boxes
// under a "leave empty to keep" note over a *host* field. Legibility wins;
// `rest_api`'s base_url already behaves this way.

import { configExtensions, DUCKDB_BADGE, onlyGuidedKeys, parseTables, primaryExtension, tablesToConfig } from './duckDb'
import type { PipelineForm, PipelineSource } from './types'

/** The connection fields both dialects are built from. */
export interface DbFields {
    host: string
    port: string
    database: string
    user: string
}

/** The placeholder every dialect uses for the one secret part. */
const PASSWORD_PLACEHOLDER = '{password}'

interface Dialect {
    extension: string
    labelKey: string
    defaultPort: string
    /** form fields → ATTACH template. */
    render(f: DbFields): string
    /** ATTACH template → form fields, or null when this form cannot hold it. */
    parse(attach: string): DbFields | null
}

/**
 * MySQL's own connection syntax: space-separated `key=value` pairs
 * (duckdb.org/docs/stable/core_extensions/mysql).
 */
const mysqlDialect: Dialect = {
    extension: 'mysql',
    labelKey: 'pipelines.sourceTypes.duckdb_mysql',
    defaultPort: '3306',
    render(f) {
        const parts: string[] = []
        if (f.host.trim()) parts.push(`host=${f.host.trim()}`)
        if (f.port.trim()) parts.push(`port=${f.port.trim()}`)
        if (f.user.trim()) parts.push(`user=${f.user.trim()}`)
        if (f.database.trim()) parts.push(`database=${f.database.trim()}`)
        parts.push(`password=${PASSWORD_PLACEHOLDER}`)
        return parts.join(' ')
    },
    parse(attach) {
        const out: DbFields = { host: '', port: '', database: '', user: '' }
        let sawPassword = false
        for (const part of attach.trim().split(/\s+/).filter(Boolean)) {
            const eq = part.indexOf('=')
            if (eq <= 0) return null
            const key = part.slice(0, eq)
            const value = part.slice(eq + 1)
            switch (key) {
                case 'host':
                    out.host = value
                    break
                case 'port':
                    out.port = value
                    break
                case 'user':
                    out.user = value
                    break
                case 'database':
                    out.database = value
                    break
                case 'password':
                    // A literal password in the template would be plaintext in
                    // the box repo; only the placeholder is representable.
                    if (value !== PASSWORD_PLACEHOLDER) return null
                    sawPassword = true
                    break
                default:
                    // ssl_mode, socket, ssl_ca…: real options this form has no
                    // control for. The JSON editor keeps them.
                    return null
            }
        }
        return sawPassword ? out : null
    },
}

/**
 * SQL Server's ODBC-style connection string: `Key=Value` pairs separated by
 * `;`, the port appended to the server as `host,port`
 * (duckdb.org/community_extensions/extensions/mssql).
 */
const mssqlDialect: Dialect = {
    extension: 'mssql',
    labelKey: 'pipelines.sourceTypes.duckdb_mssql',
    defaultPort: '1433',
    render(f) {
        const parts: string[] = []
        const host = f.host.trim()
        const port = f.port.trim()
        if (host) parts.push(`Server=${port ? `${host},${port}` : host}`)
        if (f.database.trim()) parts.push(`Database=${f.database.trim()}`)
        if (f.user.trim()) parts.push(`User Id=${f.user.trim()}`)
        parts.push(`Password=${PASSWORD_PLACEHOLDER}`)
        return parts.join(';')
    },
    parse(attach) {
        const out: DbFields = { host: '', port: '', database: '', user: '' }
        let sawPassword = false
        for (const part of attach.split(';').map((p) => p.trim()).filter(Boolean)) {
            const eq = part.indexOf('=')
            if (eq <= 0) return null
            const key = part.slice(0, eq).trim()
            const value = part.slice(eq + 1).trim()
            switch (key) {
                case 'Server': {
                    const comma = value.lastIndexOf(',')
                    if (comma > 0) {
                        out.host = value.slice(0, comma)
                        out.port = value.slice(comma + 1)
                    } else {
                        out.host = value
                    }
                    break
                }
                case 'Database':
                    out.database = value
                    break
                case 'User Id':
                    out.user = value
                    break
                case 'Password':
                    if (value !== PASSWORD_PLACEHOLDER) return null
                    sawPassword = true
                    break
                default:
                    // Encrypt=…, TrustServerCertificate=…, an Entra ID auth
                    // mode: representable only as raw JSON.
                    return null
            }
        }
        return sawPassword ? out : null
    },
}

function databaseSource(d: Dialect): PipelineSource {
    return {
        key: `duckdb/${d.extension}`,
        id: 'duckdb',
        group: 'databases',
        requiresExtension: d.extension,
        labelKey: d.labelKey,
        badge: DUCKDB_BADGE,

        guided: true,
        credentials: true,
        // The whole credential: host, port, user and database are part of the
        // pipeline definition, and the password is the only encrypted half.
        credentialFields: [
            { field: 'dbPassword', labelKey: 'pipelinesUi.wizard.configure.duckdb.password', path: 'attach_params.password' },
        ],
        schedulable: true,
        fileDrop: false,
        // A database has nothing to do with Google, whatever else is in the
        // form. This is the variant that made googleScope a function.
        googleScope: () => '',
        database: { defaultPort: d.defaultPort },

        configPlaceholder:
            '{\n' +
            `  "extension": "${d.extension}",\n` +
            `  "attach": "${d.render({ host: 'db.internal', port: d.defaultPort, database: 'shop', user: 'readonly' })}",\n` +
            '  "tables": [{"name": "orders", "cursor_column": "updated_at"}]\n' +
            '}',
        credentialsPlaceholder: '{"attach_params": {"password": "…"}}',

        match: (parsed) => primaryExtension(parsed) === d.extension,

        isGuidable(parsed) {
            if (!onlyGuidedKeys(parsed)) return false
            // Exactly this one extension. A database ATTACH has no use for a
            // second, and a config carrying one means something this form
            // would drop on save.
            const loaded = configExtensions(parsed)
            if (!loaded || loaded.length !== 1 || loaded[0] !== d.extension) return false
            if (typeof parsed.attach !== 'string' || !d.parse(parsed.attach)) return false
            return parseTables(parsed.tables) !== null
        },

        toForm(parsed) {
            const fields = (typeof parsed.attach === 'string' ? d.parse(parsed.attach) : null) ?? {
                host: '',
                port: d.defaultPort,
                database: '',
                user: '',
            }
            return {
                dbHost: fields.host,
                dbPort: fields.port,
                dbDatabase: fields.database,
                dbUser: fields.user,
                // Never prefilled: credential material is write-only, and an
                // empty box means "keep what is stored".
                dbPassword: '',
                tables: parseTables(parsed.tables) ?? [],
            }
        },

        toConfig(form: PipelineForm) {
            return {
                extension: d.extension,
                attach: d.render({
                    host: form.dbHost,
                    port: form.dbPort,
                    database: form.dbDatabase,
                    user: form.dbUser,
                }),
                tables: tablesToConfig(form.tables),
            }
        },

        formErrors(form) {
            const errors: string[] = []
            if (!form.dbHost.trim()) errors.push('pipelines.validation.hostRequired')
            if (!form.dbDatabase.trim()) errors.push('pipelines.validation.databaseRequired')
            if (!form.tables.some((t) => t.name.trim())) errors.push('pipelines.validation.tablesRequired')
            return errors
        },

        // Selecting the type prefills the port and starts the table list empty.
        defaults: { dbPort: d.defaultPort, tables: [] },
    }
}

export const duckDbMysql = databaseSource(mysqlDialect)
export const duckDbMssql = databaseSource(mssqlDialect)
export const duckDbDatabases = [duckDbMysql, duckDbMssql]
