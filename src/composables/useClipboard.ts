import { ref } from 'vue'

/**
 * Tracks "just copied" feedback by key. Call copy(key, text); `copied` holds the
 * last copied key for ~1.4s so buttons can show a confirmation state.
 */
export function useClipboard() {
    const copied = ref<string>('')
    let timer: ReturnType<typeof setTimeout> | undefined

    async function copy(key: string, text: string) {
        try {
            await navigator.clipboard.writeText(text)
        } catch {
            /* clipboard may be unavailable (insecure context) — ignore */
        }
        copied.value = key
        clearTimeout(timer)
        timer = setTimeout(() => {
            copied.value = ''
        }, 1400)
    }

    return { copied, copy }
}
