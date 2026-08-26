// The mechanics behind ui/Select.vue: label resolution, keyboard navigation
// and panel placement.
//
// They live here rather than inside the SFC for the reason the pipeline-source
// registry does (src/lib/pipelineSources/index.ts): Bun imports a .vue file as
// a plain string, so anything reachable only through a component is unreachable
// by `bun test`. A custom listbox is exactly the kind of thing that must be
// tested — the native <select> it replaces got wrapping, disabled skipping and
// viewport clamping from the browser, and we now owe all three ourselves.

/** Values a Select can carry. Numbers matter: the SQL row limit is one. */
export type SelectValue = string | number

export interface SelectOption<T extends SelectValue = SelectValue> {
    value: T
    label: string
    disabled?: boolean
}

/**
 * labelFor resolves what the closed control shows.
 *
 * A value matching no option is not an error: a pipeline can hold a
 * `source_type` this build has never heard of, and the same registry that
 * renders it (`sourceFor`) hands the wizard a synthetic option for it. But the
 * caller may also legitimately hold a value with no option yet — an unloaded
 * list, an empty form — and that is what `placeholder` is for. Never render
 * the first option as if it were selected; that is the bug the native <select>
 * had (console 0.8.0, "editing a pipeline whose source_type this build does
 * not know no longer rewrites that type to rest_api on save").
 */
export function labelFor<T extends SelectValue>(
    options: SelectOption<T>[],
    value: T | undefined,
    placeholder = '',
): string {
    const hit = options.find((o) => o.value === value)
    if (hit) return hit.label
    return placeholder
}

/** selectedIndex is the index of value in options, or -1. */
export function selectedIndex<T extends SelectValue>(options: SelectOption<T>[], value: T | undefined): number {
    return options.findIndex((o) => o.value === value)
}

/** Keys moveActive understands. Anything else leaves the index alone. */
export type NavKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'

/**
 * moveActive returns the next highlighted index for a key press.
 *
 * Disabled options are skipped, movement wraps, and a list with nothing
 * selectable answers -1. `current` may be -1 (nothing highlighted yet), in
 * which case ArrowDown lands on the first enabled option and ArrowUp on the
 * last — the behaviour a native listbox has when opened with no selection.
 */
export function moveActive<T extends SelectValue>(
    options: SelectOption<T>[],
    current: number,
    key: NavKey,
): number {
    const enabled = options.some((o) => !o.disabled)
    if (!enabled) return -1

    const step = (from: number, delta: number): number => {
        const n = options.length
        let i = from
        for (let hops = 0; hops < n; hops++) {
            i = (i + delta + n) % n
            if (!options[i]!.disabled) return i
        }
        return -1
    }

    switch (key) {
        case 'ArrowDown':
            return step(current < 0 ? -1 : current, 1)
        case 'ArrowUp':
            return step(current < 0 ? 0 : current, -1)
        case 'Home':
            return step(-1, 1)
        case 'End':
            return step(options.length, -1)
    }
}

/**
 * typeaheadIndex finds the first enabled option whose label starts with
 * `buffer`, searching from `from` and wrapping. Case-insensitive; returns -1
 * for an empty buffer or no match.
 */
export function typeaheadIndex<T extends SelectValue>(
    options: SelectOption<T>[],
    buffer: string,
    from = 0,
): number {
    const needle = buffer.trim().toLowerCase()
    if (!needle) return -1
    const n = options.length
    for (let hops = 0; hops < n; hops++) {
        const i = (from + hops + n) % n
        const o = options[i]!
        if (o.disabled) continue
        if (o.label.toLowerCase().startsWith(needle)) return i
    }
    return -1
}

export interface Rect {
    top: number
    left: number
    width: number
    height: number
}

export interface Viewport {
    width: number
    height: number
}

export interface PanelPosition {
    /** Viewport coordinates — the panel is position:fixed. */
    top: number
    left: number
    width: number
    maxHeight: number
    placement: 'below' | 'above'
}

/**
 * panelPosition places the dropdown against its trigger.
 *
 * The panel is teleported to <body> so it escapes the `overflow:hidden` cards
 * the wizard is built from — the same escape PipelinesView's row menu makes —
 * which means nothing else clamps it to the viewport. It opens below when the
 * whole panel fits there, above when it fits there instead, and otherwise on
 * whichever side has more room, capped by `maxHeight` so the list scrolls
 * rather than running off-screen.
 */
export function panelPosition(
    trigger: Rect,
    panelHeight: number,
    viewport: Viewport,
    gap = 4,
    margin = 8,
): PanelPosition {
    const below = Math.max(0, viewport.height - (trigger.top + trigger.height) - gap - margin)
    const above = Math.max(0, trigger.top - gap - margin)

    let placement: 'below' | 'above' = 'below'
    if (panelHeight > below && above > below) placement = 'above'

    const room = placement === 'below' ? below : above
    const maxHeight = Math.min(panelHeight, room)

    const width = Math.min(trigger.width, Math.max(0, viewport.width - margin * 2))
    const left = Math.max(margin, Math.min(trigger.left, viewport.width - width - margin))
    const top = placement === 'below' ? trigger.top + trigger.height + gap : trigger.top - gap - maxHeight

    return { top, left, width, maxHeight, placement }
}
