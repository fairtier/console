<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ColumnInfo } from '../../api'
import { useToast } from '../../composables/useToast'

const props = defineProps<{
    columns: ColumnInfo[]
    rows: unknown[][]
}>()

const { t } = useI18n()
const toast = useToast()

// Numeric-ish engine types get right-aligned cells. Matches Arrow type
// strings ("int64", "float64", "decimal(18, 2)") case-insensitively.
const NUMERIC_RE = /^(u?int|float|double|decimal)/i
function isNumeric(col: ColumnInfo): boolean {
    return NUMERIC_RE.test(col.type)
}

function cellText(value: unknown): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    return JSON.stringify(value)
}

async function copyCell(value: unknown) {
    if (value === null || value === undefined) return
    try {
        await navigator.clipboard.writeText(cellText(value))
        toast.success(t('sqlUi.results.copied'))
    } catch {
        // Clipboard unavailable (insecure context) — silently skip.
    }
}
</script>

<template>
    <div class="h-full min-h-0 overflow-auto">
        <table class="w-max min-w-full border-collapse text-[12.5px]" style="font-family: 'JetBrains Mono', monospace">
            <thead>
                <tr>
                    <th
                        class="sticky top-0 z-10 whitespace-nowrap border-b px-3 py-2 text-left align-bottom"
                        style="background: var(--surface-2); border-color: var(--line); width: 1%"
                    ></th>
                    <th
                        v-for="col in props.columns"
                        :key="col.name"
                        class="sticky top-0 z-10 whitespace-nowrap border-b px-3 py-2 align-bottom"
                        :class="isNumeric(col) ? 'text-right' : 'text-left'"
                        style="background: var(--surface-2); border-color: var(--line)"
                    >
                        <div class="font-bold" style="color: var(--ink)">{{ col.name }}</div>
                        <div class="text-[10.5px] font-medium lowercase" style="color: var(--ink-3)">{{ col.type }}</div>
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr
                    v-for="(row, ri) in props.rows"
                    :key="ri"
                    class="group"
                    :style="ri % 2 === 1 ? 'background: color-mix(in srgb, var(--inset) 45%, transparent)' : ''"
                >
                    <td
                        class="select-none whitespace-nowrap border-b px-3 py-[5px] text-right text-[11px]"
                        style="border-color: var(--line-2); color: var(--ink-3)"
                    >{{ ri + 1 }}</td>
                    <td
                        v-for="(value, ci) in row"
                        :key="ci"
                        class="max-w-[420px] cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap border-b px-3 py-[5px] hover:!bg-[var(--accent-soft)]"
                        :class="props.columns[ci] && isNumeric(props.columns[ci]) ? 'text-right' : 'text-left'"
                        style="border-color: var(--line-2); color: var(--ink)"
                        :title="cellText(value)"
                        @click="copyCell(value)"
                    >
                        <span v-if="value === null || value === undefined" class="italic" style="color: var(--ink-3)">{{
                            t('sqlUi.results.null')
                        }}</span>
                        <template v-else>{{ cellText(value) }}</template>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>
