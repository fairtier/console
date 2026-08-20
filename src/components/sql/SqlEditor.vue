<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { EditorState, Compartment, Prec } from '@codemirror/state'
import { EditorView, keymap, placeholder, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { autocompletion, completionKeymap, closeBrackets } from '@codemirror/autocomplete'
import { bracketMatching, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { sql, PostgreSQL } from '@codemirror/lang-sql'
import { tags } from '@lezer/highlight'

const props = defineProps<{
    modelValue: string
    // lang-sql schema map for table/column autocomplete: { "ns.table": [col] }
    schema: Record<string, string[]>
    placeholderText?: string
}>()

const emit = defineEmits<{
    'update:modelValue': [value: string]
    run: []
}>()

const host = ref<HTMLElement | null>(null)
let view: EditorView | null = null
const langCompartment = new Compartment()

// One var-based theme covers light and dark: the CSS custom properties flip
// with the `data-ft-theme` attribute, CodeMirror just references them.
const theme = EditorView.theme({
    '&': {
        fontSize: '13px',
        height: '100%',
        backgroundColor: 'var(--surface)',
        color: 'var(--ink)',
    },
    '.cm-content': {
        fontFamily: "'JetBrains Mono', monospace",
        caretColor: 'var(--accent)',
        padding: '10px 0',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
    '&.cm-focused': { outline: 'none' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, ::selection': {
        backgroundColor: 'var(--accent-soft)',
    },
    '.cm-selectionBackground': { backgroundColor: 'var(--accent-soft)' },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '&.cm-focused .cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 4%, transparent)' },
    '.cm-gutters': {
        backgroundColor: 'var(--surface)',
        color: 'var(--ink-3)',
        border: 'none',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '11.5px',
    },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink-2)' },
    '.cm-placeholder': { color: 'var(--ink-3)', fontStyle: 'italic' },
    '.cm-tooltip': {
        backgroundColor: 'var(--surface-2)',
        color: 'var(--ink)',
        border: '1px solid var(--line)',
        borderRadius: '9px',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'var(--accent-soft)',
        color: 'var(--accent-soft-ink)',
    },
    '.cm-matchingBracket': { backgroundColor: 'var(--accent-soft)', outline: 'none' },
})

const highlight = HighlightStyle.define([
    { tag: tags.keyword, color: 'var(--accent)', fontWeight: '600' },
    { tag: tags.string, color: 'var(--ok)' },
    { tag: [tags.number, tags.bool, tags.null], color: 'var(--warn)' },
    { tag: tags.comment, color: 'var(--ink-3)', fontStyle: 'italic' },
    { tag: tags.operator, color: 'var(--ink-2)' },
    { tag: [tags.typeName, tags.className], color: 'var(--info)' },
])

function sqlExtension() {
    // PostgreSQL is the closest lang-sql dialect to DuckDB's syntax.
    return sql({ dialect: PostgreSQL, schema: props.schema, upperCaseKeywords: true })
}

onMounted(() => {
    view = new EditorView({
        parent: host.value!,
        state: EditorState.create({
            doc: props.modelValue,
            extensions: [
                lineNumbers(),
                highlightActiveLine(),
                history(),
                closeBrackets(),
                bracketMatching(),
                autocompletion(),
                langCompartment.of(sqlExtension()),
                theme,
                syntaxHighlighting(highlight),
                placeholder(props.placeholderText ?? ''),
                // Highest precedence so Mod-Enter beats the default newline.
                Prec.highest(keymap.of([
                    { key: 'Mod-Enter', run: () => (emit('run'), true) },
                ])),
                keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap]),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        emit('update:modelValue', update.state.doc.toString())
                    }
                }),
            ],
        }),
    })
})

onBeforeUnmount(() => {
    view?.destroy()
    view = null
})

// External writes (click-to-preview inserts a statement) sync into the editor;
// self-originated updates are already equal and skipped.
watch(
    () => props.modelValue,
    (value) => {
        if (view && value !== view.state.doc.toString()) {
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
        }
    },
)

// Autocomplete schema grows as the catalog loads — swap the language config.
watch(
    () => props.schema,
    () => {
        view?.dispatch({ effects: langCompartment.reconfigure(sqlExtension()) })
    },
)

function focus() {
    view?.focus()
}

defineExpose({ focus })
</script>

<template>
    <!-- data-testid: CodeMirror mounts a contenteditable with no accessible
         role or name, so there is nothing role-based for a test to hold on to. -->
    <div ref="host" data-testid="sql-editor" class="h-full min-h-0 overflow-hidden [&>.cm-editor]:h-full" />
</template>
