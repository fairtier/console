// The OAuth2 + PKCE core.
//
// Each flow keeps its PKCE verifier and state under its own key, so a second
// login started while the first is mid-flight cannot silently overwrite the
// first's verifier and fail the surviving callback's code exchange.

export interface OAuthConfig {
    /** Casdoor base URL. */
    authUrl: string
    clientId: string
    redirectUri: string
}

export interface TokenResponse {
    access_token: string
    refresh_token?: string
    token_type: string
    expires_in: number
}

/** Which login this is. Namespaces the in-flight PKCE material. */
export type Flow = 'workspace'

function verifierKey(flow: Flow): string {
    return `pkce_verifier:${flow}`
}

function stateKey(flow: Flow): string {
    return `oauth_state:${flow}`
}

/**
 * Decodes a JWT payload WITHOUT verifying it. Display only — the issuer's
 * signature is what the API checks, never this.
 */
export function parseJwt(token: string): Record<string, unknown> | null {
    try {
        const parts = token.split('.')
        const base64Url = parts[1]
        if (!base64Url) return null
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join(''),
        )
        return JSON.parse(jsonPayload)
    } catch {
        return null
    }
}

/** Seconds-since-epoch expiry from a token, or null if it has none. */
export function tokenExpiry(token: string): number | null {
    const payload = parseJwt(token)
    const exp = payload?.exp
    return typeof exp === 'number' ? exp : null
}

function generateCodeVerifier(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(verifier)
    const digest = await crypto.subtle.digest('SHA-256', data)
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')
}

/**
 * Starts an authorization-code flow by navigating to the issuer. `path` is
 * Casdoor's `login` or `signup` variant.
 */
export async function beginAuthorize(
    config: OAuthConfig,
    flow: Flow,
    path: 'login' | 'signup' = 'login',
): Promise<void> {
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    const state = crypto.randomUUID()

    sessionStorage.setItem(verifierKey(flow), codeVerifier)
    sessionStorage.setItem(stateKey(flow), state)

    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'openid profile email',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
    })

    window.location.href = `${config.authUrl}/${path}/oauth/authorize?${params.toString()}`
}

/**
 * Completes the flow: verifies the returned state, redeems the code, and
 * clears the in-flight material. Throws on a state mismatch, a missing
 * verifier, or a failed exchange.
 */
export async function exchangeCode(
    config: OAuthConfig,
    flow: Flow,
    code: string,
    state: string,
): Promise<TokenResponse> {
    const savedState = sessionStorage.getItem(stateKey(flow))
    if (!savedState || state !== savedState) {
        throw new Error('Invalid state parameter')
    }
    const codeVerifier = sessionStorage.getItem(verifierKey(flow))
    if (!codeVerifier) {
        throw new Error('Missing PKCE verifier')
    }

    const resp = await fetch(`${config.authUrl}/api/login/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: config.clientId,
            code,
            redirect_uri: config.redirectUri,
            code_verifier: codeVerifier,
        }),
    })
    if (!resp.ok) {
        throw new Error(`Token exchange failed: ${await resp.text()}`)
    }

    sessionStorage.removeItem(verifierKey(flow))
    sessionStorage.removeItem(stateKey(flow))
    return (await resp.json()) as TokenResponse
}
