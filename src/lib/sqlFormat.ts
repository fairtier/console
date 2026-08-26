// Deterministic SQL layout for the editor.
//
// The AI draft's shape is whatever the model felt like — the workspace-api
// prompt says nothing about formatting, on purpose: layout is a mechanical
// job, and a formatter is free, offline, idempotent and does not spend a
// round trip. Hand-typed SQL drifts the same way as it is edited, so the
// same button serves both.
import { formatDialect, duckdb } from 'sql-formatter'

// sql-formatter tree-shakes per dialect: importing `duckdb` alone (not
// `format`, which pulls every dialect) keeps this at ~19 kB gzipped.
const OPTIONS = {
    dialect: duckdb,
    keywordCase: 'upper',
    tabWidth: 2,
    expressionWidth: 80,
    linesBetweenQueries: 1,
} as const

/**
 * formatSql lays out a DuckDB statement. It never throws and never loses
 * text: anything the formatter cannot tokenize (a half-typed statement, a
 * dialect corner it does not know) comes back unchanged, because a Format
 * button that can eat the editor is worse than one that sometimes does
 * nothing.
 */
export function formatSql(sql: string): string {
    if (!sql.trim()) return sql
    try {
        return formatDialect(sql, OPTIONS)
    } catch {
        return sql
    }
}
