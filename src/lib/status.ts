// Shared visual language for async / lifecycle states across the console.
// Colours reference the design tokens defined in style.css.

export type LifecycleStatus =
    | 'active'
    | 'success'
    | 'running'
    | 'provisioning'
    | 'pending'
    | 'failed'
    | 'off'
    | 'deprovisioning'
    | 'destroyed'

export interface ChipStyle {
    /** i18n key for the label, resolved by the component. */
    labelKey: string
    bg: string
    fg: string
    dot: string
}

const CHIPS: Record<LifecycleStatus, ChipStyle> = {
    active: { labelKey: 'status.active', bg: 'var(--ok-soft)', fg: 'var(--ok-ink)', dot: 'var(--ok)' },
    success: { labelKey: 'status.success', bg: 'var(--ok-soft)', fg: 'var(--ok-ink)', dot: 'var(--ok)' },
    running: { labelKey: 'status.running', bg: 'var(--info-soft)', fg: 'var(--info-ink)', dot: 'var(--info)' },
    provisioning: { labelKey: 'status.provisioning', bg: 'var(--warn-soft)', fg: 'var(--warn-ink)', dot: 'var(--warn)' },
    pending: { labelKey: 'status.pending', bg: 'var(--warn-soft)', fg: 'var(--warn-ink)', dot: 'var(--warn)' },
    failed: { labelKey: 'status.failed', bg: 'var(--err-soft)', fg: 'var(--err-ink)', dot: 'var(--err)' },
    off: { labelKey: 'status.off', bg: 'var(--inset)', fg: 'var(--ink-3)', dot: 'var(--ink-3)' },
    deprovisioning: { labelKey: 'status.tearingDown', bg: 'var(--inset)', fg: 'var(--ink-3)', dot: 'var(--ink-3)' },
    destroyed: { labelKey: 'status.destroyed', bg: 'var(--inset)', fg: 'var(--ink-3)', dot: 'var(--ink-3)' },
}

export function chipFor(status: string): ChipStyle {
    return CHIPS[status as LifecycleStatus] ?? CHIPS.off
}
