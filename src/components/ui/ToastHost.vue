<script setup lang="ts">
import { useToast } from '../../composables/useToast'
import Icon from './Icon.vue'

const { toasts, dismiss } = useToast()

const KIND = {
    success: { bg: 'var(--ok-soft)', fg: 'var(--ok-ink)', border: 'var(--ok)', icon: 'check' },
    error: { bg: 'var(--err-soft)', fg: 'var(--err-ink)', border: 'var(--err)', icon: 'danger' },
    info: { bg: 'var(--info-soft)', fg: 'var(--info-ink)', border: 'var(--info)', icon: 'info' },
} as const
</script>

<template>
    <Teleport to="body">
        <div class="fixed bottom-5 right-5 z-[300] flex flex-col gap-2.5">
            <div
                v-for="toast in toasts"
                :key="toast.id"
                class="flex items-center gap-2.5 rounded-xl border px-4 py-3 text-[13px] font-semibold"
                style="box-shadow: var(--shadow-lg); animation: ftrise 0.16s ease; min-width: 260px; max-width: 380px"
                :style="{ background: KIND[toast.kind].bg, color: KIND[toast.kind].fg, borderColor: `color-mix(in srgb, ${KIND[toast.kind].border} 35%, transparent)` }"
            >
                <Icon :name="KIND[toast.kind].icon" :size="17" />
                <span class="flex-1">{{ toast.message }}</span>
                <button type="button" class="border-none bg-transparent opacity-70 hover:opacity-100" @click="dismiss(toast.id)">
                    <Icon name="x" :size="15" />
                </button>
            </div>
        </div>
    </Teleport>
</template>
