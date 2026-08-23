import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { setLocale, type LocaleCode } from '../i18n'
import {
    fresherSharedPrefs,
    onSharedPrefsChange,
    setPersistedStamp,
    writeSharedPrefs,
} from '../lib/prefs'

type Theme = 'system' | 'light' | 'dark'

const THEME_KEY = 'ft_theme'
const LOCALE_KEY = 'ft_locale'

/**
 * Display preferences — theme and locale. Persisted in localStorage, per
 * browser: there is no preferences service behind the workspace Console, and
 * a display preference is a property of the device you are reading on anyway.
 *
 * When the workspace is hosted, the same two values also travel in the
 * `ft_prefs` cookie (../lib/prefs.ts), so picking a theme here and picking one
 * in the hosting provider's Console are the same act. Self-hosted, that cookie
 * is an ordinary same-origin one and nothing about this store changes.
 */
export const useSettingsStore = defineStore('settings', () => {
    // The cookie outranks this origin's copy when it is newer, which is how a
    // preference set in the other console arrives here.
    const bootShared = fresherSharedPrefs()
    const localTheme = ref<Theme>(bootShared?.theme ?? loadStoredTheme())
    const localLocale = ref<LocaleCode>(bootShared?.locale ?? loadStoredLocale())

    // Adopting it makes it this origin's own choice: localStorage IS the
    // durable copy here, so the stamp moves with it.
    if (bootShared) {
        localStorage.setItem(THEME_KEY, localTheme.value)
        setLocale(localLocale.value)
        setPersistedStamp(bootShared.ts)
    }

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
        applySharedTheme(newTheme)
        // Also to the shared cookie, so an already open account Console adopts
        // it the moment it regains focus.
        setPersistedStamp(writeSharedPrefs({ theme: newTheme }).ts)
    }

    function updateLocale(newLocale: LocaleCode) {
        applySharedLocale(newLocale)
        setPersistedStamp(writeSharedPrefs({ locale: newLocale }).ts)
    }

    /** Applies a theme to this origin: state, DOM, and its localStorage copy. */
    function applySharedTheme(next: Theme) {
        localTheme.value = next
        applyTheme(next)
        localStorage.setItem(THEME_KEY, next)
    }

    /** Same for the locale — setLocale() writes the localStorage copy itself. */
    function applySharedLocale(next: LocaleCode) {
        localLocale.value = next
        setLocale(next)
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

    // The account Console is a different origin, so the only signal that it
    // changed a display preference is the cookie — re-read it whenever this tab
    // comes back to the foreground, which is the moment the desync would be
    // visible.
    onSharedPrefsChange((shared) => {
        if (shared.theme && shared.theme !== localTheme.value) applySharedTheme(shared.theme)
        if (shared.locale && shared.locale !== localLocale.value) applySharedLocale(shared.locale)
        setPersistedStamp(shared.ts)
    })

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
