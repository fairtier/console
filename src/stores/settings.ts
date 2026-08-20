import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { setLocale, type LocaleCode } from '../i18n'

type Theme = 'system' | 'light' | 'dark'

const THEME_KEY = 'ft_theme'
const LOCALE_KEY = 'ft_locale'

/**
 * Display preferences — theme and locale. Persisted in localStorage, per
 * browser: there is no preferences service behind the workspace Console, and
 * a display preference is a property of the device you are reading on anyway.
 */
export const useSettingsStore = defineStore('settings', () => {
    const localTheme = ref<Theme>(loadStoredTheme())
    const localLocale = ref<LocaleCode>(loadStoredLocale())

    const theme = computed(() => localTheme.value)
    const locale = computed(() => localLocale.value)

    // Computed theme that resolves 'system' to actual theme
    const effectiveTheme = computed(() => {
        const current = theme.value
        if (current === 'system') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        }
        return current
    })

    // Helpers
    function loadStoredTheme(): Theme {
        const stored = localStorage.getItem(THEME_KEY) as Theme | null
        return stored ?? 'system'
    }

    function loadStoredLocale(): LocaleCode {
        const stored = localStorage.getItem(LOCALE_KEY)
        if (stored && ['en', 'cs'].includes(stored)) {
            return stored as LocaleCode
        }
        const browserLang = navigator.language.split('-')[0]
        if (browserLang && ['en', 'cs'].includes(browserLang)) {
            return browserLang as LocaleCode
        }
        return 'en'
    }

    // Actions
    function updateTheme(newTheme: Theme) {
        localTheme.value = newTheme
        applyTheme(newTheme)
        localStorage.setItem(THEME_KEY, newTheme)
    }

    function updateLocale(newLocale: LocaleCode) {
        localLocale.value = newLocale
        setLocale(newLocale)
        localStorage.setItem(LOCALE_KEY, newLocale)
    }

    function applyTheme(theme: Theme) {
        const root = document.documentElement
        const isDark =
            theme === 'dark' ||
            (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

        // The design system is driven by the data-ft-theme attribute on <html>.
        root.setAttribute('data-ft-theme', isDark ? 'dark' : 'light')
    }

    // Initialize theme on store creation
    applyTheme(localTheme.value)

    // Listen for system theme changes
    if (typeof window !== 'undefined') {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (theme.value === 'system') {
                applyTheme('system')
            }
        })
    }

    return {
        // Getters
        theme,
        locale,
        effectiveTheme,

        // Actions
        updateTheme,
        updateLocale,
        applyTheme,
    }
})
