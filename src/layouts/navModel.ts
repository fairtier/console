// The single navigation model.
//
// The sidebar and the command palette used to maintain this list twice, and
// had already drifted — the palette was missing the SQL page. They now share
// this one, so a screen added here reaches both surfaces at once.

import type { IconName } from '../components/ui/icons'
import { runtimeConfig } from '../config/runtime'

export interface NavItem {
    /** Route name. */
    name: string
    labelKey: string
    icon: IconName
    badge?: string
    /**
     * External destination instead of a route. Rendered as a plain link (new
     * tab) by the sidebar and as a window.open by the palette.
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
 * When the workspace is hosted by someone who manages the account and billing
 * elsewhere (accountUrl set by the deployment), one external entry links out
 * to it. Self-hosters leave it unset and no account group renders.
 */
function accountLinkItem(): NavItem | null {
    const url = runtimeConfig().accountUrl
    if (!url) return null
    return { name: 'account-external', labelKey: 'nav.accountExternal', icon: 'billing', externalUrl: url }
}

/** The groups the sidebar renders. */
export function visibleNavGroups(): NavGroup[] {
    const groups = [...navGroups]
    const account = accountLinkItem()
    if (account) groups.push({ titleKey: 'nav.group.account', items: [account] })
    return groups
}

/** Every visible entry, flattened — the command palette's view of the model. */
export function visibleNavItems(): NavItem[] {
    const items = navGroups.flatMap((group) => group.items)
    const account = accountLinkItem()
    if (account) items.push(account)
    return items
}
