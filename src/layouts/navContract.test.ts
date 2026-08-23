import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { ACCOUNT_NAV, LOCAL_CONTRACT_PATHS, foreignUrl } from './navContract'
import { navGroups, visibleNavGroups, visibleNavItems } from './navModel'

const ACCOUNT = 'https://console.example.com'

// The union menu is two apps linking into each other by hardcoded path, so the
// failure it invites is silent: rename a route here and the account Console's
// "Pipelines" entry 404s, with nothing in this repo to notice. These tests are
// the notice.
describe('the URL contract', () => {
    const routerSource = readFileSync(new URL('../router/index.ts', import.meta.url), 'utf8')

    test('every path we publish still resolves in our router', () => {
        for (const path of LOCAL_CONTRACT_PATHS) {
            // Children are declared relative ('overview'), top-level ones
            // absolute — accept either, and a redirect counts: the contract
            // promises reachability, not a component.
            const bare = path.replace(/^\//, '')
            expect(
                routerSource,
                `${path} is in the contract but no longer a route — the account Console links to it`
            ).toMatch(new RegExp(`path: '/?${bare}'`))
        }
    })

    test('every screen in our sidebar is a path we publish', () => {
        // The other half of the same promise: a screen worth a menu entry here
        // is a screen the account Console's menu shows too, so it has to be in
        // the contract. (`pipeline-new` has no menu entry and needs none.)
        const routed = navGroups.flatMap((g) => g.items).map((i) => i.name)
        for (const name of routed) {
            expect(LOCAL_CONTRACT_PATHS as readonly string[]).toContain(`/${name}`)
        }
    })

    test('the account Console paths are absolute and unique', () => {
        const paths = ACCOUNT_NAV.flatMap((g) => g.items.map((i) => i.path))
        for (const path of paths) expect(path).toMatch(/^\/[a-z-]+$/)
        expect(new Set(paths).size).toBe(paths.length)

        const ids = ACCOUNT_NAV.flatMap((g) => g.items.map((i) => i.id))
        expect(new Set(ids).size).toBe(ids.length)
    })

    test('foreignUrl joins onto the account origin, whatever the base looks like', () => {
        expect(foreignUrl(ACCOUNT, '/billing')).toBe(`${ACCOUNT}/billing`)
        expect(foreignUrl(`${ACCOUNT}/`, '/billing')).toBe(`${ACCOUNT}/billing`)
        // A base that cannot be parsed must still render a link rather than
        // throw during the sidebar's render.
        expect(foreignUrl('not a url', '/billing')).toBe('not a url/billing')
    })
})

describe('the union menu', () => {
    test('hosted, the account screens follow ours as Settings and Account', () => {
        const groups = visibleNavGroups(ACCOUNT)
        const items = visibleNavItems(ACCOUNT)

        expect(groups.map((g) => g.titleKey)).toEqual([
            undefined,
            'nav.group.data',
            'nav.group.build',
            'nav.group.workspace',
            'nav.group.settings',
            'nav.group.account',
        ])

        // Our screens stay routes; theirs are links into their origin.
        const foreign = items.filter((i) => i.externalUrl)
        expect(foreign).toHaveLength(ACCOUNT_NAV.flatMap((g) => g.items).length)
        for (const item of foreign) expect(item.externalUrl!.startsWith(`${ACCOUNT}/`)).toBe(true)
        expect(items.find((i) => i.name === 'acct-billing')?.externalUrl).toBe(`${ACCOUNT}/billing`)

        // One home: the product's Overview is ours, and theirs is not in the
        // contract at all.
        expect(items.filter((i) => i.labelKey === 'nav.overview')).toHaveLength(1)
        expect(items.find((i) => i.labelKey === 'nav.overview')?.externalUrl).toBeUndefined()
    })

    test('self-hosted, nothing foreign renders — the app is whole on its own', () => {
        const items = visibleNavItems(null)
        expect(items.some((i) => i.externalUrl)).toBe(false)
        expect(items.map((i) => i.name)).toEqual(navGroups.flatMap((g) => g.items).map((i) => i.name))
    })
})
