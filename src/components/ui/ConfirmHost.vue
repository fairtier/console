<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useConfirm } from '../../composables/useConfirm'
import Icon from './Icon.vue'

const { t } = useI18n()
const { open, current, resolveWith } = useConfirm()
</script>

<template>
    <Teleport to="body">
        <div
            v-if="open && current"
            class="fixed inset-0 z-[200] flex items-center justify-center p-6"
            style="background: rgba(20, 18, 12, 0.42); animation: ftrise 0.14s ease"
            @click.self="resolveWith(false)"
        >
            <div
                class="w-full max-w-[420px] rounded-[18px] border bg-surface p-6 text-ink"
                style="border-color: var(--line); box-shadow: var(--shadow-lg)"
            >
                <div class="flex items-start gap-3.5">
                    <div
                        class="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-xl"
                        :style="{
                            background: current.danger ? 'var(--err-soft)' : 'var(--accent-soft)',
                            color: current.danger ? 'var(--err)' : 'var(--accent)',
                        }"
                    >
                        <Icon :name="current.danger ? 'danger' : 'info'" :size="21" />
                    </div>
                    <div class="flex-1">
                        <h2 class="m-0 mb-1.5 text-[17px] font-bold tracking-[-0.01em]">{{ current.title }}</h2>
                        <p class="m-0 text-[13.5px] leading-[1.55] text-ink-2">{{ current.body }}</p>
                    </div>
                </div>
                <div class="mt-[22px] flex justify-end gap-2.5">
                    <button
                        type="button"
                        class="h-10 rounded-[10px] border bg-transparent px-4 text-[13.5px] font-semibold text-ink-2 hover:border-ink-3"
                        style="border-color: var(--line)"
                        @click="resolveWith(false)"
                    >
                        {{ t('common.cancel') }}
                    </button>
                    <button
                        type="button"
                        class="h-10 rounded-[10px] border-none px-[18px] text-[13.5px] font-bold text-white hover:brightness-105"
                        :style="{ background: current.danger ? 'var(--err)' : 'var(--accent)' }"
                        @click="resolveWith(true)"
                    >
                        {{ current.confirmLabel }}
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>
