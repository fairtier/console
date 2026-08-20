import { ref } from 'vue'

export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
    id: number
    kind: ToastKind
    message: string
}

// Module-level singleton; a single <ToastHost> in the layout renders these.
const toasts = ref<Toast[]>([])
let seq = 0

export function useToast() {
    function push(kind: ToastKind, message: string, ttl = 4000) {
        const id = ++seq
        toasts.value = [...toasts.value, { id, kind, message }]
        setTimeout(() => dismiss(id), ttl)
    }

    function dismiss(id: number) {
        toasts.value = toasts.value.filter((t) => t.id !== id)
    }

    return {
        toasts,
        dismiss,
        success: (m: string) => push('success', m),
        error: (m: string) => push('error', m),
        info: (m: string) => push('info', m),
    }
}
