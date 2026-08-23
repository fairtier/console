// Warm the connection to the other console's origin.
//
// Every crossing between this Console and the account Console is a cold SPA
// load on a host this browser has usually never talked to: DNS, TCP, TLS, then
// the bundle. The union menu (./navContract.ts) makes those crossings ordinary
// clicks, so the handshake is worth paying for in the background, before
// anyone clicks.
//
// Cheap and best-effort: one `<link>` pair per origin, added once, never
// removed. A wrong or unreachable origin costs a dangling connection attempt.

const warmed = new Set<string>()

/**
 * Adds `preconnect` + `dns-prefetch` hints for the origin of `url`.
 *
 * Null/blank — the self-hosted default, with no account Console to cross to —
 * does nothing, as every other half of the join does when unset.
 */
export function preconnect(url: string | null | undefined): void {
    if (!url || typeof document === 'undefined') return

    let origin: string
    try {
        origin = new URL(url).origin
    } catch {
        return
    }
    if (origin === location.origin || warmed.has(origin)) return
    warmed.add(origin)

    for (const rel of ['preconnect', 'dns-prefetch']) {
        const link = document.createElement('link')
        link.rel = rel
        link.href = origin
        // The crossing is a document navigation, not a fetch, so no
        // crossorigin attribute: that would warm the anonymous CORS pool
        // instead of the one the navigation actually uses.
        document.head.appendChild(link)
    }
}
