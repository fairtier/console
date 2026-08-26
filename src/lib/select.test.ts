import { describe, expect, test } from 'bun:test'
import { labelFor, moveActive, panelPosition, selectedIndex, typeaheadIndex } from './select'
import type { SelectOption } from './select'

const OPTS: SelectOption<string>[] = [
    { value: 'rest_api', label: 'REST API' },
    { value: 'sql_database', label: 'SQL Database' },
    { value: 'filesystem', label: 'Filesystem' },
    { value: 'google_sheets', label: 'Google Sheets' },
    { value: 'file_upload', label: 'File upload' },
]

describe('labelFor', () => {
    test('resolves a known value', () => {
        expect(labelFor(OPTS, 'filesystem')).toBe('Filesystem')
    })

    // The native <select> answered this case by displaying its first option,
    // which is how editing a pipeline of an unknown source_type silently
    // rewrote it to rest_api on save (console 0.8.0). Nothing selected must
    // look like nothing selected.
    test('falls back to the placeholder rather than the first option', () => {
        expect(labelFor(OPTS, 'duckdb', 'Select…')).toBe('Select…')
        expect(labelFor(OPTS, undefined, 'Select…')).toBe('Select…')
        expect(labelFor(OPTS, 'duckdb')).toBe('')
    })

    test('matches numeric values by identity, not coercion', () => {
        const rows: SelectOption<number>[] = [
            { value: 100, label: '100' },
            { value: 1000, label: '1000' },
        ]
        expect(labelFor(rows, 1000)).toBe('1000')
        expect(selectedIndex(rows, 1000)).toBe(1)
        expect(selectedIndex(rows, 999)).toBe(-1)
    })
})

describe('moveActive', () => {
    test('walks the list and wraps', () => {
        expect(moveActive(OPTS, 0, 'ArrowDown')).toBe(1)
        expect(moveActive(OPTS, 4, 'ArrowDown')).toBe(0)
        expect(moveActive(OPTS, 0, 'ArrowUp')).toBe(4)
        expect(moveActive(OPTS, 2, 'ArrowUp')).toBe(1)
    })

    test('Home and End go to the ends', () => {
        expect(moveActive(OPTS, 3, 'Home')).toBe(0)
        expect(moveActive(OPTS, 1, 'End')).toBe(4)
    })

    test('opens onto the first option downwards and the last upwards', () => {
        expect(moveActive(OPTS, -1, 'ArrowDown')).toBe(0)
        expect(moveActive(OPTS, -1, 'ArrowUp')).toBe(4)
    })

    test('skips disabled options in both directions', () => {
        const opts: SelectOption<string>[] = [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B', disabled: true },
            { value: 'c', label: 'C', disabled: true },
            { value: 'd', label: 'D' },
        ]
        expect(moveActive(opts, 0, 'ArrowDown')).toBe(3)
        expect(moveActive(opts, 0, 'ArrowUp')).toBe(3)
        expect(moveActive(opts, 3, 'ArrowDown')).toBe(0)
        expect(moveActive(opts, -1, 'End')).toBe(3)
    })

    test('answers -1 when nothing is selectable', () => {
        const opts: SelectOption<string>[] = [{ value: 'a', label: 'A', disabled: true }]
        expect(moveActive(opts, -1, 'ArrowDown')).toBe(-1)
        expect(moveActive([], -1, 'ArrowDown')).toBe(-1)
    })
})

describe('typeaheadIndex', () => {
    test('matches a label prefix, case-insensitively', () => {
        expect(typeaheadIndex(OPTS, 'goo')).toBe(3)
        expect(typeaheadIndex(OPTS, 'FILE')).toBe(2)
    })

    test('searches from a starting point and wraps', () => {
        expect(typeaheadIndex(OPTS, 'f', 3)).toBe(4)
        expect(typeaheadIndex(OPTS, 'r', 3)).toBe(0)
    })

    test('is inert for an empty buffer or no match', () => {
        expect(typeaheadIndex(OPTS, '   ')).toBe(-1)
        expect(typeaheadIndex(OPTS, 'zz')).toBe(-1)
    })
})

describe('panelPosition', () => {
    const viewport = { width: 1000, height: 800 }
    const trigger = { top: 100, left: 200, width: 300, height: 40 }

    test('opens below when the panel fits', () => {
        const p = panelPosition(trigger, 200, viewport)
        expect(p.placement).toBe('below')
        expect(p.top).toBe(144)
        expect(p.left).toBe(200)
        expect(p.width).toBe(300)
        expect(p.maxHeight).toBe(200)
    })

    test('flips above when there is more room there', () => {
        const low = { top: 700, left: 200, width: 300, height: 40 }
        const p = panelPosition(low, 300, viewport)
        expect(p.placement).toBe('above')
        // 300 wanted, 700 - 4 - 8 = 688 available, so the full panel fits.
        expect(p.maxHeight).toBe(300)
        expect(p.top).toBe(700 - 4 - 300)
    })

    test('caps maxHeight to the room available rather than overflowing', () => {
        const p = panelPosition(trigger, 5000, viewport)
        expect(p.placement).toBe('below')
        expect(p.maxHeight).toBe(800 - 140 - 4 - 8)
        expect(p.top + p.maxHeight).toBeLessThanOrEqual(viewport.height)
    })

    test('clamps horizontally to the viewport', () => {
        const offRight = { top: 100, left: 900, width: 300, height: 40 }
        const p = panelPosition(offRight, 100, viewport)
        expect(p.left + p.width).toBeLessThanOrEqual(viewport.width - 8)

        const offLeft = { top: 100, left: -50, width: 300, height: 40 }
        expect(panelPosition(offLeft, 100, viewport).left).toBe(8)
    })

    test('narrows a trigger wider than the viewport', () => {
        const wide = { top: 100, left: 0, width: 2000, height: 40 }
        const p = panelPosition(wide, 100, viewport)
        expect(p.width).toBe(1000 - 16)
        expect(p.left).toBe(8)
    })
})
