<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useNotificationsStore } from '../stores/notifications'
import type { Notification } from '../api/gen/notification_pb.js'
import Icon from './ui/Icon.vue'

const { t } = useI18n()
const router = useRouter()
const store = useNotificationsStore()

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)

function toggle() {
    open.value = !open.value
    if (open.value) void store.ensureLoaded()
}

function onDocClick(e: MouseEvent) {
    if (open.value && rootEl.value && !rootEl.value.contains(e.target as Node)) {
        open.value = false
    }
}

onMounted(() => {
    void store.ensureLoaded()
    void store.startStream()
    document.addEventListener('click', onDocClick)
})
onBeforeUnmount(() => {
    store.stopStream()
    document.removeEventListener('click', onDocClick)
})

function onItemClick(n: Notification) {
    void store.markRead(n.id)
    if (n.link) {
        // Links are either a path ("/pipelines?pipeline=<id>", may carry a
        // deep-link query) or a bare route name ("transformations"). Keep both
        // working so older name-only notifications still navigate.
        if (n.link.startsWith('/')) router.push(n.link).catch(() => {})
        else router.push({ name: n.link }).catch(() => {})
        open.value = false
    }
}

// Compact relative time ("5m", "2h", "3d") from an RFC 3339 string.
function relativeTime(iso: string): string {
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return ''
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
    if (secs < 60) return `${secs}s`
    const mins = Math.floor(secs / 60)
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
}
</script>

<template>
    <div ref="rootEl" class="relative">
        <button
            type="button"
            class="relative flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border text-ink-2 hover:border-accent hover:text-accent"
            style="background: var(--surface-2); border-color: var(--line)"
            :title="t('notifications.title')"
            :aria-label="t('notifications.title')"
            @click.stop="toggle"
        >
            <Icon name="bell" :size="18" />
            <span
                v-if="store.hasUnread"
                class="absolute -right-1 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                style="background: var(--err, #d6453d)"
            >{{ store.unreadCount > 9 ? '9+' : store.unreadCount }}</span>
        </button>

        <div
            v-if="open"
            class="absolute right-0 z-30 mt-2 w-[340px] overflow-hidden rounded-[14px] border bg-surface"
            style="border-color: var(--line); box-shadow: var(--shadow-lg)"
            @click.stop
        >
            <div class="flex items-center justify-between border-b px-4 py-3" style="border-color: var(--line)">
                <span class="text-[14px] font-bold tracking-[-0.01em]">{{ t('notifications.title') }}</span>
                <button
                    v-if="store.hasUnread"
                    type="button"
                    class="border-none bg-transparent text-[12px] font-semibold text-accent"
                    style="cursor: pointer"
                    @click="store.markAllRead()"
                >{{ t('notifications.markAllRead') }}</button>
            </div>

            <div class="max-h-[60vh] overflow-y-auto">
                <p
                    v-if="store.items.length === 0"
                    class="m-0 px-4 py-8 text-center text-[13px] text-ink-3"
                >{{ t('notifications.empty') }}</p>

                <button
                    v-for="n in store.items"
                    :key="n.id"
                    type="button"
                    class="flex w-full items-start gap-3 border-none border-b px-4 py-3 text-left last:border-b-0"
                    :style="{
                        background: n.read ? 'transparent' : 'var(--accent-soft, var(--surface-2))',
                        borderColor: 'var(--line)',
                        cursor: 'pointer',
                    }"
                    @click="onItemClick(n)"
                >
                    <span
                        class="mt-1.5 h-2 w-2 flex-none rounded-full"
                        :style="{ background: n.read ? 'transparent' : 'var(--accent)' }"
                    />
                    <span class="min-w-0 flex-1">
                        <span class="block text-[13px] font-semibold leading-snug">{{ n.title }}</span>
                        <span
                            v-if="n.body"
                            :title="n.body"
                            class="mt-0.5 block max-h-[7.5rem] overflow-y-auto whitespace-pre-line text-[12px] text-ink-2"
                        >{{ n.body }}</span>
                    </span>
                    <span class="flex-none text-[11px] text-ink-3">{{ relativeTime(n.createdAt) }}</span>
                </button>
            </div>
        </div>
    </div>
</template>
