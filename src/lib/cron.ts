// Cron parsing + validation for the 5-field (Vixie) syntax the box scheduler
// evaluates. The box runs on UTC, so every date this module produces is UTC.
//
// Deliberately pure and locale-free: the human-readable rendering lives in
// src/composables/useCronText.ts, which turns these structures into text
// through vue-i18n (the Console is bilingual, cron text has to be too).

export const CRON_FIELD_NAMES = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'] as const
export type CronFieldName = (typeof CRON_FIELD_NAMES)[number]

// The shape of a single field, used both for phrasing and for the short
// summary. Anything we can't say in one clause degrades to 'complex' and is
// rendered from the raw text.
export type CronPattern =
  | { kind: 'all' } // *
  | { kind: 'step'; step: number } // */n
  | { kind: 'single'; value: number } // 5
  | { kind: 'list'; values: number[] } // 5,10,15
  | { kind: 'range'; from: number; to: number; step: number } // 5-30, 5-30/5, 5/10
  | { kind: 'complex' } // anything mixed: 5,10-20/2

export interface CronField {
  name: CronFieldName
  raw: string
  pattern: CronPattern
  /** Every matching value, ascending (day-of-week normalised so 7 → 0). */
  values: number[]
}

export type CronFields = Record<CronFieldName, CronField>

export type CronIssueCode =
  | 'fieldCount'
  | 'secondsField'
  | 'macroUnsupported'
  | 'macroUnknown'
  | 'emptyItem'
  | 'badValue'
  | 'outOfRange'
  | 'reversedRange'
  | 'badStep'

export interface CronIssue {
  code: CronIssueCode
  field?: CronFieldName
  params: Record<string, string | number>
}

export type CronParse =
  | { status: 'empty' } // no schedule → manual-only, not an error
  | { status: 'ok'; fields: CronFields }
  | { status: 'invalid'; issues: CronIssue[] }

interface FieldSpec {
  name: CronFieldName
  min: number
  max: number
  /** Three-letter aliases, lowercase, indexed from `namesFrom`. */
  names?: readonly string[]
  namesFrom?: number
}

const MONTH_ALIASES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const
const DOW_ALIASES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

// day-of-week accepts 7 as a second spelling of Sunday (Vixie); it is folded
// back to 0 in `values` and in a 'single' pattern so name lookups work.
const SPECS: readonly FieldSpec[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'dayOfMonth', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12, names: MONTH_ALIASES, namesFrom: 1 },
  { name: 'dayOfWeek', min: 0, max: 7, names: DOW_ALIASES, namesFrom: 0 },
]

// @shortcuts are not part of the 5-field syntax the box parses; we reject them
// but hand back the equivalent expression so the fix is one click of thought.
const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
}

function issue(code: CronIssueCode, spec: FieldSpec, params: Record<string, string | number>): CronIssue {
  return { code, field: spec.name, params }
}

function isIssue(x: unknown): x is CronIssue {
  return typeof x === 'object' && x !== null && 'code' in x
}

function parseValue(token: string, spec: FieldSpec): number | CronIssue {
  if (token === '') return issue('emptyItem', spec, { raw: token })
  if (/^\d+$/.test(token)) {
    const n = Number(token)
    if (n < spec.min || n > spec.max) {
      return issue('outOfRange', spec, { value: n, min: spec.min, max: spec.max })
    }
    return n
  }
  const idx = spec.names ? spec.names.indexOf(token.toLowerCase() as never) : -1
  if (idx >= 0) return idx + (spec.namesFrom ?? 0)
  return issue('badValue', spec, { token })
}

interface CronItem {
  from: number
  to: number
  step: number
  wildcard: boolean
  /** `a-b` was written out, as opposed to a bare value or `a/n`. */
  explicitRange: boolean
}

function parseItem(item: string, spec: FieldSpec): CronItem | CronIssue {
  if (item === '') return issue('emptyItem', spec, { raw: item })
  const slash = item.split('/')
  if (slash.length > 2) return issue('badStep', spec, { step: item })
  const rangeRaw = slash[0] ?? ''
  const stepRaw = slash[1]
  let step = 1
  if (stepRaw !== undefined) {
    if (!/^\d+$/.test(stepRaw) || Number(stepRaw) === 0) {
      return issue('badStep', spec, { step: stepRaw })
    }
    step = Number(stepRaw)
  }
  if (rangeRaw === '') return issue('emptyItem', spec, { raw: item })
  if (rangeRaw === '*') {
    return { from: spec.min, to: spec.max, step, wildcard: true, explicitRange: false }
  }
  const dash = rangeRaw.split('-')
  if (dash.length > 2) return issue('badValue', spec, { token: rangeRaw })
  const from = parseValue(dash[0] ?? '', spec)
  if (isIssue(from)) return from
  if (dash.length === 1) {
    // `5/10` is Vixie shorthand for `5-<max>/10`; a bare `5` is just 5.
    return { from, to: stepRaw !== undefined ? spec.max : from, step, wildcard: false, explicitRange: false }
  }
  const to = parseValue(dash[1] ?? '', spec)
  if (isIssue(to)) return to
  if (from > to) return issue('reversedRange', spec, { from: dash[0] ?? '', to: dash[1] ?? '' })
  return { from, to, step, wildcard: false, explicitRange: true }
}

function normalize(value: number, spec: FieldSpec): number {
  return spec.name === 'dayOfWeek' && value === 7 ? 0 : value
}

function parseField(raw: string, spec: FieldSpec): CronField | CronIssue {
  const items: CronItem[] = []
  for (const chunk of raw.split(',')) {
    const item = parseItem(chunk, spec)
    if (isIssue(item)) return item
    items.push(item)
  }

  const seen = new Set<number>()
  for (const item of items) {
    for (let v = item.from; v <= item.to; v += item.step) seen.add(normalize(v, spec))
  }
  const values = [...seen].sort((a, b) => a - b)

  const isPlainValue = (i: CronItem) => !i.wildcard && !i.explicitRange && i.from === i.to && i.step === 1
  let pattern: CronPattern
  const only = items.length === 1 ? items[0]! : null
  if (only) {
    if (only.wildcard) pattern = only.step === 1 ? { kind: 'all' } : { kind: 'step', step: only.step }
    else if (isPlainValue(only)) pattern = { kind: 'single', value: normalize(only.from, spec) }
    else pattern = { kind: 'range', from: only.from, to: only.to, step: only.step }
  } else if (items.every(isPlainValue)) {
    pattern = { kind: 'list', values }
  } else {
    pattern = { kind: 'complex' }
  }

  return { name: spec.name, raw, pattern, values }
}

/** Parse a schedule. An empty string is `empty` (manual-only), not an error. */
export function parseCron(input: string): CronParse {
  const expr = input.trim()
  if (!expr) return { status: 'empty' }

  if (expr.startsWith('@')) {
    const suggestion = MACROS[expr.toLowerCase()]
    return {
      status: 'invalid',
      issues: [
        suggestion
          ? { code: 'macroUnsupported', params: { macro: expr, suggestion } }
          : { code: 'macroUnknown', params: { macro: expr } },
      ],
    }
  }

  const parts = expr.split(/\s+/)
  if (parts.length !== 5) {
    return {
      status: 'invalid',
      issues: [
        parts.length === 6
          ? { code: 'secondsField', params: { count: parts.length } }
          : { code: 'fieldCount', params: { count: parts.length } },
      ],
    }
  }

  const fields = {} as CronFields
  const issues: CronIssue[] = []
  SPECS.forEach((spec, i) => {
    const field = parseField(parts[i] ?? '', spec)
    if (isIssue(field)) issues.push(field)
    else fields[spec.name] = field
  })
  if (issues.length) return { status: 'invalid', issues }
  return { status: 'ok', fields }
}

/** True for a well-formed expression; an empty schedule counts as valid. */
export function isValidCron(expr: string): boolean {
  return parseCron(expr).status !== 'invalid'
}

// Roughly four years of days — enough to reach the next Feb 29 that also
// satisfies a day-of-week constraint before we give up.
const MAX_LOOKAHEAD_DAYS = 1500

function dayMatches(fields: CronFields, date: Date, domRestricted: boolean, dowRestricted: boolean): boolean {
  if (!fields.month.values.includes(date.getUTCMonth() + 1)) return false
  const dom = fields.dayOfMonth.values.includes(date.getUTCDate())
  const dow = fields.dayOfWeek.values.includes(date.getUTCDay())
  // Vixie's quirk: with both day fields restricted the day matches on either.
  if (domRestricted && dowRestricted) return dom || dow
  if (domRestricted) return dom
  if (dowRestricted) return dow
  return true
}

/** The next `count` firing times strictly after `from`, in UTC. */
export function nextRuns(fields: CronFields, from: Date, count: number): Date[] {
  const out: Date[] = []
  if (count <= 0) return out
  // Cron fires on whole minutes; the next candidate is the minute after `from`.
  const start = Math.floor(from.getTime() / 60_000) * 60_000 + 60_000
  const domRestricted = fields.dayOfMonth.pattern.kind !== 'all'
  const dowRestricted = fields.dayOfWeek.pattern.kind !== 'all'

  const cursor = new Date(start)
  cursor.setUTCHours(0, 0, 0, 0)
  for (let day = 0; day < MAX_LOOKAHEAD_DAYS && out.length < count; day++) {
    if (dayMatches(fields, cursor, domRestricted, dowRestricted)) {
      const y = cursor.getUTCFullYear()
      const mo = cursor.getUTCMonth()
      const d = cursor.getUTCDate()
      outer: for (const h of fields.hour.values) {
        for (const mi of fields.minute.values) {
          const ts = Date.UTC(y, mo, d, h, mi)
          if (ts < start) continue
          out.push(new Date(ts))
          if (out.length === count) break outer
        }
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}
