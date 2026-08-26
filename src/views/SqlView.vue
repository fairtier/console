<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ConnectError, Code } from '@connectrpc/connect'
import Icon from '../components/ui/Icon.vue'
import Spinner from '../components/ui/Spinner.vue'
import SqlEditor from '../components/sql/SqlEditor.vue'
import ResultsGrid from '../components/sql/ResultsGrid.vue'
import CatalogTree from '../components/sql/CatalogTree.vue'
import ExplainPanel from '../components/ExplainPanel.vue'
import { useSqlEditorStore } from '../stores/sqlEditor'
import { useWorkspaceStore } from '../stores/workspace'
import { useToast } from '../composables/useToast'
import { useExplain } from '../composables/useExplain'
import { assistClient } from '../api'
import { formatSql } from '../lib/sqlFormat'
import { errorMessage } from '../api/errors'
import type { TableRef } from '../api'

const { t } = useI18n()
const router = useRouter()
const store = useSqlEditorStore()
const customerStore = useWorkspaceStore()
const toast = useToast()

// --- Formatting. Deterministic and client-side: the draft's layout is not
// something to spend a model round trip on, and the same button re-lays out
// SQL the user typed. The editor owns the transaction (undo, caret).
const editor = ref<InstanceType<typeof SqlEditor> | null>(null)

// --- Ask AI: NL → SQL draft. The draft only ever lands in the editor; the
// user runs it themselves (same review-first posture as every AI surface).
const aiOpen = ref(false)
const aiPrompt = ref('')
const aiNotes = ref('')
// The model's "cannot answer": the warehouse holds nothing relevant, so
// there is no draft — the notes say what's missing. Styles the notes as a
// warning and leaves the editor untouched.
const aiCannotAnswer = ref(false)
const drafting = ref(false)

async function askAi() {
    const prompt = aiPrompt.value.trim()
    if (!prompt || drafting.value) return
    drafting.value = true
    aiNotes.value = ''
    aiCannotAnswer.value = false
    try {
        const resp = await assistClient.draftSql({ prompt, currentSql: store.sql })
        // Branch on the explicit refusal code; `|| !resp.sql` only covers a
        // server predating the no_relevant_data field (workspace-api <0.26.0),
        // which signaled refusal with an empty sql.
        if (resp.noRelevantData || !resp.sql) {
            aiCannotAnswer.value = true
        } else {
            store.setSql(formatSql(resp.sql))
        }
        aiNotes.value = resp.notes
    } catch (err) {
        if (err instanceof ConnectError && err.code === Code.Unimplemented) {
            toast.info(t('sqlUi.ai.notConfigured'))
        } else if (err instanceof ConnectError && err.code === Code.ResourceExhausted) {
            toast.info(t('sqlUi.ai.rateLimited'))
        } else {
            toast.error(errorMessage(err, t('sqlUi.ai.draftFailed')))
        }
    } finally {
        drafting.value = false
    }
}

// --- Explain a failed query.
const { open: explainOpen, loading: explaining, result: explainResult, explain, close: closeExplain } = useExplain()

function explainSqlError() {
    void explain({ case: 'sql', value: { sql: store.sql, errorMessage: store.error } })
}

const engineOff = computed(() => customerStore.isReady && !customerStore.duckflightEnabled)

const ROW_LIMITS = [100, 500, 1000]

// Double-quote an identifier for the preview statement (embedded quotes are
// doubled). The user can type arbitrary SQL anyway — this is correctness for
// odd table names, not a security boundary.
function quoteIdent(name: string): string {
    return `"${name.split('"').join('""')}"`
}

function previewTable(table: TableRef) {
    const statement = `SELECT * FROM ${quoteIdent(table.namespace)}.${quoteIdent(table.name)} LIMIT 100`
    store.setSql(statement)
    void store.run(statement)
}
</script>

<template>
    <div class="mx-auto flex h-full min-h-0 max-w-[1280px] flex-col px-[34px] pb-[24px] pt-[34px]">
        <div class="mb-[18px] flex-none">
            <h1 class="m-0 mb-[5px] text-[25px] font-bold tracking-[-0.02em]">{{ t('sqlUi.heading') }}</h1>
            <div class="text-[13.5px]" style="color: var(--ink-2)">{{ t('sqlUi.subtitle') }}</div>
        </div>

        <!-- Engine disabled: point at Apps & BI instead of a dead editor. -->
        <div
            v-if="engineOff"
            class="flex flex-col items-center gap-3 rounded-[14px] border px-8 py-16 text-center"
            style="background: var(--surface); border-color: var(--line)"
        >
            <Icon name="code" :size="28" style="color: var(--ink-3)" />
            <div class="text-[16px] font-bold">{{ t('sqlUi.disabled.title') }}</div>
            <div class="max-w-[420px] text-[13.5px]" style="color: var(--ink-2)">{{ t('sqlUi.disabled.body') }}</div>
            <button
                class="mt-2 flex h-9 items-center gap-2 rounded-[10px] px-4 text-[13.5px] font-semibold"
                style="background: var(--accent); color: var(--accent-ink); box-shadow: var(--shadow)"
                @click="router.push({ name: 'apps' })"
            >
                {{ t('sqlUi.disabled.cta') }}
            </button>
        </div>

        <div
            v-else
            class="flex min-h-0 flex-1 overflow-hidden rounded-[14px] border"
            style="background: var(--surface); border-color: var(--line); box-shadow: var(--shadow)"
        >
            <!-- Catalog tree sidebar -->
            <aside class="w-[240px] flex-none border-r" style="border-color: var(--line); background: var(--surface)">
                <CatalogTree @preview="previewTable" />
            </aside>

            <!-- Editor + results -->
            <div class="flex min-w-0 flex-1 flex-col">
                <!-- Toolbar -->
                <div class="flex flex-none items-center gap-3 border-b px-3 py-2" style="border-color: var(--line)">
                    <button
                        class="flex h-8 items-center gap-2 rounded-[9px] px-3.5 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                        style="background: var(--accent); color: var(--accent-ink)"
                        :disabled="store.running || !store.sql.trim()"
                        :title="t('sqlUi.runHint')"
                        @click="store.run()"
                    >
                        <Spinner v-if="store.running" :size="13" />
                        <Icon v-else name="play" :size="13" />
                        {{ store.running ? t('sqlUi.running') : t('sqlUi.run') }}
                    </button>
                    <span class="text-[11.5px]" style="color: var(--ink-3)">{{ t('sqlUi.runHint') }}</span>
                    <button
                        class="flex h-8 items-center gap-1.5 rounded-[9px] border px-3 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                        style="background: var(--surface); border-color: var(--line); color: var(--ink-2)"
                        :disabled="!store.sql.trim()"
                        :title="t('sqlUi.formatHint')"
                        @click="editor?.formatDoc()"
                    >
                        <Icon name="alignLeft" :size="13" />
                        {{ t('sqlUi.format') }}
                    </button>
                    <button
                        class="flex h-8 items-center gap-1.5 rounded-[9px] border px-3 text-[12.5px] font-semibold"
                        :style="{
                            background: aiOpen ? 'var(--accent-soft)' : 'var(--surface)',
                            borderColor: 'var(--line)',
                            color: aiOpen ? 'var(--accent-soft-ink)' : 'var(--ink-2)',
                        }"
                        @click="aiOpen = !aiOpen"
                    >
                        <Icon name="sparkle" :size="13" />
                        {{ t('sqlUi.ai.button') }}
                    </button>
                    <div class="flex-1" />
                    <label class="flex items-center gap-2 text-[12px]" style="color: var(--ink-2)">
                        {{ t('sqlUi.rowLimit') }}
                        <select
                            v-model.number="store.maxRows"
                            class="h-7 rounded-[7px] border px-1.5 text-[12px]"
                            style="background: var(--surface); border-color: var(--line); color: var(--ink)"
                        >
                            <option v-for="n in ROW_LIMITS" :key="n" :value="n">{{ n }}</option>
                        </select>
                    </label>
                </div>

                <!-- Ask AI: prompt row, collapsed by default -->
                <div v-if="aiOpen" class="flex-none border-b px-3 py-2" style="border-color: var(--line); background: var(--inset)">
                    <div class="flex items-center gap-2">
                        <input
                            v-model="aiPrompt"
                            class="h-8 min-w-0 flex-1 rounded-[9px] border px-3 text-[12.5px]"
                            style="background: var(--surface); border-color: var(--line); color: var(--ink)"
                            :placeholder="t('sqlUi.ai.placeholder')"
                            :disabled="drafting"
                            @keydown.enter="askAi()"
                        />
                        <button
                            class="flex h-8 items-center gap-2 rounded-[9px] px-3.5 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                            style="background: var(--accent); color: var(--accent-ink)"
                            :disabled="drafting || !aiPrompt.trim()"
                            @click="askAi()"
                        >
                            <Spinner v-if="drafting" :size="13" />
                            <Icon v-else name="sparkle" :size="13" />
                            {{ drafting ? t('sqlUi.ai.drafting') : t('sqlUi.ai.draft') }}
                        </button>
                    </div>
                    <div
                        v-if="aiNotes"
                        class="mt-1.5 text-[12px] leading-relaxed"
                        :style="aiCannotAnswer
                            ? 'color: var(--warn-ink); background: var(--warn-soft); border: 1px solid var(--warn); border-radius: 9px; padding: 8px 10px;'
                            : 'color: var(--ink-2)'"
                    >
                        <span v-if="aiCannotAnswer" class="font-semibold">{{ t('sqlUi.ai.cannotAnswer') }} </span>{{ aiNotes }}
                    </div>
                </div>

                <!-- Editor -->
                <div class="h-[220px] flex-none border-b" style="border-color: var(--line)">
                    <SqlEditor
                        ref="editor"
                        :formatter="formatSql"
                        :model-value="store.sql"
                        :schema="store.autocompleteSchema"
                        :placeholder-text="t('sqlUi.editorPlaceholder')"
                        @update:model-value="store.setSql"
                        @run="store.run()"
                    />
                </div>

                <!-- Error panel: raw engine message, DuckDB errors are multi-line -->
                <div
                    v-if="store.error"
                    class="flex-none border-b px-4 py-3"
                    style="background: var(--err-soft); border-color: var(--line)"
                >
                    <div class="mb-1 flex items-center gap-2">
                        <div class="flex-1 text-[12px] font-bold" style="color: var(--err-ink)">{{ t('sqlUi.errors.title') }}</div>
                        <button
                            class="flex h-6 items-center gap-1.5 rounded-[7px] border px-2 text-[11.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                            style="background: var(--surface); border-color: var(--line); color: var(--ink-2)"
                            :disabled="explaining"
                            @click="explainSqlError()"
                        >
                            <Spinner v-if="explaining" :size="11" />
                            <Icon v-else name="sparkle" :size="11" />
                            {{ t('explainUi.button') }}
                        </button>
                    </div>
                    <pre
                        class="m-0 whitespace-pre-wrap text-[12px] leading-relaxed"
                        style="font-family: 'JetBrains Mono', monospace; color: var(--err-ink)"
                    >{{ store.error }}</pre>
                </div>

                <!-- Results -->
                <div class="min-h-0 flex-1">
                    <div
                        v-if="!store.hasRun"
                        class="flex h-full items-center justify-center text-[13px]"
                        style="color: var(--ink-3)"
                    >
                        {{ t('sqlUi.results.empty') }}
                    </div>
                    <div
                        v-else-if="!store.error && store.rows.length === 0"
                        class="flex h-full items-center justify-center text-[13px]"
                        style="color: var(--ink-3)"
                    >
                        {{ t('sqlUi.results.emptyResult') }}
                    </div>
                    <ResultsGrid v-else-if="!store.error" :columns="store.columns" :rows="store.rows" />
                </div>

                <!-- Status bar -->
                <div
                    v-if="store.hasRun && !store.error"
                    class="flex flex-none items-center gap-3 border-t px-4 py-1.5 text-[11.5px]"
                    style="border-color: var(--line); color: var(--ink-2)"
                >
                    <span>{{ t('sqlUi.status.rows', { count: store.rowCount }) }}</span>
                    <span>·</span>
                    <span>{{ t('sqlUi.status.duration', { ms: store.durationMs }) }}</span>
                    <span
                        v-if="store.truncated"
                        class="rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                        style="background: var(--warn-soft); color: var(--warn-ink)"
                    >{{ t('sqlUi.status.truncated', { count: store.rowCount }) }}</span>
                </div>
            </div>
        </div>

        <ExplainPanel :open="explainOpen" :result="explainResult" @close="closeExplain" />
    </div>
</template>
