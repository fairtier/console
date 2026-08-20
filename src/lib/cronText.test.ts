import { describe, expect, test } from 'bun:test'
import { createI18n } from 'vue-i18n'
import cronMessages from '../i18n/locales/views/cron'
import { createCronText, type Translate } from './cronText'

// A bare i18n instance with just the cron namespace — same messages and the
// same Czech plural rule the app registers in src/i18n/index.ts.
function czechPluralRule(choice: number, choicesLength: number): number {
  if (choicesLength < 3) return choice === 1 ? 0 : 1
  if (choice === 1) return 0
  if (choice >= 2 && choice <= 4) return 1
  return 2
}

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  pluralRules: { cs: czechPluralRule },
  messages: { en: cronMessages.en, cs: cronMessages.cs },
})

function textFor(locale: 'en' | 'cs') {
  const t = i18n.global.t as unknown as (key: string, named?: Record<string, unknown>, plural?: number) => string
  const translate: Translate = (key, named, plural) => {
    i18n.global.locale.value = locale
    return plural === undefined ? t(key, named ?? {}) : t(key, named ?? {}, plural)
  }
  return createCronText(translate, () => locale)
}

const en = textFor('en')
const cs = textFor('cs')

describe('describe (en)', () => {
  const cases: [string, string][] = [
    ['* * * * *', 'Every minute.'],
    ['*/5 * * * *', 'Every 5 minutes.'],
    ['5 * * * *', 'At minute 5.'],
    ['0 * * * *', 'At minute 0.'],
    ['0 */5 * * *', 'At minute 0 past every 5th hour.'],
    ['4 5 * * *', 'At 05:04.'],
    // The case from the bug report: used to fall through to the raw expression.
    ['0 0 */2 * *', 'At 00:00 on every 2nd day-of-month.'],
    ['0 0 1 * *', 'At 00:00 on day-of-month 1.'],
    ['0 0 1,15 * *', 'At 00:00 on day-of-month 1 and 15.'],
    ['0 0 * * 1', 'At 00:00 on Monday.'],
    ['0 4 * * 1-5', 'At 04:00 on every day-of-week from Monday through Friday.'],
    ['0 0 1 1 *', 'At 00:00 on day-of-month 1 in January.'],
    ['30 9 * jan,jul *', 'At 09:30 in January and July.'],
    ['0 9-17 * * *', 'At minute 0 past every hour from 9 through 17.'],
    ['*/10 9-17 * * 1-5',
      'At every 10th minute past every hour from 9 through 17 on every day-of-week from Monday through Friday.'],
    ['15,45 * * * *', 'At minutes 15 and 45.'],
    ['0 0 5,10-14 * *', 'At 00:00 on day-of-month 5,10-14.'],
  ]
  for (const [expr, want] of cases) {
    test(expr, () => expect(en.describe(expr)).toBe(want))
  }
})

describe('describe (cs)', () => {
  const cases: [string, string][] = [
    ['* * * * *', 'Každou minutu.'],
    ['*/5 * * * *', 'Každých 5 minut.'],
    ['*/2 * * * *', 'Každé 2 minuty.'], // Czech plural: 2–4 takes the "few" form
    ['0 0 */2 * *', 'V 00:00 každý 2. den v měsíci.'],
    ['0 4 * * 3', 'V 04:00 ve středu.'], // "ve", not "v" — prepositional form
    ['5 0 * 8 *', 'V 00:05 v srpnu.'],
    ['0 0 * * 1', 'V 00:00 v pondělí.'],
    ['0 */5 * * *', 'V minutu 0 každou 5. hodinu.'],
  ]
  for (const [expr, want] of cases) {
    test(expr, () => expect(cs.describe(expr)).toBe(want))
  }
})

describe('summarize', () => {
  const cases: [string, string, string][] = [
    // expr, en, cs
    ['', '', ''],
    ['* * * * *', 'Every minute', 'Každou minutu'],
    ['*/5 * * * *', 'Every 5 min', 'Každých 5 min'],
    ['0 * * * *', 'Hourly', 'Každou hodinu'],
    ['15 * * * *', 'Hourly at :15', 'Každou hodinu v :15'],
    ['0 */6 * * *', 'Every 6h', 'Každých 6 h'],
    ['30 */2 * * *', 'Every 2h at :30', 'Každé 2 h v :30'],
    ['0 3 * * *', 'Daily at 03:00', 'Denně v 03:00'],
    ['0 0 */2 * *', 'Every 2 days at 00:00', 'Každé 2 dny v 00:00'],
    ['0 6 * * 1', 'Mon at 06:00', 'po v 06:00'],
    // Intl.ListFormat glues the Czech "a" to the next word with a no-break space.
    ['0 6 * * 1,5', 'Mon and Fri at 06:00', 'po a pá v 06:00'],
    ['0 0 1 * *', 'Monthly on the 1st at 00:00', 'Měsíčně 1. v 00:00'],
    // No short shape → the full sentence, without the trailing period.
    ['0 9-17 * * *', 'At minute 0 past every hour from 9 through 17', 'V minutu 0 každou hodinu od 9 do 17'],
    // Broken expressions are echoed verbatim rather than silently prettified.
    ['0 99 * * *', '0 99 * * *', '0 99 * * *'],
  ]
  for (const [expr, wantEn, wantCs] of cases) {
    test(expr || '(empty)', () => {
      expect(en.summarize(expr)).toBe(wantEn)
      expect(cs.summarize(expr)).toBe(wantCs)
    })
  }
})

describe('errors', () => {
  test('valid and empty schedules have no error', () => {
    expect(en.error('')).toBe('')
    expect(en.error('0 4 * * 1-5')).toBe('')
  })

  test('field name is localized into the message', () => {
    expect(en.error('0 75 * * *')).toBe('Hour: 75 is out of range (0–23).')
    expect(cs.error('0 75 * * *')).toBe('Hodina: 75 je mimo rozsah (0–23).')
  })

  test('@shortcuts suggest the 5-field equivalent', () => {
    expect(en.error('@daily')).toBe('“@daily” shortcuts are not supported — use 0 0 * * * instead.')
  })

  test('field count', () => {
    expect(en.error('0 0 * *')).toContain('got 4')
    expect(en.error('* * * * * *')).toContain('Six-field')
  })

  test('every broken field is listed', () => {
    expect(en.errors('99 99 * * *')).toHaveLength(2)
  })
})

describe('nextRunsText', () => {
  test('lists upcoming UTC runs', () => {
    const text = en.nextRunsText('0 0 */2 * *', 2)
    expect(text.startsWith('Next (UTC): ')).toBe(true)
    expect(text.split(' · ')).toHaveLength(2)
  })

  test('nothing for empty or invalid schedules', () => {
    expect(en.nextRunsText('')).toBe('')
    expect(en.nextRunsText('0 99 * * *')).toBe('')
  })
})
