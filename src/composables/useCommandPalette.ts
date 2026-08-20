import { ref } from 'vue'

// Module-level singleton so the top-bar trigger and the global Cmd/Ctrl+K
// listener share one open state with the mounted CommandPalette component.
const open = ref(false)

export function useCommandPalette() {
    function openPalette() {
        open.value = true
    }
    function closePalette() {
        open.value = false
    }
    function toggle() {
        open.value = !open.value
    }
    return { open, openPalette, closePalette, toggle }
}
