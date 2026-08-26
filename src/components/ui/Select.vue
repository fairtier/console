<script setup lang="ts" generic="T extends SelectValue">
// The console's dropdown.
//
// It replaces the native <select>, which could never look like the rest of the
// app: `appearance-none` styles the closed control only — the open list is
// drawn by the browser, so Firefox showed an OS popup with square corners and
// a white border in the middle of a dark themed form.
//
// The panel is teleported to <body> because every form here sits inside a card
// with `overflow:hidden` (the same escape PipelinesView's row menu makes), and
// is positioned in viewport coordinates by `panelPosition`. Label resolution,
// keyboard navigation and placement live in src/lib/select.ts so they are
// testable; this file is the DOM and the ARIA.
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import {
    labelFor,
    moveActive,
    panelPosition,
    selectedIndex,
    typeaheadIndex,
    type NavKey,
    type PanelPosition,
    type SelectOption,
    type SelectValue,
} from '../../lib/select'
import Icon from './Icon.vue'

const props = withDefaults(
    defineProps<{
        options: SelectOption<T>[]
        /** md (default) matches the app's h-10 inputs; sm the h-[34px] ones. */
        size?: 'sm' | 'md'
        disabled?: boolean
        /** Shown when the value matches no option — never the first option. */
        placeholder?: string
        ariaLabel?: string
    }>(),
    { size: 'md', placeholder: '' },
)

const model = defineModel<T>({ required: true })

const NAV_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End']
/** Panel height cap; `panelPosition` shrinks it further when room is short. */
const MAX_PANEL_HEIGHT = 288

const listId = useId()
const open = ref(false)
const active = ref(-1)
const trigger = ref<HTMLButtonElement | null>(null)
const list = ref<HTMLUListElement | null>(null)
const pos = ref<PanelPosition>({ top: 0, left: 0, width: 0, maxHeight: 0, placement: 'below' })

const label = computed(() => labelFor(props.options, model.value, props.placeholder))
const isPlaceholder = computed(() => selectedIndex(props.options, model.value) < 0)

const height = computed(() => (props.size === 'sm' ? 'h-[34px]' : 'h-10'))
const text = computed(() => (props.size === 'sm' ? 'text-[12.5px]' : 'text-sm'))
const radius = computed(() => (props.size === 'sm' ? 'rounded-[9px]' : 'rounded-[10px]'))
const padding = computed(() => (props.size === 'sm' ? 'px-2' : 'px-[13px]'))

function place() {
    const el = trigger.value
    if (!el) return
    const r = el.getBoundingClientRect()
    pos.value = panelPosition(
        { top: r.top, left: r.left, width: r.width, height: r.height },
        MAX_PANEL_HEIGHT,
        { width: window.innerWidth, height: window.innerHeight },
    )
}

function openPanel(from: NavKey | null = null) {
    if (props.disabled || open.value) return
    place()
    const sel = selectedIndex(props.options, model.value)
    active.value = sel >= 0 ? sel : from ? moveActive(props.options, -1, from) : moveActive(props.options, -1, 'ArrowDown')
    open.value = true
    void nextTick(() => scrollActiveIntoView())
}

function closePanel(refocus = true) {
    if (!open.value) return
    open.value = false
    active.value = -1
    if (refocus) trigger.value?.focus()
}

function choose(index: number) {
    const opt = props.options[index]
    if (!opt || opt.disabled) return
    model.value = opt.value
    closePanel()
}

function scrollActiveIntoView() {
    if (active.value < 0) return
    const row = list.value?.children[active.value] as HTMLElement | undefined
    row?.scrollIntoView({ block: 'nearest' })
}

// --- Typeahead: the one affordance of the native control people notice when
// it is missing. The buffer resets after a pause, as it does in a real listbox.
let typeBuffer = ''
let typeTimer: ReturnType<typeof setTimeout> | undefined
function typeahead(ch: string) {
    clearTimeout(typeTimer)
    typeBuffer += ch
    typeTimer = setTimeout(() => {
        typeBuffer = ''
    }, 600)
    const from = active.value >= 0 ? active.value : selectedIndex(props.options, model.value)
    // A repeated single character cycles; a longer buffer re-matches in place.
    const start = typeBuffer.length === 1 ? from + 1 : Math.max(0, from)
    const hit = typeaheadIndex(props.options, typeBuffer, start)
    if (hit < 0) return
    if (open.value) {
        active.value = hit
        void nextTick(() => scrollActiveIntoView())
    } else {
        choose(hit)
    }
}

function onKeydown(e: KeyboardEvent) {
    if (props.disabled) return

    if (!open.value) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            openPanel(e.key === 'ArrowUp' ? 'ArrowUp' : 'ArrowDown')
            return
        }
    } else {
        if (NAV_KEYS.includes(e.key)) {
            e.preventDefault()
            active.value = moveActive(props.options, active.value, e.key as NavKey)
            void nextTick(() => scrollActiveIntoView())
            return
        }
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            choose(active.value)
            return
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            closePanel()
            return
        }
        if (e.key === 'Tab') {
            closePanel(false)
            return
        }
    }

    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        typeahead(e.key)
    }
}

// Dismissal. Scroll and resize close rather than chase the trigger: the panel
// is position:fixed, so a scrolling ancestor would otherwise leave it behind.
function onDocPointerDown(e: PointerEvent) {
    const target = e.target as Node
    if (trigger.value?.contains(target) || list.value?.contains(target)) return
    closePanel(false)
}
function onViewportChange() {
    closePanel(false)
}

watch(open, (isOpen) => {
    if (isOpen) {
        document.addEventListener('pointerdown', onDocPointerDown, true)
        window.addEventListener('scroll', onViewportChange, true)
        window.addEventListener('resize', onViewportChange)
    } else {
        document.removeEventListener('pointerdown', onDocPointerDown, true)
        window.removeEventListener('scroll', onViewportChange, true)
        window.removeEventListener('resize', onViewportChange)
    }
})

// A disabled control must not keep an open panel alive above the page.
watch(
    () => props.disabled,
    (isDisabled) => {
        if (isDisabled) closePanel(false)
    },
)

onBeforeUnmount(() => {
    clearTimeout(typeTimer)
    document.removeEventListener('pointerdown', onDocPointerDown, true)
    window.removeEventListener('scroll', onViewportChange, true)
    window.removeEventListener('resize', onViewportChange)
})
</script>

<template>
    <!-- Single root so a call site can still pass layout classes (`flex-1`,
         `w-[86px]`) the way it did to the <select> it replaces. No width of its
         own: a block parent gives it the full row, and a flex parent is told
         what to do by the call site — a `w-full` here would collide with that
         class rather than yield to it. -->
    <div>
        <button
            ref="trigger"
            type="button"
            role="combobox"
            :aria-expanded="open"
            :aria-controls="listId"
            aria-haspopup="listbox"
            :aria-label="ariaLabel"
            :disabled="disabled"
            class="flex w-full items-center justify-between gap-2 border text-left font-sans outline-none disabled:cursor-not-allowed disabled:opacity-60"
            :class="[height, text, radius, padding, disabled ? '' : 'cursor-pointer']"
            :style="{
                background: 'var(--surface-2)',
                borderColor: open ? 'var(--accent)' : 'var(--line)',
                color: isPlaceholder ? 'var(--ink-3)' : 'var(--ink)',
            }"
            @click="open ? closePanel() : openPanel()"
            @keydown="onKeydown"
        >
            <span class="truncate">{{ label }}</span>
            <Icon name="chevronDown" :size="size === 'sm' ? 13 : 15" class="flex-none" :style="{ color: 'var(--ink-3)' }" />
        </button>

        <Teleport to="body">
            <ul
                v-if="open"
                :id="listId"
                ref="list"
                role="listbox"
                class="fixed z-[250] m-0 overflow-y-auto rounded-[10px] border p-1 outline-none"
                :style="{
                    top: `${pos.top}px`,
                    left: `${pos.left}px`,
                    width: `${pos.width}px`,
                    maxHeight: `${pos.maxHeight}px`,
                    background: 'var(--surface)',
                    borderColor: 'var(--line)',
                    boxShadow: 'var(--shadow-lg)',
                }"
            >
                <li
                    v-for="(opt, i) in options"
                    :key="String(opt.value)"
                    role="option"
                    :aria-selected="opt.value === model"
                    :aria-disabled="opt.disabled || undefined"
                    class="flex items-center justify-between gap-2 rounded-[7px] px-2.5 py-[7px]"
                    :class="[text, opt.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer']"
                    :style="{
                        background: i === active && !opt.disabled ? 'var(--inset)' : 'transparent',
                        color: opt.value === model ? 'var(--accent-soft-ink)' : 'var(--ink)',
                        fontWeight: opt.value === model ? 600 : 400,
                    }"
                    @pointerenter="opt.disabled || (active = i)"
                    @click="choose(i)"
                >
                    <span class="truncate">{{ opt.label }}</span>
                    <Icon
                        v-if="opt.value === model"
                        name="check"
                        :size="14"
                        class="flex-none"
                        :style="{ color: 'var(--accent)' }"
                    />
                </li>
            </ul>
        </Teleport>
    </div>
</template>
