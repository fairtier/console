// Binds the cron humanizer (src/lib/cronText.ts) to the component's vue-i18n
// translator, so schedule text follows the active locale like the rest of the
// Console.
import { useI18n } from 'vue-i18n'
import { createCronText, type CronText, type Translate } from '../lib/cronText'

export function useCronText(): CronText {
  const { t, locale } = useI18n()
  // vue-i18n's `t` is overloaded well past what this needs; the adapter pins
  // it to (key, named, plural).
  const translate: Translate = (key, named, plural) =>
    plural === undefined ? t(key, named ?? {}) : t(key, named ?? {}, plural)
  return createCronText(translate, () => locale.value)
}
