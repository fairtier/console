import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import { queryClient } from '../api'
import { errorMessage } from '../api/errors'
import type { ColumnInfo, TableRef, ColumnSchema } from '../api'

const DRAFT_KEY = 'ft_sql_draft'
const HISTORY_KEY = 'ft_sql_history'
const HISTORY_MAX = 50

export interface QueryHistoryEntry {
    sql: string
    at: number // epoch ms
    durationMs: number
    rowCount: number
    error?: string
}

function loadHistory(): QueryHistoryEntry[] {
    try {
        const raw = localStorage.getItem(HISTORY_KEY)
        if (!raw) return []
        const parsed: unknown = JSON.parse(raw)
        return Array.isArray(parsed) ? (parsed as QueryHistoryEntry[]) : []
    } catch {
        return []
    }
}

// SQL editor state: the draft statement (survives reloads), the last result,
// query history, and the catalog cache that feeds both the table tree and the
// editor's schema autocomplete.
export const useSqlEditorStore = defineStore('sqlEditor', () => {
    const sql = ref(localStorage.getItem(DRAFT_KEY) ?? '')
    const maxRows = ref(500)

    const running = ref(false)
    // Results can be 1000 rows wide — shallowRef, the grid replaces wholesale.
    const columns = shallowRef<ColumnInfo[]>([])
    const rows = shallowRef<unknown[][]>([])
    const rowCount = ref(0)
    const truncated = ref(false)
    const durationMs = ref(0)
    const error = ref('')
    const hasRun = ref(false)

    const history = ref<QueryHistoryEntry[]>(loadHistory())

    // Catalog cache (session lifetime).
    const tables = ref<TableRef[]>([])
    const tablesLoaded = ref(false)
    const tablesLoading = ref(false)
    const tablesError = ref('')
    const columnsByTable = ref<Record<string, ColumnSchema[]>>({})

    let draftTimer: ReturnType<typeof setTimeout> | undefined

    function setSql(value: string) {
        sql.value = value
        clearTimeout(draftTimer)
        draftTimer = setTimeout(() => localStorage.setItem(DRAFT_KEY, value), 400)
    }

    function pushHistory(entry: QueryHistoryEntry) {
        history.value = [entry, ...history.value].slice(0, HISTORY_MAX)
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value))
        } catch {
            // Quota exceeded — history is a convenience, drop silently.
        }
    }

    async function run(statement?: string) {
        const text = (statement ?? sql.value).trim()
        if (!text || running.value) return
        running.value = true
        error.value = ''
        const startedAt = Date.now()
        try {
            const resp = await queryClient.executeQuery({ sql: text, maxRows: maxRows.value })
            columns.value = resp.columns
            rows.value = resp.rows.map((r) => JSON.parse(r) as unknown[])
            rowCount.value = Number(resp.rowCount)
            truncated.value = resp.truncated
            durationMs.value = Number(resp.durationMs)
            pushHistory({
                sql: text,
                at: startedAt,
                durationMs: Number(resp.durationMs),
                rowCount: Number(resp.rowCount),
            })
        } catch (err) {
            columns.value = []
            rows.value = []
            rowCount.value = 0
            truncated.value = false
            error.value = errorMessage(err, 'Query failed')
            pushHistory({ sql: text, at: startedAt, durationMs: 0, rowCount: 0, error: error.value })
        } finally {
            running.value = false
            hasRun.value = true
        }
    }

    async function loadTables(force = false) {
        if (tablesLoading.value || (tablesLoaded.value && !force)) return
        tablesLoading.value = true
        tablesError.value = ''
        try {
            const resp = await queryClient.listTables({})
            tables.value = resp.tables
            tablesLoaded.value = true
            if (force) columnsByTable.value = {}
        } catch (err) {
            tablesError.value = errorMessage(err, 'Could not load tables')
        } finally {
            tablesLoading.value = false
        }
    }

    function tableKey(t: { namespace: string; name: string }): string {
        return `${t.namespace}.${t.name}`
    }

    async function describeTable(table: TableRef) {
        const key = tableKey(table)
        if (columnsByTable.value[key]) return
        try {
            const resp = await queryClient.describeTable({ namespace: table.namespace, name: table.name })
            columnsByTable.value = { ...columnsByTable.value, [key]: resp.columns }
        } catch {
            // Tree row falls back to no columns; retried on next expand.
        }
    }

    // lang-sql schema map: { "namespace.table": [column, ...] }. Tables appear
    // as soon as the list loads; columns enrich lazily as they're described.
    const autocompleteSchema = computed<Record<string, string[]>>(() => {
        const schema: Record<string, string[]> = {}
        for (const t of tables.value) {
            const key = tableKey(t)
            schema[key] = (columnsByTable.value[key] ?? []).map((c) => c.name)
        }
        return schema
    })

    return {
        sql,
        maxRows,
        running,
        columns,
        rows,
        rowCount,
        truncated,
        durationMs,
        error,
        hasRun,
        history,
        tables,
        tablesLoaded,
        tablesLoading,
        tablesError,
        columnsByTable,
        setSql,
        run,
        loadTables,
        describeTable,
        tableKey,
        autocompleteSchema,
    }
})
