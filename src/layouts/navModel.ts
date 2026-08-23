// The single navigation model.
//
// The sidebar and the command palette used to maintain this list twice, and
// had already drifted — the palette was missing the SQL page. They now share
// this one, so a screen added here reaches both surfaces at once.
//
// When the workspace is hosted, the model is a *union*: this Console's screens
// plus the account Console's, rendered as links into its origin (see
// ./navContract.ts). The two apps then show one menu and a person sees one
// product. Self-hosted there is no second app and the menu is just ours.

import type { IconName } from '../components/ui/icons'
import { runtimeConfig } from '../config/runtime'
import { ACCOUNT_NAV, foreignUrl } from './navContract'

export interface NavItem {
    /** Route name. */
    name: string
    labelKey: string
    icon: IconName
    badge?: string
    /**
     * External destination instead of a route: another origin of the same
     * product. Rendered as a plain same-tab `<a href>` by the sidebar and as a
     * location.assign by the palette — crossing to the account Console is a
     * navigation, not a new window.
     */
    externalUrl?: string
}

export interface NavGroup {
    titleKey?: string
    items: NavItem[]
}

export const navGroups: NavGroup[] = [
    { items: [{ name: 'overview', labelKey: 'nav.overview', icon: 'overview' }] },
    {
        titleKey: 'nav.group.data',
        items: [
            { name: 'catalog', labelKey: 'nav.catalog', icon: 'catalog' },
            { name: 'sql', labelKey: 'nav.sql', icon: 'code' },
            { name: 'pipelines', labelKey: 'nav.pipelines', icon: 'pipelines' },
            { name: 'transformations', labelKey: 'nav.transformations', icon: 'refresh' },
        ],
    },
    {
        titleKey: 'nav.group.build',
        items: [
            { name: 'apps', labelKey: 'nav.apps', icon: 'apps' },
            { name: 'rill', labelKey: 'nav.rill', icon: 'file' },
        ],
    },
    {
        titleKey: 'nav.group.workspace',
        items: [
            { name: 'git', labelKey: 'nav.git', icon: 'link' },
            { name: 'integrations', labelKey: 'nav.integrations', icon: 'launch' },
            { name: 'service-accounts', labelKey: 'nav.serviceAccounts', icon: 'lock' },
        ],
    },
]

/**
 * The account Console's screens, as links into its origin — the Settings and
 * Account half of the union menu.
 *
 * When the workspace is hosted, the deployment sets `accountUrl` and those
 * groups appear below ours, indistinguishable from a route. Self-hosters leave
 * it unset: nothing renders, no dead links, and the app is whole on its own.
 */
function accountGroups(url: string | null): NavGroup[] {
    if (!url) return []
    return ACCOUNT_NAV.map((group) => ({
        titleKey: group.titleKey,
        items: group.items.map((item) => ({
            name: item.id,
            labelKey: item.labelKey,
            icon: item.icon,
            externalUrl: foreignUrl(url, item.path),
        })),
    }))
}

/**
 * The groups the sidebar renders: ours, then the account Console's.
 *
 * `accountUrl` defaults to the deployment's — the argument exists so the test
 * can exercise both halves without a runtime config to fetch.
 */
export function visibleNavGroups(accountUrl: string | null = runtimeConfig().accountUrl): NavGroup[] {
    return [...navGroups, ...accountGroups(accountUrl)]
}

/** Every visible entry, flattened — the command palette's view of the model. */
export function visibleNavItems(accountUrl: string | null = runtimeConfig().accountUrl): NavItem[] {
    return visibleNavGroups(accountUrl).flatMap((group) => group.items)
}
