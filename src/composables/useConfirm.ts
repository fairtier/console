import { ref, shallowRef } from 'vue'

export interface ConfirmOptions {
    title: string
    body: string
    /** Confirm button label. */
    confirmLabel: string
    /** When true, the confirm button is styled destructively (default true). */
    danger?: boolean
}

interface PendingConfirm extends ConfirmOptions {
    resolve: (ok: boolean) => void
}

// Module-level singleton so a single <ConfirmHost> mounted in the layout serves
// the whole app, and any view can `await confirm({...})`.
const current = shallowRef<PendingConfirm | null>(null)
const open = ref(false)

export function useConfirm() {
    function confirm(opts: ConfirmOptions): Promise<boolean> {
        return new Promise((resolve) => {
            current.value = { danger: true, ...opts, resolve }
            open.value = true
        })
    }

    function resolveWith(ok: boolean) {
        current.value?.resolve(ok)
        open.value = false
        current.value = null
    }

    return { confirm, resolveWith, current, open }
}
