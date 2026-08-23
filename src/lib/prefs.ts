// Shared display preferences — the `ft_prefs` cookie.
//
// A hosted workspace is served from its own origin
// (`console.customer-<slug>.<domain>`) while the account & billing pages live
// on the hosting provider's own Console. `localStorage` therefore hands
// each of them a private copy of the theme and the locale: pick dark in one and
// the other stays light. A cookie on the registrable domain both of them live
// under is the one storage they can both see, which is why the two display
// preferences travel in one.
//
// ── SECURITY: display preferences only, forever ──────────────────────────────
// The cookie's `Domain` is a *parent* domain, so it is readable **and writable**
// by JavaScript on every other workspace under it. That is fine for a theme and
// fatal for anything auth-adjacent. Hence the shape below — a fixed key
// whitelist, a value whitelist per key, a size ceiling before parsing — and the
// rule that nothing may be added whose worst case is worse than "someone else's
// console opened in dark mode". No ids, no tokens, no workspace names, no flags
// anything trusts.
//
// A self-hosted workspace on its own domain never gets a `Domain` attribute at
// all (see {@link configureSharedPrefsPeer}): it shares a parent with nobody,
// and the cookie degrades to an ordinary same-origin one.

/** Cookie name, shared with the hosting provider's Console (same constant there). */
export const PREFS_COOKIE = 'ft_prefs'

/**
 * `localStorage` key holding the `ts` of the preference value this origin has
 * durably persisted — for this app, its own `localStorage` copy. The cookie
 * only wins when it is newer than that.
 */
const STAMP_KEY = 'ft_prefs_ts'

/** Refuse to parse anything bigger; a valid document is ~60 bytes. */
const MAX_COOKIE_LENGTH = 512

const PREFS_VERSION = 1
const MAX_AGE_SECONDS = 31_536_000 // one year

export const SHARED_THEMES = ['light', 'dark', 'system'] as const
export const SHARED_LOCALES = ['en', 'cs'] as const

export type SharedTheme = (typeof SHARED_THEMES)[number]
export type SharedLocale = (typeof SHARED_LOCALES)[number]

/** A validated cookie value. A field is null when it was absent or rejected. */
export interface SharedPrefs {
    theme: SharedTheme | null
    locale: SharedLocale | null
    /** Milliseconds since the epoch, as written by whichever console wrote last. */
    ts: number
}

// The freshest `ts` this module has already handed out — bumped by our own
// writes too, so the focus watcher does not re-announce a change we made.
let observedTs = 0

// Hostname of the Console that manages this workspace's account, once known.
let peerHostname: string | null = null

/**
 * Points the cookie at the domain shared with the Console that manages this
 * workspace's account (`accountUrl` from `/config.json`). Call once, after the
 * runtime config resolves and before anything writes.
 *
 * Left unset — the self-host default — the cookie stays host-only. A workspace
 * on its own domain shares a parent with nobody, and writing a preference onto
 * that parent would hand it to every unrelated app its owner runs there.
 */
export function configureSharedPrefsPeer(accountUrl: string | null): void {
    peerHostname = null
    if (!accountUrl) return
    try {
        peerHostname = new URL(accountUrl).hostname
    } catch {
        // Not a URL — no peer, so no shared domain. Same as unset.
    }
}

/**
 * Validates one raw cookie value. Exported for the unit test: this is the
 * function that has to hold when a neighbouring box writes something hostile.
 */
export function parseSharedPrefs(value: string): SharedPrefs | null {
    if (!value || value.length > MAX_COOKIE_LENGTH) return null

    let decoded: unknown
    try {
        decoded = JSON.parse(decodeURIComponent(value))
    } catch {
        return null
    }
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return null

    const doc = decoded as Record<string, unknown>
    if (doc.v !== PREFS_VERSION) return null

    // Whitelist per field, independently: a garbage theme must not cost us a
    // valid locale, and neither may fall through as a raw string.
    const theme = SHARED_THEMES.includes(doc.theme as SharedTheme)
        ? (doc.theme as SharedTheme)
        : null
    const locale = SHARED_LOCALES.includes(doc.locale as SharedLocale)
        ? (doc.locale as SharedLocale)
        : null
    if (theme === null && locale === null) return null

    const ts = typeof doc.ts === 'number' && Number.isFinite(doc.ts) ? doc.ts : 0
    return { theme, locale, ts }
}

/**
 * The `Domain` attribute to write the cookie with: the registrable domain the
 * account Console lives on, when this workspace lives under it too.
 *
 * `console.<domain>` as the peer → `.<domain>`, which
 * `console.customer-<slug>.<domain>` matches — that is the whole mechanism.
 * Null (host-only cookie) whenever there is no peer, the peer has no
 * registrable domain (`localhost`, a bare IP), or this workspace does not live
 * under it: the browser would refuse such a cookie anyway, and refusing it here
 * is what keeps a mis-set `accountUrl` from aiming preferences at a domain that
 * is not ours.
 */
export function resolveCookieDomain(hostname: string, peer: string | null): string | null {
    if (!peer) return null
    const parent = registrableDomain(peer)
    if (!parent) return null
    if (hostname !== parent && !hostname.endsWith(`.${parent}`)) return null
    return `.${parent}`
}

function registrableDomain(hostname: string): string | null {
    if (!hostname || hostname.includes(':')) return null // IPv6 literal
    if (/^[\d.]+$/.test(hostname)) return null // IPv4 literal
    const labels = hostname.split('.')
    if (labels.length < 2 || labels.some((l) => l === '')) return null
    return labels.slice(-2).join('.')
}

/**
 * The freshest valid `ft_prefs` cookie, or null.
 *
 * Reads *every* match: a host-only and a domain-scoped cookie of the same name
 * can coexist and `document.cookie` reveals neither's domain, so the freshest
 * valid one wins — the same last-write-wins rule used everywhere else here.
 */
export function readSharedPrefs(): SharedPrefs | null {
    if (typeof document === 'undefined') return null

    let best: SharedPrefs | null = null
    for (const chunk of document.cookie.split(';')) {
        const eq = chunk.indexOf('=')
        if (eq < 0) continue
        if (chunk.slice(0, eq).trim() !== PREFS_COOKIE) continue
        const parsed = parseSharedPrefs(chunk.slice(eq + 1).trim())
        if (parsed && (!best || parsed.ts > best.ts)) best = parsed
    }
    return best
}

/**
 * Merges a change into the cookie and stamps it `now`. Returns what was
 * written, so the caller can record the `ts` once it has persisted the same
 * value durably (see {@link setPersistedStamp}).
 */
export function writeSharedPrefs(patch: {
    theme?: SharedTheme
    locale?: SharedLocale
}): SharedPrefs {
    const current = readSharedPrefs()
    const next: SharedPrefs = {
        theme: patch.theme ?? current?.theme ?? null,
        locale: patch.locale ?? current?.locale ?? null,
        ts: Date.now(),
    }
    observedTs = next.ts

    if (typeof document === 'undefined') return next

    // Serialised key by key, never by spreading an object: the cookie is a
    // channel other workspaces can read, so it carries the whitelist by
    // construction.
    const doc: Record<string, unknown> = { v: PREFS_VERSION, ts: next.ts }
    if (next.theme) doc.theme = next.theme
    if (next.locale) doc.locale = next.locale

    const parts = [
        `${PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(doc))}`,
        'Path=/',
        `Max-Age=${MAX_AGE_SECONDS}`,
        'SameSite=Lax',
    ]
    const domain = resolveCookieDomain(location.hostname, peerHostname)
    if (domain) parts.push(`Domain=${domain}`)
    // Over plain http the browser drops a Secure cookie outright, which would
    // silently lose every preference under `bun dev`.
    if (location.protocol === 'https:') parts.push('Secure')

    document.cookie = parts.join('; ')
    return next
}

/** The `ts` of the value this origin last persisted durably (0 if never). */
export function persistedStamp(): number {
    if (typeof localStorage === 'undefined') return 0
    const raw = Number(localStorage.getItem(STAMP_KEY))
    return Number.isFinite(raw) && raw > 0 ? raw : 0
}

/** Records that the value carrying `ts` is now persisted durably. */
export function setPersistedStamp(ts: number): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STAMP_KEY, String(ts))
}

/**
 * The cookie, but only when it is newer than what this origin has persisted —
 * i.e. when the *other* console is the one that changed something.
 */
export function fresherSharedPrefs(): SharedPrefs | null {
    const shared = readSharedPrefs()
    if (!shared) return null
    return shared.ts > persistedStamp() ? shared : null
}

/**
 * Calls back when the other console changes a preference while this tab is
 * open. Cookies fire no `storage` event, so the read is driven by the moment
 * the desync becomes visible: coming back to a tab that sat there while the
 * other console was recoloured. Returns an unsubscribe.
 */
export function onSharedPrefsChange(handler: (prefs: SharedPrefs) => void): () => void {
    if (typeof window === 'undefined') return () => {}

    observedTs = Math.max(observedTs, readSharedPrefs()?.ts ?? 0)

    const check = (): void => {
        const shared = readSharedPrefs()
        if (!shared || shared.ts <= observedTs) return
        observedTs = shared.ts
        handler(shared)
    }
    const onVisibility = (): void => {
        if (document.visibilityState === 'visible') check()
    }

    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
        window.removeEventListener('focus', check)
        document.removeEventListener('visibilitychange', onVisibility)
    }
}
