import { describe, expect, test } from 'bun:test'
import { formatSql } from './sqlFormat'

// What matters here is not the exact layout (that is sql-formatter's opinion)
// but the two promises the editor's Format button makes: DuckDB syntax
// survives the round trip, and nothing the user typed is ever lost.
describe('formatSql', () => {
    test('breaks a one-line draft into indented clauses', () => {
        const out = formatSql('select a, b from "ns"."t" where a > 1 order by b limit 200')
        expect(out).toContain('SELECT')
        expect(out).toContain('FROM')
        expect(out.split('\n').length).toBeGreaterThan(4)
    })

    test('is idempotent — formatting formatted SQL changes nothing', () => {
        const once = formatSql('select count(*) as n from "ns"."t" group by a limit 10')
        expect(formatSql(once)).toBe(once)
    })

    test('keeps DuckDB-only syntax intact', () => {
        // FILTER, QUALIFY, lambdas and struct literals are exactly what a
        // Postgres-dialect formatter would mangle.
        const sql = `SELECT count(*) FILTER (WHERE p = 1) AS c, list_transform(xs, x -> x.v * 2) AS d,
            {'a': 1} AS s FROM "ns"."t" QUALIFY row_number() OVER (ORDER BY ts DESC) = 1`
        const out = formatSql(sql)
        expect(out).toContain('FILTER')
        expect(out).toContain('QUALIFY')
        expect(out).toContain('x -> x.v * 2')
        expect(out).toContain("{'a': 1}")
    })

    test('leaves blank input alone', () => {
        expect(formatSql('')).toBe('')
        expect(formatSql('   \n ')).toBe('   \n ')
    })

    test('never throws on half-typed SQL', () => {
        // Mid-typing is the common case for a keyboard shortcut: whatever
        // comes back, it must not be an exception and must not be empty.
        for (const partial of ['select * fro', 'with x as (', "select '", 'SELECT a FROM']) {
            expect(() => formatSql(partial)).not.toThrow()
            expect(formatSql(partial).trim().length).toBeGreaterThan(0)
        }
    })
})
