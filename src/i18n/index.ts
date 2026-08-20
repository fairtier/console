import { createI18n } from 'vue-i18n'
import en from './locales/en'
import cs from './locales/cs'

const LOCALE_KEY = 'ft_locale'

// Per-view locale fragments live in ./locales/views/*.ts and each export a
// default of shape { en: {...}, cs: {...} } with a single top-level namespace.
// They are merged here so views can own their own copy without touching the
// shared locale files.
type LocaleFragment = { default: { en: Record<string, unknown>; cs: Record<string, unknown> } }
const fragments = import.meta.glob<LocaleFragment>('./locales/views/*.ts', { eager: true })

// Keep the concrete typeof en/cs so vue-i18n's createI18n schema inference (and
// thus i18n.global.locale being a ref) is preserved; fragments add extra
// namespaces at runtime only.
const enMessages = { ...en }
const csMessages = { ...cs }
for (const mod of Object.values(fragments)) {
    Object.assign(enMessages, mod.default.en)
    Object.assign(csMessages, mod.default.cs)
}

function getStoredLocale(): string {
    const stored = localStorage.getItem(LOCALE_KEY)
    if (stored && ['en', 'cs'].includes(stored)) {
        return stored
    }
    // Try to detect browser language
    const browserLang = navigator.language.split('-')[0]
    if (browserLang && ['en', 'cs'].includes(browserLang)) {
        return browserLang
    }
    return 'en'
}

// Czech has three plural forms (1 / 2–4 / 5+), so pipe-separated messages
// there are written as "one | few | many". vue-i18n's built-in rule is the
// two-form English one and would pick "2 minut" instead of "2 minuty".
function czechPluralRule(choice: number, choicesLength: number): number {
    if (choicesLength < 3) return choice === 1 ? 0 : 1
    if (choice === 1) return 0
    if (choice >= 2 && choice <= 4) return 1
    return 2
}

export const i18n = createI18n({
    legacy: false, // Use Composition API mode
    locale: getStoredLocale(),
    fallbackLocale: 'en',
    pluralRules: {
        cs: czechPluralRule,
    },
    messages: {
        en: enMessages,
        cs: csMessages,
    },
})

export const availableLocales = [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
] as const

export type LocaleCode = (typeof availableLocales)[number]['code']

export function setLocale(locale: LocaleCode): void {
    i18n.global.locale.value = locale
    localStorage.setItem(LOCALE_KEY, locale)
    document.documentElement.lang = locale
}

export function getLocale(): LocaleCode {
    return i18n.global.locale.value as LocaleCode
}
