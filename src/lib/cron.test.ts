import { describe, expect, test } from 'bun:test'
import { isValidCron, nextRuns, parseCron } from './cron'

function fields(expr: string) {
  const parsed = parseCron(expr)
  if (parsed.status !== 'ok') throw new Error(`expected ${expr} to parse, got ${JSON.stringify(parsed)}`)
  return parsed.fields
}

function issue(expr: string) {
  const parsed = parseCron(expr)
  if (parsed.status !== 'invalid') throw new Error(`expected ${expr} to be invalid`)
  return parsed.issues[0]!
}

describe('parseCron — shapes', () => {
  test('empty schedule is manual-only, not an error', () => {
    expect(parseCron('').status).toBe('empty')
    expect(parseCron('   ').status).toBe('empty')
  })

  test('wildcards', () => {
    expect(fields('* * * * *').minute.pattern).toEqual({ kind: 'all' })
  })

  test('step over the whole range', () => {
    expect(fields('*/5 * * * *').minute.pattern).toEqual({ kind: 'step', step: 5 })
    expect(fields('0 0 */2 * *').dayOfMonth.pattern).toEqual({ kind: 'step', step: 2 })
  })

  test('*/1 collapses to a plain wildcard', () => {
    expect(fields('*/1 * * * *').minute.pattern).toEqual({ kind: 'all' })
  })

  test('single values, lists and ranges', () => {
    expect(fields('5 * * * *').minute.pattern).toEqual({ kind: 'single', value: 5 })
    expect(fields('5,10,15 * * * *').minute.pattern).toEqual({ kind: 'list', values: [5, 10, 15] })
    expect(fields('0 9-17 * * *').hour.pattern).toEqual({ kind: 'range', from: 9, to: 17, step: 1 })
    expect(fields('5-30/5 * * * *').minute.pattern).toEqual({ kind: 'range', from: 5, to: 30, step: 5 })
  })

  test('a/n is shorthand for a-max/n', () => {
    expect(fields('5/10 * * * *').minute.pattern).toEqual({ kind: 'range', from: 5, to: 59, step: 10 })
  })

  test('mixed items degrade to complex but still expand', () => {
    const f = fields('5,10-14 * * * *')
    expect(f.minute.pattern).toEqual({ kind: 'complex' })
    expect(f.minute.values).toEqual([5, 10, 11, 12, 13, 14])
  })

  test('three-letter aliases for month and day-of-week', () => {
    expect(fields('0 0 * JAN *').month.pattern).toEqual({ kind: 'single', value: 1 })
    expect(fields('0 0 * * mon-fri').dayOfWeek.pattern).toEqual({ kind: 'range', from: 1, to: 5, step: 1 })
  })

  test('day-of-week 7 is Sunday', () => {
    expect(fields('0 0 * * 7').dayOfWeek.pattern).toEqual({ kind: 'single', value: 0 })
    expect(fields('0 0 * * *').dayOfWeek.values).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  test('expanded values are deduped and sorted', () => {
    expect(fields('30,0,30 * * * *').minute.values).toEqual([0, 30])
  })
})

describe('parseCron — validation', () => {
  test('field count', () => {
    expect(issue('0 0 * *')).toMatchObject({ code: 'fieldCount', params: { count: 4 } })
    expect(issue('* * * * * *')).toMatchObject({ code: 'secondsField' })
  })

  test('@shortcuts are rejected with the 5-field equivalent', () => {
    expect(issue('@daily')).toMatchObject({ code: 'macroUnsupported', params: { suggestion: '0 0 * * *' } })
    expect(issue('@reboot')).toMatchObject({ code: 'macroUnknown' })
  })

  test('out-of-range values', () => {
    expect(issue('0 75 * * *')).toMatchObject({ code: 'outOfRange', field: 'hour', params: { value: 75 } })
    expect(issue('0 0 32 * *')).toMatchObject({ code: 'outOfRange', field: 'dayOfMonth' })
    expect(issue('0 0 * * 8')).toMatchObject({ code: 'outOfRange', field: 'dayOfWeek' })
  })

  test('bad tokens', () => {
    expect(issue('abc')).toMatchObject({ code: 'fieldCount', params: { count: 1 } })
    expect(issue('abc * * * *')).toMatchObject({ code: 'badValue', field: 'minute', params: { token: 'abc' } })
    expect(issue('0 0 * * funday')).toMatchObject({ code: 'badValue', field: 'dayOfWeek' })
    expect(issue('0-1-2 * * * *')).toMatchObject({ code: 'badValue', field: 'minute' })
  })

  test('zero and non-numeric steps', () => {
    expect(issue('0 0 */0 * *')).toMatchObject({ code: 'badStep', field: 'dayOfMonth' })
    expect(issue('*/x * * * *')).toMatchObject({ code: 'badStep', field: 'minute' })
  })

  test('backwards ranges', () => {
    expect(issue('0 17-9 * * *')).toMatchObject({ code: 'reversedRange', field: 'hour' })
  })

  test('stray commas', () => {
    expect(issue('0,,5 * * * *')).toMatchObject({ code: 'emptyItem', field: 'minute' })
    expect(issue('0 0 * * 1,')).toMatchObject({ code: 'emptyItem', field: 'dayOfWeek' })
  })

  test('every broken field is reported, not just the first', () => {
    const parsed = parseCron('99 99 * * *')
    expect(parsed.status).toBe('invalid')
    if (parsed.status === 'invalid') {
      expect(parsed.issues.map((i) => i.field)).toEqual(['minute', 'hour'])
    }
  })

  test('isValidCron treats empty as valid', () => {
    expect(isValidCron('')).toBe(true)
    expect(isValidCron('0 4 * * 1-5')).toBe(true)
    expect(isValidCron('0 4 * * 1-99')).toBe(false)
  })
})

describe('nextRuns', () => {
  const from = new Date('2026-08-02T10:17:30Z') // a Sunday

  const iso = (expr: string, count = 3) =>
    nextRuns(fields(expr), from, count).map((d) => d.toISOString().slice(0, 16) + 'Z')

  test('starts at the next whole minute', () => {
    expect(iso('* * * * *', 2)).toEqual(['2026-08-02T10:18Z', '2026-08-02T10:19Z'])
  })

  test('every 2nd day-of-month', () => {
    expect(iso('0 0 */2 * *')).toEqual(['2026-08-03T00:00Z', '2026-08-05T00:00Z', '2026-08-07T00:00Z'])
  })

  test('weekdays only', () => {
    expect(iso('0 4 * * 1-5')).toEqual(['2026-08-03T04:00Z', '2026-08-04T04:00Z', '2026-08-05T04:00Z'])
  })

  test('later the same day', () => {
    expect(iso('30 10,11 * * *', 2)).toEqual(['2026-08-02T10:30Z', '2026-08-02T11:30Z'])
  })

  test('rolls into the next month and year', () => {
    expect(iso('0 0 1 1 *', 2)).toEqual(['2027-01-01T00:00Z', '2028-01-01T00:00Z'])
  })

  test('restricted day-of-month and day-of-week match on either (Vixie rule)', () => {
    // 1st of the month OR any Monday.
    expect(iso('0 0 1 * 1')).toEqual(['2026-08-03T00:00Z', '2026-08-10T00:00Z', '2026-08-17T00:00Z'])
  })

  test('a day that never comes yields nothing instead of hanging', () => {
    expect(iso('0 0 30 2 *')).toEqual([])
  })
})
