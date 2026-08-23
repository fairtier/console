<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '../composables/useAuth'
import { useWorkspaceStore } from '../stores/workspace'
import { useSettingsStore } from '../stores/settings'
import { useCommandPalette } from '../composables/useCommandPalette'
import { runtimeConfig } from '../config/runtime'
import { availableLocales, type LocaleCode } from '../i18n'
import SidebarNav from './SidebarNav.vue'
import CommandPalette from '../components/CommandPalette.vue'
import NotificationBell from '../components/NotificationBell.vue'
import Icon from '../components/ui/Icon.vue'
import Segmented from '../components/ui/Segmented.vue'

const { t } = useI18n()
const { user, logout } = useAuth()
const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()

const { openPalette, toggle: togglePalette } = useCommandPalette()

// Global Cmd/Ctrl+K opens the command palette (D6 global search).
function onGlobalKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        togglePalette()
    }
}
onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))

const sidebarOpen = ref(false)
const userMenu = ref(false)

const workspaceName = computed(() => workspaceStore.name || t('shell.noWorkspace'))
const workspaceSlug = computed(() => workspaceStore.slug || '—')
const workspaceInitial = computed(() => (workspaceStore.name || 'F').charAt(0).toUpperCase())

// "Account & Billing" lives with whoever hosts this workspace, when they told
// us where that is. Self-hosters have no such place and no link renders.
const accountUrl = computed(() => runtimeConfig().accountUrl)

const displayName = computed(() => user.value?.displayName || user.value?.name || '')
const email = computed(() => user.value?.email || '')
const userInitials = computed(() => {
    const n = displayName.value.trim()
    if (!n) return 'U'
    const parts = n.split(/\s+/)
    return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
})

onMounted(() => {
    // The workspace describes itself (slug, capabilities) via its API's
    // bootstrap document; every store consumer waits on the same load.
    void workspaceStore.ensureLoaded()
})

// The header button stays a one-click light/dark flip; the menu below is where
// "system" and the language live — every view is translated, there was simply
// nowhere to choose the language.
function toggleTheme() {
    const next = settingsStore.effectiveTheme === 'dark' ? 'light' : 'dark'
    settingsStore.updateTheme(next)
}

const languageOptions = availableLocales.map((l) => ({ value: l.code, label: l.nativeName }))

const themeOptions = computed(() => [
    { value: 'light' as const, label: t('shell.themeLight') },
    { value: 'dark' as const, label: t('shell.themeDark') },
    { value: 'system' as const, label: t('shell.themeSystem') },
])

const language = computed<LocaleCode>({
    get: () => settingsStore.locale,
    set: (val) => settingsStore.updateLocale(val),
})

const themeChoice = computed<'light' | 'dark' | 'system'>({
    get: () => settingsStore.theme,
    set: (val) => settingsStore.updateTheme(val),
})

function closeSidebar() {
    sidebarOpen.value = false
}

function closeMenus() {
    userMenu.value = false
}
</script>

<template>
    <div
        class="flex min-h-screen"
        style="background: var(--bg); color: var(--ink)"
        @click="closeMenus"
    >
        <!-- Mobile backdrop -->
        <div
            v-if="sidebarOpen"
            class="fixed inset-0 z-40 bg-black/40 md:hidden"
            @click="closeSidebar"
        />

        <!-- ============ SIDEBAR ============ -->
        <aside
            class="fixed inset-y-0 left-0 z-50 flex w-[248px] flex-none flex-col border-r transition-transform duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0"
            :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
            style="background: var(--surface); border-color: var(--line)"
        >
            <!-- brand -->
            <div class="flex items-center gap-2.5 px-[18px] pb-[18px] pt-5">
                <div
                    class="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px]"
                    style="background: var(--accent)"
                >
                    <Icon name="logo" :size="17" style="color: var(--accent-ink)" />
                </div>
                <div class="text-[16px] font-bold tracking-[-0.02em]">{{ t('common.appName') }}</div>
            </div>

            <!-- current workspace -->
            <div class="mx-3 mb-3.5">
                <div
                    class="flex w-full items-center gap-2.5 rounded-[11px] border p-2.5 text-left"
                    style="background: var(--surface-2); border-color: var(--line)"
                >
                    <div
                        class="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[7px] text-xs font-bold"
                        style="background: var(--accent-soft); color: var(--accent-soft-ink)"
                    >{{ workspaceInitial }}</div>
                    <div class="min-w-0 flex-1">
                        <div class="truncate text-[13px] font-semibold text-ink">{{ workspaceName }}</div>
                        <div class="font-mono text-[11px] text-ink-3">{{ workspaceSlug }}</div>
                    </div>
                </div>
            </div>

            <SidebarNav @navigate="closeSidebar" />

            <!-- user menu -->
            <div class="border-t p-3" style="border-color: var(--line)">
                <div class="relative" @click.stop>
                    <button
                        type="button"
                        class="flex w-full items-center gap-[11px] rounded-[9px] p-2.5 text-left text-[13px] font-semibold text-ink-2 hover:bg-surface-2"
                        :style="{ background: userMenu ? 'var(--surface-2)' : 'transparent' }"
                        @click="userMenu = !userMenu"
                    >
                        <div
                            class="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-[11px] font-bold uppercase"
                            style="background: var(--clay-soft); color: var(--clay-soft-ink)"
                        >{{ userInitials }}</div>
                        <div class="min-w-0 flex-1"><div class="truncate">{{ displayName }}</div></div>
                        <Icon name="dots" :size="15" class="flex-none text-ink-3" />
                    </button>
                    <div
                        v-if="userMenu"
                        class="absolute bottom-[46px] left-0 right-0 z-[60] rounded-xl border p-[5px]"
                        style="background: var(--surface); border-color: var(--line); box-shadow: var(--shadow-lg); animation: ftrise 0.14s ease"
                    >
                        <div class="px-[11px] pb-[7px] pt-[9px]">
                            <div class="text-[13px] font-bold">{{ displayName }}</div>
                            <div class="text-[11.5px] text-ink-3">{{ email }}</div>
                        </div>
                        <div class="mx-1.5 mb-[5px] mt-0.5 h-px" style="background: var(--line-2)" />

                        <!-- display preferences: shared with the account
                             Console through the ft_prefs cookie -->
                        <div class="px-2.5 pb-1.5 pt-1">
                            <div class="mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
                                {{ t('shell.language') }}
                            </div>
                            <Segmented v-model="language" :options="languageOptions" block />
                            <div class="mb-1.5 mt-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-3">
                                {{ t('shell.theme') }}
                            </div>
                            <Segmented v-model="themeChoice" :options="themeOptions" block />
                        </div>
                        <div class="mx-1.5 my-[5px] h-px" style="background: var(--line-2)" />

                        <!--
                            Same tab, deliberately: the account pages are a
                            section of one product and the SSO hops make the
                            crossing read as a slow route change. Ctrl-click
                            still opens a new tab, hence rel="noopener".
                        -->
                        <a
                            v-if="accountUrl"
                            :href="accountUrl"
                            rel="noopener"
                            class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-ink hover:bg-surface-2"
                            @click="userMenu = false; closeSidebar()"
                        >
                            <Icon name="billing" :size="15" class="text-ink-3" />{{ t('nav.accountExternal') }}
                            <Icon name="launch" :size="13" class="ml-auto text-ink-3" />
                        </a>
                        <div v-if="accountUrl" class="mx-1.5 my-[5px] h-px" style="background: var(--line-2)" />
                        <button
                            type="button"
                            class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold hover:bg-[var(--err-soft)]"
                            style="color: var(--err)"
                            @click="logout"
                        >
                            <Icon name="signout" :size="15" />{{ t('auth.signOut') }}
                        </button>
                    </div>
                </div>
            </div>
        </aside>

        <!-- ============ MAIN ============ -->
        <div class="flex min-w-0 flex-1 flex-col">
            <!-- top bar -->
            <header
                class="sticky top-0 z-20 flex h-[60px] flex-none items-center gap-3.5 border-b px-[26px]"
                style="border-color: var(--line); background: color-mix(in srgb, var(--surface) 75%, transparent); backdrop-filter: blur(8px)"
            >
                <button
                    type="button"
                    class="-ml-1 p-1.5 text-ink-3 hover:text-ink md:hidden"
                    :aria-label="t('layout.toggleSidebar')"
                    @click="sidebarOpen = !sidebarOpen"
                >
                    <Icon name="overview" :size="20" />
                </button>

                <button
                    type="button"
                    class="relative hidden max-w-[420px] flex-1 items-center rounded-[10px] border pl-9 pr-2 text-left text-[13.5px] text-ink-3 hover:border-accent sm:flex h-[38px]"
                    style="background: var(--surface-2); border-color: var(--line)"
                    :aria-label="t('shell.searchPlaceholder')"
                    @click="openPalette"
                >
                    <Icon name="search" :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
                    <span class="flex-1 truncate">{{ t('shell.searchPlaceholder') }}</span>
                    <kbd
                        class="ml-2 hidden flex-none rounded-[6px] border px-1.5 py-0.5 text-[11px] font-semibold text-ink-3 md:inline"
                        style="border-color: var(--line); background: var(--surface)"
                    >⌘K</kbd>
                </button>

                <div class="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        class="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border text-ink-2 hover:border-accent hover:text-accent"
                        style="background: var(--surface-2); border-color: var(--line)"
                        :title="t('shell.toggleTheme')"
                        @click="toggleTheme"
                    >
                        <Icon name="moon" :size="18" />
                    </button>
                    <NotificationBell />
                    <RouterLink
                        :to="{ name: 'pipeline-new' }"
                        class="flex h-[38px] items-center gap-[7px] rounded-[10px] px-[15px] text-[13.5px] font-semibold hover:brightness-105"
                        style="background: var(--accent); color: var(--accent-ink); box-shadow: var(--shadow)"
                    >
                        <Icon name="plus" :size="16" />
                        <span class="hidden sm:inline">{{ t('shell.newPipeline') }}</span>
                    </RouterLink>
                </div>
            </header>

            <!-- scroll region -->
            <main class="flex-1 overflow-y-auto">
                <RouterView />
            </main>
        </div>

        <!-- Global search / command palette (Cmd/Ctrl+K) -->
        <CommandPalette />
    </div>
</template>
