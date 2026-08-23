import { describe, expect, test } from 'bun:test'
import { parseSharedPrefs, resolveCookieDomain } from './prefs'

// The `ft_prefs` cookie sits on a parent domain, so every workspace under it
// can write it. parseSharedPrefs is therefore a trust boundary, not a
// convenience. These cases are the boundary.
describe('parseSharedPrefs', () => {
    const encode = (doc: unknown) => encodeURIComponent(JSON.stringify(doc))

    test('accepts a well-formed document', () => {
        const v = encode({ v: 1, theme: 'dark', locale: 'cs', ts: 1724400000000 })
        expect(parseSharedPrefs(v)).toEqual({ theme: 'dark', locale: 'cs', ts: 1724400000000 })
    })

    test('accepts a half document — one preference set, the other absent', () => {
        expect(parseSharedPrefs(encode({ v: 1, locale: 'en', ts: 1 }))).toEqual({
            theme: null,
            locale: 'en',
            ts: 1,
        })
    })

    test('rejects values outside the whitelist, per field', () => {
        // A garbage theme must not cost us the valid locale beside it, and must
        // never be handed back as a raw string.
        expect(parseSharedPrefs(encode({ v: 1, theme: 'neon', locale: 'cs', ts: 5 }))).toEqual({
            theme: null,
            locale: 'cs',
            ts: 5,
        })
        expect(parseSharedPrefs(encode({ v: 1, theme: 'dark', locale: 'zz', ts: 5 }))).toEqual({
            theme: 'dark',
            locale: null,
            ts: 5,
        })
    })

    test('rejects a document with nothing usable in it', () => {
        expect(parseSharedPrefs(encode({ v: 1, ts: 5 }))).toBeNull()
        expect(parseSharedPrefs(encode({ v: 1, theme: 'neon', locale: 'zz', ts: 5 }))).toBeNull()
    })

    test('drops keys that are not ours — nothing else may ride along', () => {
        const parsed = parseSharedPrefs(
            encode({ v: 1, theme: 'light', ts: 5, token: 'secret', admin: true })
        )
        expect(parsed).toEqual({ theme: 'light', locale: null, ts: 5 })
    })

    test('rejects a wrong or missing version', () => {
        expect(parseSharedPrefs(encode({ theme: 'dark', ts: 5 }))).toBeNull()
        expect(parseSharedPrefs(encode({ v: 2, theme: 'dark', ts: 5 }))).toBeNull()
        expect(parseSharedPrefs(encode({ v: '1', theme: 'dark', ts: 5 }))).toBeNull()
    })

    test('rejects malformed, oversized and non-object payloads', () => {
        expect(parseSharedPrefs('')).toBeNull()
        expect(parseSharedPrefs('not-json')).toBeNull()
        expect(parseSharedPrefs(encode(['dark']))).toBeNull()
        expect(parseSharedPrefs(encode('dark'))).toBeNull()
        expect(parseSharedPrefs(encode(null))).toBeNull()
        // Size ceiling comes before JSON.parse, so a megabyte of valid JSON is
        // rejected without being parsed.
        const fat = encode({ v: 1, theme: 'dark', ts: 5, pad: 'x'.repeat(2000) })
        expect(parseSharedPrefs(fat)).toBeNull()
    })

    test('a non-numeric ts degrades to 0 rather than winning', () => {
        // ts drives last-write-wins; NaN or "9999999999999" must not outrank a
        // real timestamp.
        expect(parseSharedPrefs(encode({ v: 1, theme: 'dark', ts: '9999999999999' }))?.ts).toBe(0)
        expect(parseSharedPrefs(encode({ v: 1, theme: 'dark' }))?.ts).toBe(0)
    })
})

describe('resolveCookieDomain', () => {
    // A hosted workspace and the Console that manages its account, under one
    // registrable domain.
    const workspace = 'console.customer-acme.example.com'
    const peer = 'console.example.com'

    test('scopes to the registrable domain shared with the account Console', () => {
        expect(resolveCookieDomain(workspace, peer)).toBe('.example.com')
        expect(resolveCookieDomain('example.com', peer)).toBe('.example.com')
    })

    test('self-host: no peer means a host-only cookie', () => {
        // The standalone default. A workspace on its own domain shares a parent
        // with nobody, and writing onto that parent would hand the preference
        // to every unrelated app its owner runs there.
        expect(resolveCookieDomain('console.acme.io', null)).toBeNull()
    })

    test('refuses a peer domain this workspace does not live under', () => {
        // A mis-set accountUrl must not aim preferences at someone else's
        // domain; the browser would drop such a cookie anyway.
        expect(resolveCookieDomain('console.acme.io', peer)).toBeNull()
        // …and a suffix that is not a label boundary is not a match either.
        expect(resolveCookieDomain('notexample.com', peer)).toBeNull()
    })

    test('no domain attribute where the peer has no registrable domain', () => {
        // Host-only is the right answer under `bun dev` and for a bare IP.
        expect(resolveCookieDomain('localhost', 'localhost')).toBeNull()
        expect(resolveCookieDomain('127.0.0.1', '127.0.0.1')).toBeNull()
        expect(resolveCookieDomain('[::1]', '[::1]')).toBeNull()
        expect(resolveCookieDomain(workspace, '')).toBeNull()
    })
})
