import { ref, computed } from 'vue'
import { useUserStore, type UserProfile } from '../stores/user'
import { runtimeConfig } from '../config/runtime'
import { beginAuthorize, exchangeCode, parseJwt, type OAuthConfig } from '../auth/pkce'
import { profileFromClaims } from '../auth/claims'

// The workspace's own Casdoor. Read through runtimeConfig so a deployment
// points this at its issuer without a rebuild.
function oauthConfig(): OAuthConfig {
    const cfg = runtimeConfig()
    return {
        authUrl: cfg.authUrl,
        clientId: cfg.authClientId,
        redirectUri: cfg.authRedirectUri,
    }
}

export function useAuth() {
    const userStore = useUserStore()

    const isAuthenticated = computed(() => userStore.isAuthenticated)
    const isLoading = ref(false)
    const error = ref<string | null>(null)
    const user = computed(() => userStore.user)

    async function login() {
        await beginAuthorize(oauthConfig(), 'workspace')
    }

    async function handleCallback(code: string, state: string): Promise<boolean> {
        isLoading.value = true
        error.value = null

        try {
            const tokens = await exchangeCode(oauthConfig(), 'workspace', code, state)

            // Store tokens via user store
            userStore.setTokens(tokens.access_token, tokens.refresh_token)

            // The profile is whatever the token carried — there is no user
            // service to ask. Claim mapping: src/auth/claims.ts.
            const payload = parseJwt(tokens.access_token)
            if (payload) {
                const profile: UserProfile = {
                    ...profileFromClaims(payload),
                    organization: runtimeConfig().authOrganization,
                }
                userStore.setUser(profile)
            }

            return true
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Authentication failed'
            console.error('Auth callback error:', e)
            return false
        } finally {
            isLoading.value = false
        }
    }

    function logout() {
        const token = userStore.accessToken

        // Clear stores
        userStore.clearAuth()

        // Redirect to Casdoor logout
        const logoutUrl = `${oauthConfig().authUrl}/api/logout?id_token_hint=${token}&post_logout_redirect_uri=${encodeURIComponent(window.location.origin)}`
        window.location.href = logoutUrl
    }

    function getAccessToken(): string | null {
        return userStore.accessToken
    }

    return {
        // State
        isAuthenticated,
        isLoading,
        error,
        user,

        // Methods
        login,
        logout,
        handleCallback,
        getAccessToken,
    }
}
