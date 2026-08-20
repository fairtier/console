// "Sign in with Google" helper for Google Sheets pipeline sources. These are
// plain HTTP endpoints (not ConnectRPC): /oauth/google/start returns the Google
// consent URL, and the popup lands on /oauth/google/callback which postMessages
// the resulting grant back here. The refresh token never reaches the browser —
// we only ever receive a short-lived grant_id the backend redeems on save.

import { workspaceApiBase, workspaceAuthToken } from './transport'

/** Result handed back by the callback popup. */
export interface GoogleOAuthResult {
    grant_id: string
    email: string
}

/** Thrown when the server has no Google OAuth configured at all (HTTP 501). */
export class OAuthUnavailableError extends Error {}

/**
 * Thrown when the server can run the flow but this workspace has not connected
 * its own Google app yet (HTTP 412).
 *
 * Deliberately distinct from OAuthUnavailableError: that one means "nothing you
 * can do here, use a service account", this one means "go to Integrations and
 * connect your app". Collapsing them would hide the button exactly when it
 * should be pointing at the fix.
 */
export class OAuthClientNotConfiguredError extends Error {}

function apiBase(): string {
    return workspaceApiBase()
}

/** Fetches a fresh Google consent URL for the authenticated user. */
export async function startGoogleOAuth(): Promise<string> {
    const token = workspaceAuthToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    const resp = await fetch(`${apiBase()}/oauth/google/start`, { headers })
    if (resp.status === 501) {
        throw new OAuthUnavailableError('Sign in with Google is not enabled on this server')
    }
    if (resp.status === 412) {
        throw new OAuthClientNotConfiguredError(
            'This workspace has not connected its own Google OAuth app yet',
        )
    }
    if (!resp.ok) {
        let message = `Could not start Google sign-in (HTTP ${resp.status})`
        try {
            const body = (await resp.json()) as { error?: string }
            if (body.error) message = body.error
        } catch {
            // keep the generic message
        }
        throw new Error(message)
    }
    const body = (await resp.json()) as { auth_url?: string }
    if (!body.auth_url) throw new Error('No sign-in URL returned')
    return body.auth_url
}

/**
 * Opens the Google consent popup and resolves once the callback posts the grant
 * back. The popup is opened synchronously (inside the click gesture) to avoid
 * popup blockers, then navigated to the consent URL after it is fetched.
 */
export function connectGoogleSheets(): Promise<GoogleOAuthResult> {
    const popup = window.open('', 'fairtier-google-oauth', 'width=520,height=680')

    return new Promise<GoogleOAuthResult>((resolve, reject) => {
        if (!popup) {
            reject(new Error('The sign-in popup was blocked. Please allow popups and try again.'))
            return
        }

        let settled = false
        const finish = (fn: () => void) => {
            if (settled) return
            settled = true
            window.removeEventListener('message', onMessage)
            clearInterval(closedTimer)
            fn()
        }

        const onMessage = (ev: MessageEvent) => {
            // Bind strictly to our popup; ignore any other window's messages.
            if (ev.source !== popup) return
            const data = ev.data as { type?: string; result?: { grant_id?: string; email?: string; error?: string } }
            if (!data || data.type !== 'fairtier-google-oauth') return
            popup.close()
            const res = data.result
            if (res?.error) {
                finish(() => reject(new Error(res.error)))
            } else if (res?.grant_id) {
                finish(() => resolve({ grant_id: res.grant_id!, email: res.email ?? '' }))
            } else {
                finish(() => reject(new Error('Google sign-in did not complete')))
            }
        }
        window.addEventListener('message', onMessage)

        // If the user closes the popup without granting, reject so the UI resets.
        const closedTimer = window.setInterval(() => {
            if (popup.closed) finish(() => reject(new Error('Sign-in was cancelled')))
        }, 500)

        startGoogleOAuth()
            .then((url) => {
                if (!settled) popup.location.href = url
            })
            .catch((err) => {
                popup.close()
                finish(() => reject(err))
            })
    })
}
