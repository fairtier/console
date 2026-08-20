import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { availableLocales, setLocale, type LocaleCode } from '../i18n'

export function useLocale() {
    const { locale, t } = useI18n()

    const currentLocale = computed(() => locale.value as LocaleCode)

    const currentLocaleName = computed(() => {
        const found = availableLocales.find(l => l.code === locale.value)
        return found?.nativeName ?? locale.value
    })

    function changeLocale(code: LocaleCode): void {
        setLocale(code)
    }

    return {
        currentLocale,
        currentLocaleName,
        availableLocales,
        changeLocale,
        t,
    }
}
