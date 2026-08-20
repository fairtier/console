<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from './Icon.vue'

const props = defineProps<{ code: string; filename?: string }>()
const { t } = useI18n()
const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function doCopy() {
    try {
        await navigator.clipboard.writeText(props.code)
    } catch {
        /* ignore */
    }
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (copied.value = false), 1400)
}
</script>

<template>
    <div class="overflow-hidden rounded-xl border" style="background: var(--inset); border-color: var(--line)">
        <div class="flex items-center justify-between border-b px-3 py-2" style="border-color: var(--line)">
            <span class="font-mono text-[11px] text-ink-3">{{ filename }}</span>
            <button
                type="button"
                class="flex items-center gap-[5px] border-none bg-transparent text-[11.5px] font-semibold hover:text-accent"
                :style="{ color: copied ? 'var(--ok)' : 'var(--ink-3)' }"
                @click="doCopy"
            >
                <Icon :name="copied ? 'check' : 'copy'" :size="13" />
                {{ copied ? t('common.copied') : t('common.copy') }}
            </button>
        </div>
        <pre class="m-0 overflow-x-auto whitespace-pre-wrap break-words px-3.5 py-3 font-mono text-[12px] leading-[1.7] text-ink-2">{{ code }}</pre>
    </div>
</template>
