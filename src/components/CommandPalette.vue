<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useCommandPalette } from '../composables/useCommandPalette'
import { pipelineClient } from '../api'
import { visibleNavItems } from '../layouts/navModel'
import Icon from './ui/Icon.vue'
import type { IconName } from './ui/icons'

const { t } = useI18n()
const router = useRouter()
const { open, closePalette } = useCommandPalette()

interface Command {
    id: string
    label: string
    hint?: string
    icon: IconName
    keywords: string
    run: () => void
}

const query = ref('')
const selected = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)

// Static navigation + action commands. The screen list comes from the shared
// nav model, so the palette cannot drift from the sidebar (it used to be a
// hand-kept copy, and had already lost the SQL page) and hidden pages stay
// unreachable by keyboard too.
const navCommands = computed<Command[]>(() => {
    const nav = visibleNavItems()
    const items: Command[] = nav.map((n) => ({
        id: `nav:${n.name}`,
        label: t(n.labelKey),
        hint: t('palette.hint.go'),
        icon: n.icon,
        keywords: `${t(n.labelKey)} ${n.name}`,
        run: () =>
            n.externalUrl
                ? // Same tab, like the sidebar: a palette entry navigates, it
                  // does not spawn a window.
                  void window.location.assign(n.externalUrl)
                : void router.push({ name: n.name }),
    }))
    items.push({
        id: 'action:new-pipeline',
        label: t('palette.newPipeline'),
        hint: t('palette.hint.action'),
        icon: 'plus',
        keywords: `${t('palette.newPipeline')} create add pipeline`,
        run: () => router.push({ name: 'pipeline-new' }),
    })
    return items
})

// Dynamic pipeline entries, loaded lazily the first time the palette opens.
const pipelineCommands = ref<Command[]>([])
const loadedPipelines = ref(false)

async function loadPipelines() {
    if (loadedPipelines.value) return
    loadedPipelines.value = true
    try {
        const resp = await pipelineClient.listPipelines({})
        pipelineCommands.value = resp.pipelines.map((p) => ({
            id: `pipeline:${p.id}`,
            label: p.name,
            hint: t('palette.hint.pipeline'),
            icon: 'pipelines' as IconName,
            keywords: `${p.name} ${p.sourceType} ${p.datasetName} pipeline`,
            run: () => router.push({ name: 'pipeline-new', query: { id: p.id } }),
        }))
    } catch {
        // Search degrades to static commands if the list can't be fetched.
        pipelineCommands.value = []
    }
}

const allCommands = computed<Command[]>(() => [...navCommands.value, ...pipelineCommands.value])

// Case-insensitive substring match over label + keywords, ranking prefix
// matches above mid-string matches. Empty query shows everything.
const results = computed<Command[]>(() => {
    const q = query.value.trim().toLowerCase()
    if (!q) return allCommands.value
    const scored = allCommands.value
        .map((c) => {
            const label = c.label.toLowerCase()
            const hay = `${label} ${c.keywords.toLowerCase()}`
            if (!hay.includes(q)) return null
            const score = label.startsWith(q) ? 0 : label.includes(q) ? 1 : 2
            return { c, score }
        })
        .filter((x): x is { c: Command; score: number } => x !== null)
    scored.sort((a, b) => a.score - b.score)
    return scored.map((x) => x.c)
})

watch(results, () => {
    selected.value = 0
})

watch(open, async (isOpen) => {
    if (isOpen) {
        query.value = ''
        selected.value = 0
        void loadPipelines()
        await nextTick()
        inputEl.value?.focus()
    }
})

function move(delta: number) {
    const n = results.value.length
    if (n === 0) return
    selected.value = (selected.value + delta + n) % n
}

function runSelected() {
    const cmd = results.value[selected.value]
    if (!cmd) return
    cmd.run()
    closePalette()
}

function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
        e.preventDefault()
        move(1)
    } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        move(-1)
    } else if (e.key === 'Enter') {
        e.preventDefault()
        runSelected()
    } else if (e.key === 'Escape') {
        e.preventDefault()
        closePalette()
    }
}
</script>

<template>
    <Teleport to="body">
        <div
            v-if="open"
            class="fixed inset-0 z-[200] flex items-start justify-center p-6 pt-[14vh]"
            style="background: rgba(20, 18, 12, 0.42); animation: ftrise 0.14s ease"
            @click.self="closePalette"
        >
            <div
                class="flex w-full max-w-[560px] flex-col overflow-hidden rounded-[16px] border bg-surface text-ink"
                style="border-color: var(--line); box-shadow: var(--shadow-lg)"
                @keydown="onKeydown"
            >
                <div class="flex items-center gap-2.5 border-b px-4" style="border-color: var(--line)">
                    <Icon name="search" :size="17" class="flex-none text-ink-3" />
                    <input
                        ref="inputEl"
                        v-model="query"
                        :placeholder="t('palette.placeholder')"
                        class="h-[50px] w-full border-none bg-transparent text-[15px] outline-none"
                        style="color: var(--ink)"
                        autocomplete="off"
                        spellcheck="false"
                    />
                </div>
                <div class="max-h-[52vh] overflow-y-auto py-2">
                    <p
                        v-if="results.length === 0"
                        class="m-0 px-4 py-6 text-center text-[13.5px] text-ink-3"
                    >
                        {{ t('palette.empty') }}
                    </p>
                    <button
                        v-for="(cmd, i) in results"
                        :key="cmd.id"
                        type="button"
                        class="flex w-full items-center gap-3 border-none px-4 py-2.5 text-left"
                        :style="{
                            background: i === selected ? 'var(--surface-2)' : 'transparent',
                            cursor: 'pointer',
                        }"
                        @mousemove="selected = i"
                        @click="runSelected"
                    >
                        <span class="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg" style="background: var(--inset); color: var(--ink-2)">
                            <Icon :name="cmd.icon" :size="16" />
                        </span>
                        <span class="min-w-0 flex-1 truncate text-[14px] font-medium">{{ cmd.label }}</span>
                        <span v-if="cmd.hint" class="flex-none text-[11px] uppercase tracking-wide text-ink-3">{{ cmd.hint }}</span>
                    </button>
                </div>
                <div
                    class="flex items-center gap-4 border-t px-4 py-2 text-[11px] text-ink-3"
                    style="border-color: var(--line)"
                >
                    <span>↑↓ {{ t('palette.footer.navigate') }}</span>
                    <span>↵ {{ t('palette.footer.open') }}</span>
                    <span>esc {{ t('palette.footer.close') }}</span>
                </div>
            </div>
        </div>
    </Teleport>
</template>
