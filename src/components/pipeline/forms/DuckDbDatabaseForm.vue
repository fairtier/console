<script setup lang="ts">
// The guided form for a database read through a DuckDB extension: MySQL and
// SQL Server. Multi-root on purpose, like the other forms — its fields are
// direct children of SourceCard's grid.
//
// What it can represent is what the variant's `isGuidable` accepts
// (src/lib/pipelineSources/duckDbDatabase.ts), which is exactly the ATTACH
// template that module generates. A hand-written template carrying an
// ssl_mode, a socket, or a second placeholder opens in the JSON editor
// instead — the two are one decision, so change them together.
//
// The password is not here: it is a credential and lives in CredentialsCard,
// which the same module declares it to. Everything on this card is plaintext
// in the customer's own box repo, and that is the deliberate half of the
// trade-off documented in duckDbDatabase.ts.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { sourceForKey, type DuckTable, type PipelineForm } from '../../../lib/pipelineSources'
import Icon from '../../ui/Icon.vue'

const props = defineProps<{
    form: PipelineForm
    fieldErrors: Record<string, string>
}>()

const { t } = useI18n()

const source = computed(() => sourceForKey(props.form.sourceKey))
const portPlaceholder = computed(() => source.value.database?.defaultPort ?? '')

// Which table rows have their detail open. Closed by default: the default
// (SELECT * FROM the table of the same name, full load) is right most of the
// time, and a row of five controls per table would bury that.
const expanded = ref<Set<number>>(new Set())
function toggle(i: number) {
    const next = new Set(expanded.value)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    expanded.value = next
}

const tableDraft = ref('')

function addTable() {
    const name = tableDraft.value.trim()
    if (name && !props.form.tables.some((tb) => tb.name === name)) {
        props.form.tables.push({ name, query: '', cursorColumn: '', primaryKey: '' })
    }
    tableDraft.value = ''
}

function removeTable(i: number) {
    props.form.tables.splice(i, 1)
    expanded.value = new Set()
}

// The summary line under a collapsed row, so what is configured is visible
// without opening it.
function summary(tb: DuckTable): string {
    const parts: string[] = []
    parts.push(
        tb.cursorColumn.trim()
            ? t('pipelinesUi.wizard.configure.duckdb.incrementalBy', { column: tb.cursorColumn.trim() })
            : t('pipelinesUi.wizard.configure.duckdb.fullLoad'),
    )
    if (tb.primaryKey.trim()) parts.push(t('pipelinesUi.wizard.configure.duckdb.keyIs', { key: tb.primaryKey.trim() }))
    if (tb.query.trim()) parts.push(t('pipelinesUi.wizard.configure.duckdb.customQuery'))
    return parts.join(' · ')
}
</script>

<template>
    <div class="col-span-full">
        <div class="flex gap-[14px]">
            <div class="flex-1">
                <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
                    {{ t('pipelinesUi.wizard.configure.duckdb.host') }}
                </label>
                <input
                    v-model="form.dbHost"
                    :placeholder="t('pipelinesUi.wizard.configure.duckdb.hostPlaceholder')"
                    class="h-10 w-full rounded-[10px] border px-[13px] font-mono text-[13px] outline-none"
                    style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                />
            </div>
            <div class="w-[110px]">
                <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
                    {{ t('pipelinesUi.wizard.configure.duckdb.port') }}
                </label>
                <input
                    v-model="form.dbPort"
                    :placeholder="portPlaceholder"
                    class="h-10 w-full rounded-[10px] border px-[13px] font-mono text-[13px] outline-none"
                    style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                />
            </div>
        </div>
        <!-- A server rejection of the generated template has no single field of
             its own; it belongs under the group the template is built from. -->
        <p v-if="fieldErrors.attach" class="mt-1.5 text-xs" style="color: var(--err)">{{ fieldErrors.attach }}</p>
    </div>

    <div>
        <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
            {{ t('pipelinesUi.wizard.configure.duckdb.database') }}
        </label>
        <input
            v-model="form.dbDatabase"
            :placeholder="t('pipelinesUi.wizard.configure.duckdb.databasePlaceholder')"
            class="h-10 w-full rounded-[10px] border px-[13px] font-mono text-[13px] outline-none"
            style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
        />
    </div>

    <div>
        <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
            {{ t('pipelinesUi.wizard.configure.duckdb.user') }}
        </label>
        <input
            v-model="form.dbUser"
            :placeholder="t('pipelinesUi.wizard.configure.duckdb.userPlaceholder')"
            class="h-10 w-full rounded-[10px] border px-[13px] font-mono text-[13px] outline-none"
            style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
        />
    </div>

    <div class="col-span-full">
        <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
            {{ t('pipelinesUi.wizard.configure.duckdb.tables') }}
        </label>

        <div
            v-if="form.tables.length"
            class="mb-2 overflow-hidden rounded-[10px] border"
            style="border-color: var(--line)"
        >
            <div
                v-for="(tb, i) in form.tables"
                :key="i"
                class="border-b px-[13px] py-[9px] last:border-b-0"
                style="border-color: var(--line)"
            >
                <div class="flex items-center gap-2">
                    <input
                        v-model="tb.name"
                        class="h-8 min-w-0 flex-1 rounded-[8px] border px-2.5 font-mono text-[13px] outline-none"
                        style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                    />
                    <span class="truncate text-[11.5px]" style="color: var(--ink-3)">{{ summary(tb) }}</span>
                    <button
                        type="button"
                        class="flex cursor-pointer items-center rounded-[7px] border bg-transparent px-2 py-1"
                        style="border-color: var(--line); color: var(--ink-3)"
                        :aria-label="t('pipelinesUi.wizard.configure.duckdb.tableDetail')"
                        @click="toggle(i)"
                    >
                        <Icon :name="expanded.has(i) ? 'chevronDown' : 'dots'" :size="14" />
                    </button>
                    <button
                        type="button"
                        class="flex cursor-pointer items-center border-none bg-transparent p-1 opacity-60"
                        style="color: var(--ink-3)"
                        :aria-label="t('common.delete')"
                        @click="removeTable(i)"
                    >
                        <Icon name="x" :size="14" />
                    </button>
                </div>

                <!-- The detail: everything whose default is right most of the
                     time, and wrong often enough to need a control. -->
                <div v-if="expanded.has(i)" class="mt-2.5 grid grid-cols-2 gap-[10px]">
                    <div class="col-span-full">
                        <label class="mb-1 block text-[11.5px] font-semibold" style="color: var(--ink-2)">
                            {{ t('pipelinesUi.wizard.configure.duckdb.query') }}
                        </label>
                        <input
                            v-model="tb.query"
                            :placeholder="`SELECT * FROM src.&quot;${tb.name}&quot;`"
                            class="h-9 w-full rounded-[8px] border px-2.5 font-mono text-[12.5px] outline-none"
                            style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                        />
                    </div>
                    <div>
                        <label class="mb-1 block text-[11.5px] font-semibold" style="color: var(--ink-2)">
                            {{ t('pipelinesUi.wizard.configure.duckdb.cursorColumn') }}
                        </label>
                        <input
                            v-model="tb.cursorColumn"
                            :placeholder="t('pipelinesUi.wizard.configure.duckdb.cursorPlaceholder')"
                            class="h-9 w-full rounded-[8px] border px-2.5 font-mono text-[12.5px] outline-none"
                            style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                        />
                    </div>
                    <div>
                        <label class="mb-1 block text-[11.5px] font-semibold" style="color: var(--ink-2)">
                            {{ t('pipelinesUi.wizard.configure.duckdb.primaryKey') }}
                        </label>
                        <input
                            v-model="tb.primaryKey"
                            :placeholder="t('pipelinesUi.wizard.configure.duckdb.primaryKeyPlaceholder')"
                            class="h-9 w-full rounded-[8px] border px-2.5 font-mono text-[12.5px] outline-none"
                            style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                        />
                    </div>
                </div>
            </div>
        </div>

        <div class="flex items-center gap-2">
            <input
                v-model="tableDraft"
                :placeholder="t('pipelinesUi.wizard.configure.duckdb.tablePlaceholder')"
                class="h-9 w-[180px] rounded-[9px] border px-[11px] font-mono text-[13px] outline-none"
                style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                @keydown.enter.prevent="addTable"
            />
            <button
                type="button"
                class="cursor-pointer rounded-[9px] border border-dashed bg-transparent px-[11px] py-[7px] font-sans text-[13px]"
                style="border-color: var(--line); color: var(--ink-3)"
                @click="addTable"
            >
                + {{ t('pipelinesUi.wizard.configure.duckdb.addTable') }}
            </button>
        </div>
        <p v-if="fieldErrors.tables" class="mt-1.5 text-xs" style="color: var(--err)">{{ fieldErrors.tables }}</p>
    </div>
</template>
