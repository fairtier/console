// Choosing a Google Drive file with Google's own Picker, instead of pasting an
// id out of a URL.
//
// Why the Picker specifically: the consent this platform asks for is
// `drive.file`, which is NOT a Google restricted scope and needs no
// third-party security assessment — the price is that it reaches only the
// files the user picks *through Google's own Picker* (or that the app itself
// created). So the Picker is not a nicety on top of the scope decision; it is
// the half of it that grants the access. The file it returns is addressed by
// id (`gdrive://id:<id>`), which is also the only form that works: a folder
// path resolves against a listing `drive.file` cannot see.
//
// Two identifiers are needed and neither is ours to invent:
//
//   * the OAuth client id — the CUSTOMER's own app (the google-sheets-oauth
//     precedent), read back from OAuthClientService;
//   * the "app id", which Google matches against the client's project so the
//     pick can grant that project access. It is the numeric prefix of the
//     client id, so it costs the customer nothing extra.
//
// Google also documents a `developerKey` (an API key from the same project).
// We deliberately do not ask for one: it would be a third thing to create in
// a setup flow that already asks for a client pair, an enabled Drive API and
// a consent-screen scope. If Google refuses without it, this whole path
// reports itself unavailable and the field below it — paste the Drive link —
// keeps working exactly as it did. The picker is a shortcut, never a gate.

import { ref } from 'vue'

/** What a completed pick hands back. */
export interface PickedDriveFile {
    id: string
    name: string
}

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const GAPI_SRC = 'https://apis.google.com/js/api.js'
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

/** How long to wait for Google's scripts before calling the path unavailable. */
const SCRIPT_TIMEOUT_MS = 10_000

// Minimal shapes of the two Google globals. Typing them fully would mean
// vendoring Google's declarations for a handful of calls; typing them not at
// all would mean `any` spreading through the component.
interface TokenClient {
    requestAccessToken(overrides?: { prompt?: string; hint?: string }): void
}
interface GoogleGlobal {
    accounts: {
        oauth2: {
            initTokenClient(config: {
                client_id: string
                scope: string
                prompt?: string
                hint?: string
                callback(response: { access_token?: string; error?: string }): void
                error_callback?(error: { type?: string }): void
            }): TokenClient
        }
    }
    picker: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
}
interface GapiGlobal {
    load(name: string, callback: () => void): void
}

function scriptWindow(): { google?: GoogleGlobal; gapi?: GapiGlobal } {
    return window as unknown as { google?: GoogleGlobal; gapi?: GapiGlobal }
}

/**
 * appIdFromClientId pulls the Google Cloud project number out of an OAuth
 * client id — `123456789012-abc.apps.googleusercontent.com` leads with it.
 *
 * Returns '' for anything that does not look like one, which is the signal to
 * report the picker unavailable rather than to open one Google will refuse.
 */
export function appIdFromClientId(clientId: string): string {
    const m = clientId.match(/^(\d+)-/)
    return m ? m[1]! : ''
}

/** Loads a script once, resolving when it is ready. */
function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
        if (existing) {
            if (existing.dataset.loaded === '1') {
                resolve()
                return
            }
            existing.addEventListener('load', () => resolve())
            existing.addEventListener('error', () => reject(new Error(`failed to load ${src}`)))
            return
        }
        const el = document.createElement('script')
        el.src = src
        el.async = true
        el.addEventListener('load', () => {
            el.dataset.loaded = '1'
            resolve()
        })
        el.addEventListener('error', () => reject(new Error(`failed to load ${src}`)))
        document.head.appendChild(el)
        setTimeout(() => reject(new Error(`timed out loading ${src}`)), SCRIPT_TIMEOUT_MS)
    })
}

export function useDrivePicker() {
    /** True while a pick is in flight (scripts, consent, picker open). */
    const picking = ref(false)
    /**
     * Set when the picker cannot be offered at all — scripts blocked, no
     * client id, an id with no project number in it. The caller keeps its
     * paste-a-link field either way; this only hides the button.
     */
    const unavailable = ref(false)

    /**
     * Opens the Picker and resolves with the chosen file, or null when the
     * user cancels. Rejects only on a real failure, which the caller shows as
     * "pick a file another way".
     *
     * `hintEmail` is the account the pipeline's connection belongs to. Passing
     * it keeps the user from granting the file to a *different* Google account
     * than the one the box will read it with — the commonest way for a picked
     * file to come back 404 hours later.
     */
    async function pick(clientId: string, hintEmail: string): Promise<PickedDriveFile | null> {
        const appId = appIdFromClientId(clientId)
        if (!clientId || !appId) {
            unavailable.value = true
            return null
        }
        picking.value = true
        try {
            await Promise.all([loadScript(GIS_SRC), loadScript(GAPI_SRC)])
            const token = await requestToken(clientId, hintEmail)
            return await openPicker(appId, token)
        } finally {
            picking.value = false
        }
    }

    function requestToken(clientId: string, hintEmail: string): Promise<string> {
        const { google } = scriptWindow()
        if (!google?.accounts?.oauth2) {
            unavailable.value = true
            throw new Error('Google Identity Services did not load')
        }
        return new Promise((resolve, reject) => {
            const client = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: DRIVE_FILE_SCOPE,
                callback: (response) => {
                    if (response.access_token) resolve(response.access_token)
                    else reject(new Error(response.error || 'no access token'))
                },
                error_callback: (error) => reject(new Error(error.type || 'consent failed')),
            })
            // An empty prompt reuses an existing grant when there is one, so
            // picking a second file does not re-ask for consent.
            client.requestAccessToken({ prompt: '', hint: hintEmail || undefined })
        })
    }

    function openPicker(appId: string, token: string): Promise<PickedDriveFile | null> {
        const { gapi } = scriptWindow()
        if (!gapi) {
            unavailable.value = true
            throw new Error('the Google API loader did not load')
        }
        return new Promise((resolve, reject) => {
            gapi.load('picker', () => {
                const picker = scriptWindow().google?.picker
                if (!picker) {
                    unavailable.value = true
                    reject(new Error('the Google Picker did not load'))
                    return
                }
                const view = new picker.DocsView(picker.ViewId.DOCS)
                    .setIncludeFolders(true)
                    .setSelectFolderEnabled(false)
                new picker.PickerBuilder()
                    .setAppId(appId)
                    .setOAuthToken(token)
                    .addView(view)
                    .setCallback((data: { action: string; docs?: { id: string; name: string }[] }) => {
                        if (data.action === picker.Action.PICKED) {
                            const doc = data.docs?.[0]
                            resolve(doc ? { id: doc.id, name: doc.name } : null)
                        } else if (data.action === picker.Action.CANCEL) {
                            resolve(null)
                        }
                    })
                    .build()
                    .setVisible(true)
            })
        })
    }

    return { picking, unavailable, pick }
}
