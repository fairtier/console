import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { notificationClient } from '../api'
import type { Notification } from '../api/gen/notification_pb.js'

// Notifications store backs the top-bar bell (D5). The unary list/unread RPCs
// power the initial load + history; StreamNotifications pushes new ones live.
export const useNotificationsStore = defineStore('notifications', () => {
    const items = ref<Notification[]>([])
    const unreadCount = ref(0)
    const loaded = ref(false)

    let streamAbort: AbortController | null = null

    const hasUnread = computed(() => unreadCount.value > 0)

    async function load() {
        const resp = await notificationClient.listNotifications({})
        items.value = resp.notifications
        unreadCount.value = resp.unreadCount
        loaded.value = true
    }

    async function ensureLoaded() {
        if (loaded.value) return
        try {
            await load()
        } catch {
            // Silent: the bell degrades to empty if the list can't be fetched.
        }
    }

    async function markRead(id: string) {
        const n = items.value.find((x) => x.id === id)
        if (!n || n.read) return
        // Optimistic: flip locally, then persist.
        n.read = true
        unreadCount.value = Math.max(0, unreadCount.value - 1)
        try {
            await notificationClient.markRead({ id })
        } catch {
            n.read = false
            unreadCount.value += 1
        }
    }

    async function markAllRead() {
        const prev = items.value.map((n) => n.read)
        const prevCount = unreadCount.value
        items.value.forEach((n) => (n.read = true))
        unreadCount.value = 0
        try {
            await notificationClient.markAllRead({})
        } catch {
            items.value.forEach((n, i) => (n.read = prev[i] ?? n.read))
            unreadCount.value = prevCount
        }
    }

    // Live push: consume StreamNotifications, prepending new items. Reconnects
    // are not handled here — ensureLoaded()/load() backfills anything missed.
    async function startStream() {
        if (streamAbort) return
        streamAbort = new AbortController()
        try {
            for await (const n of notificationClient.streamNotifications({}, { signal: streamAbort.signal })) {
                // Keep-alive frames only exist to keep bytes flowing past the
                // Envoy/Cloudflare idle timeout; they carry no notification.
                if (n.heartbeat) continue
                if (!items.value.some((x) => x.id === n.id)) {
                    items.value.unshift(n)
                    if (!n.read) unreadCount.value += 1
                }
            }
        } catch {
            // Stream ended or aborted; the bell still works via the unary RPCs.
        } finally {
            streamAbort = null
        }
    }

    function stopStream() {
        streamAbort?.abort()
        streamAbort = null
    }

    return {
        items,
        unreadCount,
        loaded,
        hasUnread,
        load,
        ensureLoaded,
        markRead,
        markAllRead,
        startStream,
        stopStream,
    }
})
