// Localized rendering for cron schedules parsed by ./cron.
//
// Three surfaces, all driven from the same parse:
//   summarize() — short label for table cells ("Daily at 04:05")
//   describe()  — full sentence for form hints ("At 00:00 on every 2nd
//                 day-of-month.", crontab.guru style)
//   error()     — the first validation problem, phrased for humans
//
// Kept free of vue-i18n itself (it takes a `t` function) so it can be unit
// tested against a bare i18n instance; src/composables/useCronText.ts binds it
// to the component's translator.
import { nextRuns, parseCron, type CronField, type CronFields, type CronIssue } from './cron'

/** The slice of vue-i18n's `t` this module needs: named params + plural choice. */
export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const
const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export interface CronText {
  describe(expr: string): string
  summarize(expr: string): string
  error(expr: string): string
  errors(expr: string): string[]
  nextRunsText(expr: string, count?: number): string
}

export function createCronText(t: Translate, getLocale: () => string): CronText {
  // English needs real ordinal suffixes; Czech (and most of Europe) writes the
  // numeral followed by a period.
  function ord(n: number): string {
    if (!getLocale().startsWith('en')) return `${n}.`
    const rem100 = n % 100
    if (rem100 >= 11 && rem100 <= 13) return `${n}th`
    switch (n % 10) {
      case 1: return `${n}st`
      case 2: return `${n}nd`
      case 3: return `${n}rd`
      default: return `${n}th`
    }
  }

  function listFmt(items: string[]): string {
    return new Intl.ListFormat(getLocale(), { style: 'long', type: 'conjunction' }).format(items)
  }

  function hhmm(hour: number, minute: number): string {
    return `${pad2(hour)}:${pad2(minute)}`
  }

  function monthName(value: number, prepositional: boolean): string {
    const key = MONTH_KEYS[value - 1] ?? String(value)
    return t(`cron.names.${prepositional ? 'monthIn' : 'months'}.${key}`)
  }

  function dayName(value: number, prepositional: boolean): string {
    const key = DOW_KEYS[value] ?? String(value)
    return t(`cron.names.${prepositional ? 'dayOn' : 'days'}.${key}`)
  }

  // One field → one clause. Month and day-of-week render names; their single
  // form is a ready-made prepositional phrase (see the locale file).
  function phrase(field: CronField): string {
    const p = field.pattern
    const key = (suffix: string) => `cron.long.${field.name}.${suffix}`
    const named = field.name === 'month' || field.name === 'dayOfWeek'
    const label = (v: number) =>
      field.name === 'month' ? monthName(v, false) : field.name === 'dayOfWeek' ? dayName(v, false) : String(v)

    switch (p.kind) {
      case 'all':
        return t(key('all'))
      case 'step':
        return t(key('step'), { ord: ord(p.step) })
      case 'single':
        return named
          ? t(key('single'), { name: field.name === 'month' ? monthName(p.value, true) : dayName(p.value, true) })
          : t(key('single'), { value: p.value })
      case 'list':
        return t(key('list'), { list: listFmt(p.values.map(label)) })
      case 'range':
        return p.step === 1
          ? t(key('range'), { from: label(p.from), to: label(p.to) })
          : t(key('rangeStep'), { ord: ord(p.step), from: label(p.from), to: label(p.to) })
      case 'complex':
        return t(key('complex'), { raw: field.raw })
    }
  }

  function sentence(fields: CronFields, period: boolean): string {
    const minute = fields.minute.pattern
    const hour = fields.hour.pattern
    const parts: string[] = []

    if (minute.kind === 'all' && hour.kind === 'all') {
      parts.push(t('cron.long.everyMinute'))
    } else if (minute.kind === 'step' && hour.kind === 'all') {
      parts.push(t('cron.long.everyNMinutes', { n: minute.step }, minute.step))
    } else if (minute.kind === 'single' && hour.kind === 'single') {
      parts.push(t('cron.long.atTime', { time: hhmm(hour.value, minute.value) }))
    } else if (hour.kind === 'all') {
      // "At minute 5" reads better than "At minute 5 past every hour".
      parts.push(t('cron.long.at', { desc: phrase(fields.minute) }))
    } else {
      parts.push(t('cron.long.atPast', { minute: phrase(fields.minute), hour: phrase(fields.hour) }))
    }

    for (const name of ['dayOfMonth', 'month', 'dayOfWeek'] as const) {
      if (fields[name].pattern.kind !== 'all') parts.push(phrase(fields[name]))
    }
    return parts.join(' ') + (period ? '.' : '')
  }

  /** Full sentence for form hints; '' for an empty (manual-only) or invalid schedule. */
  function describe(expr: string): string {
    const parsed = parseCron(expr)
    return parsed.status === 'ok' ? sentence(parsed.fields, true) : ''
  }

  /**
   * Short label for table cells. Falls back to the full sentence for shapes
   * with no snappy form, and to the raw text when the expression is broken —
   * never hides what is actually configured.
   */
  function summarize(expr: string): string {
    const parsed = parseCron(expr)
    if (parsed.status === 'empty') return ''
    if (parsed.status === 'invalid') return expr.trim()

    const f = parsed.fields
    const minute = f.minute.pattern
    const hour = f.hour.pattern
    const dom = f.dayOfMonth.pattern
    const month = f.month.pattern
    const dow = f.dayOfWeek.pattern
    const everyDay = dom.kind === 'all' && month.kind === 'all' && dow.kind === 'all'

    if (everyDay) {
      if (minute.kind === 'all' && hour.kind === 'all') return t('cron.short.everyMinute')
      if (minute.kind === 'step' && hour.kind === 'all') {
        return t('cron.short.everyNMin', { n: minute.step }, minute.step)
      }
      if (minute.kind === 'single' && hour.kind === 'all') {
        return minute.value === 0 ? t('cron.short.hourly') : t('cron.short.hourlyAt', { mm: pad2(minute.value) })
      }
      if (minute.kind === 'single' && hour.kind === 'step') {
        return minute.value === 0
          ? t('cron.short.everyNHours', { n: hour.step }, hour.step)
          : t('cron.short.everyNHoursAt', { n: hour.step, mm: pad2(minute.value) }, hour.step)
      }
      if (minute.kind === 'single' && hour.kind === 'single') {
        return t('cron.short.daily', { time: hhmm(hour.value, minute.value) })
      }
    }

    if (minute.kind === 'single' && hour.kind === 'single' && month.kind === 'all') {
      const time = hhmm(hour.value, minute.value)
      if (dow.kind === 'all' && dom.kind === 'step') {
        return t('cron.short.everyNDays', { n: dom.step, time }, dom.step)
      }
      if (dow.kind === 'all' && dom.kind === 'single') {
        return t('cron.short.monthly', { ord: ord(dom.value), time })
      }
      if (dom.kind === 'all' && (dow.kind === 'single' || dow.kind === 'list')) {
        const days = dow.kind === 'single' ? [dow.value] : dow.values
        const labels = days.map((v) => t(`cron.names.daysShort.${DOW_KEYS[v] ?? v}`))
        return t('cron.short.weekly', { days: listFmt(labels), time })
      }
    }

    return sentence(f, false)
  }

  function issueText(issue: CronIssue): string {
    return t(`cron.errors.${issue.code}`, {
      ...issue.params,
      field: issue.field ? t(`cron.fields.${issue.field}`) : '',
    })
  }

  /** Every validation problem, one per broken field. Empty when the schedule is usable. */
  function errors(expr: string): string[] {
    const parsed = parseCron(expr)
    return parsed.status === 'invalid' ? parsed.issues.map(issueText) : []
  }

  function error(expr: string): string {
    return errors(expr)[0] ?? ''
  }

  /**
   * "Next (UTC): Aug 4, 00:00 · Aug 6, 00:00" — the box evaluates cron in UTC,
   * so these are deliberately not rendered in the browser's timezone.
   */
  function nextRunsText(expr: string, count = 3): string {
    const parsed = parseCron(expr)
    if (parsed.status !== 'ok') return ''
    const runs = nextRuns(parsed.fields, new Date(), count)
    if (!runs.length) return ''
    const fmt = new Intl.DateTimeFormat(getLocale(), {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    })
    return t('cron.nextRuns', { list: runs.map((r) => fmt.format(r)).join(' · ') })
  }

  return { describe, summarize, error, errors, nextRunsText }
}
