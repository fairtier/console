// The URL contract with the Console that manages this workspace's account.
//
// A hosted workspace is half of a product served from two origins: this
// workspace Console, and the hosting provider's account Console (`accountUrl`
// in /config.json). Both sidebars render the *union* of the two nav models, so
// a person sees one menu whichever origin they are on. Own entries are router
// links; the other app's entries are plain same-tab `<a href>`.
//
// That union is only possible because each app hardcodes the other's paths.
// Hence the two lists below, and the rule that governs them:
//
//   **A path that appears here stays reachable — as a route or as a redirect.**
//
// Renaming a screen on either side therefore means touching the other app too,
// and leaving the old path behind as a redirect until it does. Our router
// already keeps retired paths alive that way (`/dashboard`, `/iceberg`).
//
// Self-hosted, none of this exists: no `accountUrl`, no account group, and the
// app is whole on its own.

import type { IconName } from '../components/ui/icons'

/** One screen of the account Console: a path there, labelled from our locales. */
export interface ForeignNavItem {
    /** Stable id — not a route name, since this screen is not ours. */
    id: string
    /** Path on the account Console's origin, per the contract above. */
    path: string
    labelKey: string
    icon: IconName
}

export interface ForeignNavGroup {
    titleKey?: string
    items: ForeignNavItem[]
}

/**
 * The paths THIS Console publishes to the account Console. Its sidebar links to
 * exactly these, so removing one breaks its menu — see the rule above.
 * navContract.test.ts asserts every one of them still resolves in our router.
 */
export const LOCAL_CONTRACT_PATHS = [
    '/overview',
    '/catalog',
    '/sql',
    '/pipelines',
    '/transformations',
    '/rill',
    '/apps',
    '/git',
    '/integrations',
    '/service-accounts',
] as const

/**
 * The account Console's screens, in the order its own sidebar shows them — the
 * two menus have to read as one menu, so the order is part of the contract as
 * much as the paths are.
 *
 * Its Overview is deliberately absent: the product's home is this Console's
 * Overview, and two homes in one menu is one too many.
 */
export const ACCOUNT_NAV: ForeignNavGroup[] = [
    {
        titleKey: 'nav.group.settings',
        items: [
            { id: 'acct-general', path: '/workspace', labelKey: 'nav.general', icon: 'sliders' },
            { id: 'acct-storage', path: '/storage', labelKey: 'nav.storage', icon: 'storage' },
            { id: 'acct-danger', path: '/danger', labelKey: 'nav.danger', icon: 'danger' },
        ],
    },
    {
        titleKey: 'nav.group.account',
        items: [
            { id: 'acct-profile', path: '/account', labelKey: 'nav.account', icon: 'user' },
            { id: 'acct-billing', path: '/billing', labelKey: 'nav.billing', icon: 'billing' },
        ],
    },
]

/**
 * Absolute URL of a foreign path on the given account Console origin.
 *
 * `base` is always `accountUrl` from the runtime config — whoever hosts this
 * workspace says where their Console is; nothing here assumes a domain.
 */
export function foreignUrl(base: string, path: string): string {
    try {
        return new URL(path, base).toString()
    } catch {
        // A malformed base would otherwise throw during render. Falling back to
        // concatenation keeps the menu rendering; the link is as broken as the
        // base it came from either way.
        return `${base.replace(/\/+$/, '')}${path}`
    }
}
