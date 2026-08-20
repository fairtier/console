import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// Token storage keys (shared with useAuth and the transport interceptors)
const ACCESS_TOKEN_KEY = 'ft_access_token'
const REFRESH_TOKEN_KEY = 'ft_refresh_token'
const USER_KEY = 'ft_user'

/**
 * The signed-in identity. There is no user service behind this — the profile
 * is whatever the login's JWT carried (see auth/claims.ts), and profile
 * management lives in the workspace's own Casdoor UI.
 */
export interface UserProfile {
    id: string
    name: string
    displayName: string
    email: string
    avatar: string
    organization: string
}

export const useUserStore = defineStore('user', () => {
    // State
    const user = ref<UserProfile | null>(loadStoredUser())
    const accessToken = ref<string | null>(localStorage.getItem(ACCESS_TOKEN_KEY))
    const refreshToken = ref<string | null>(localStorage.getItem(REFRESH_TOKEN_KEY))

    // Getters
    const isAuthenticated = computed(() => !!accessToken.value && !!user.value)
    const userId = computed(() => user.value?.id ?? null)
    const displayName = computed(() => user.value?.displayName || user.value?.name || '')
    const email = computed(() => user.value?.email || '')

    // Helper to load user from storage
    function loadStoredUser(): UserProfile | null {
        const stored = localStorage.getItem(USER_KEY)
        if (!stored) return null
        try {
            return JSON.parse(stored)
        } catch {
            return null
        }
    }

    // Actions
    function setUser(newUser: UserProfile | null) {
        user.value = newUser
        if (newUser) {
            localStorage.setItem(USER_KEY, JSON.stringify(newUser))
        } else {
            localStorage.removeItem(USER_KEY)
        }
    }

    function setTokens(access: string | null, refresh?: string | null) {
        accessToken.value = access
        if (access) {
            localStorage.setItem(ACCESS_TOKEN_KEY, access)
        } else {
            localStorage.removeItem(ACCESS_TOKEN_KEY)
        }

        if (refresh !== undefined) {
            refreshToken.value = refresh
            if (refresh) {
                localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
            } else {
                localStorage.removeItem(REFRESH_TOKEN_KEY)
            }
        }
    }

    function clearAuth() {
        user.value = null
        accessToken.value = null
        refreshToken.value = null
        localStorage.removeItem(ACCESS_TOKEN_KEY)
        localStorage.removeItem(REFRESH_TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
    }

    return {
        // State
        user,
        accessToken,
        refreshToken,

        // Getters
        isAuthenticated,
        userId,
        displayName,
        email,

        // Actions
        setUser,
        setTokens,
        clearAuth,
    }
})
