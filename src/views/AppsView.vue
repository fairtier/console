<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../stores/workspace'
import { useToast } from '../composables/useToast'
import { snapshotClient } from '../api'
import type { Snapshot } from '../api/gen/snapshot_pb.js'
import StatusChip from '../components/ui/StatusChip.vue'
import Icon from '../components/ui/Icon.vue'

const { t } = useI18n()
const workspace = useWorkspaceStore()
const toast = useToast()

type AppKey = 'cube' | 'rill' | 'duckflight'
type AppStatus = 'active' | 'off'

onMounted(() => {
  void workspace.ensureLoaded()
})

// Per-app launch URL (DuckFlight has no web UI). Endpoints the workspace's
// self-description does not carry stay blank, and the card simply offers no
// launch button.
function urlFor(key: AppKey): string {
  const d = workspace.connectionDetails
  if (!d) return ''
  switch (key) {
    case 'cube': return d.cubeUrl
    case 'rill': return d.rillUrl
    case 'duckflight': return d.duckflightUrl
  }
}

function enabledFor(key: AppKey): boolean {
  switch (key) {
    case 'cube': return workspace.cubeEnabled
    case 'rill': return workspace.rillEnabled
    case 'duckflight': return workspace.duckflightEnabled
  }
}

// The workspace has no provisioning limbo: an app either runs here or it
// does not. Turning one on or off is a deployment change, made by whoever
// operates the workspace — not from this page.
function statusFor(key: AppKey): AppStatus {
  return enabledFor(key) ? 'active' : 'off'
}

interface AppDef {
  key: AppKey
  mono: string
  tintBg: string
  tintFg: string
  canSnapshot: boolean // Cube & Rill support snapshots
  hasLaunch: boolean    // DuckFlight has no web UI
}

const APPS: AppDef[] = [
  { key: 'cube', mono: 'Cu', tintBg: 'var(--accent-soft)', tintFg: 'var(--accent-soft-ink)', canSnapshot: true, hasLaunch: true },
  { key: 'rill', mono: 'Ri', tintBg: 'var(--clay-soft)', tintFg: 'var(--clay)', canSnapshot: true, hasLaunch: true },
  { key: 'duckflight', mono: 'DF', tintBg: 'var(--ok-soft)', tintFg: 'var(--ok-ink)', canSnapshot: false, hasLaunch: false },
]

function launch(key: AppKey) {
  const url = urlFor(key)
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

// ── Snapshots (Cube & Rill) ───────────────────────────────────────────────
const savingKey = ref<AppKey | null>(null)

// History: lazily loaded per app, toggled open from the card.
const snapshots = ref<Record<string, Snapshot[]>>({})
const historyOpenKey = ref<AppKey | null>(null)
const loadingHistoryKey = ref<AppKey | null>(null)

async function loadSnapshots(key: 'cube' | 'rill') {
  loadingHistoryKey.value = key
  try {
    const res = await snapshotClient.listSnapshots({ app: key })
    snapshots.value = { ...snapshots.value, [key]: res.snapshots }
  } catch {
    toast.error(t('apps.snapshotHistory.error'))
  } finally {
    loadingHistoryKey.value = null
  }
}

function toggleHistory(key: 'cube' | 'rill') {
  if (historyOpenKey.value === key) {
    historyOpenKey.value = null
    return
  }
  historyOpenKey.value = key
  if (!snapshots.value[key]) void loadSnapshots(key)
}

function formatSnapshotTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

async function saveSnapshot(key: 'cube' | 'rill') {
  if (savingKey.value) return
  savingKey.value = key
  try {
    const res = await snapshotClient.triggerSnapshot({ app: key })
    switch (res.status) {
      case 'created': toast.success(t('dashboard.cards.snapshot.saved')); break
      case 'unchanged': toast.info(t('dashboard.cards.snapshot.noChanges')); break
      case 'busy': toast.error(t('dashboard.cards.snapshot.busy')); break
      default: toast.info(res.status)
    }
    // Refresh history if it's loaded/open so a new snapshot shows immediately.
    if (res.status === 'created' && (historyOpenKey.value === key || snapshots.value[key])) {
      void loadSnapshots(key)
    }
  } catch {
    toast.error(t('dashboard.cards.snapshot.error'))
  } finally {
    savingKey.value = null
  }
}

const isLoading = computed(() => workspace.isLoading && !workspace.isReady)
</script>

<template>
  <div class="mx-auto px-[34px] pb-20 pt-[34px]" style="max-width:1080px">
    <!-- Header -->
    <div class="mb-[22px]">
      <h1 class="m-0 mb-[5px] text-[25px] font-bold tracking-[-.02em]">{{ t('apps.title') }}</h1>
      <div class="text-[13.5px] text-ink-2">{{ t('apps.intro') }}</div>
    </div>

    <div v-if="isLoading" class="flex items-center gap-2 text-[13.5px] text-ink-2">
      <Icon name="spinner" :size="16" class="animate-spin" />
      {{ t('common.loading') }}
    </div>

    <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div
        v-for="a in APPS"
        :key="a.key"
        class="flex flex-col rounded-2xl border bg-surface p-[18px_19px]"
        style="border-color:var(--line); box-shadow:var(--shadow)"
      >
        <!-- Heading row -->
        <div class="mb-[13px] flex items-start gap-[13px]">
          <div
            class="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-xl text-[16px] font-extrabold"
            :style="{ background: a.tintBg, color: a.tintFg }"
          >{{ a.mono }}</div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-[9px]">
              <span class="text-[15.5px] font-bold">{{ t(`apps.${a.key}.name`) }}</span>
              <StatusChip :status="statusFor(a.key)" />
            </div>
            <div class="mt-[3px] text-[12.5px] text-ink-2">{{ t(`apps.${a.key}.desc`) }}</div>
          </div>
        </div>

        <!-- Snapshot history (Cube & Rill, active) -->
        <div
          v-if="statusFor(a.key) === 'active' && a.canSnapshot && historyOpenKey === a.key"
          class="mb-[13px] rounded-[10px] border p-3"
          style="background:var(--inset); border-color:var(--line)"
        >
          <div class="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">
            {{ t('apps.snapshotHistory.title') }}
          </div>
          <div v-if="loadingHistoryKey === a.key" class="flex items-center gap-2 text-[12.5px] text-ink-3">
            <Icon name="spinner" :size="14" class="animate-spin" />
            {{ t('apps.snapshotHistory.loading') }}
          </div>
          <div
            v-else-if="!snapshots[a.key]?.length"
            class="text-[12.5px] text-ink-3"
          >
            {{ t('apps.snapshotHistory.empty') }}
          </div>
          <ul v-else class="flex flex-col gap-[6px]">
            <li
              v-for="s in snapshots[a.key]"
              :key="s.key"
              class="flex items-center justify-between gap-3 text-[12.5px]"
            >
              <span class="text-ink-2">{{ formatSnapshotTime(s.timestamp) }}</span>
              <span class="font-mono text-[11.5px] text-ink-3">{{ s.hash.slice(0, 12) }}</span>
            </li>
          </ul>
        </div>

        <!-- Action row -->
        <div class="mt-auto flex items-center gap-2">
          <!-- Launch (active, has web UI, endpoint known) -->
          <button
            v-if="statusFor(a.key) === 'active' && a.hasLaunch && urlFor(a.key)"
            type="button"
            class="flex h-9 items-center gap-[7px] rounded-[9px] border-none px-[14px] text-[13px] font-semibold hover:brightness-105"
            style="background:var(--accent); color:var(--accent-ink)"
            @click="launch(a.key)"
          >
            {{ t('apps.launch') }}
            <Icon name="launch" :size="14" />
          </button>

          <!-- Save snapshot (Cube & Rill, active) -->
          <button
            v-if="statusFor(a.key) === 'active' && a.canSnapshot"
            type="button"
            :disabled="savingKey === a.key"
            class="flex h-9 items-center gap-[7px] rounded-[9px] border px-[13px] text-[13px] font-semibold text-ink-2 hover:border-accent hover:text-accent disabled:opacity-60"
            style="background:var(--surface-2); border-color:var(--line)"
            @click="saveSnapshot(a.key as 'cube' | 'rill')"
          >
            <Icon :name="savingKey === a.key ? 'spinner' : 'snapshot'" :size="14" :class="savingKey === a.key ? 'animate-spin' : ''" />
            {{ savingKey === a.key ? t('dashboard.cards.snapshot.saving') : t('apps.saveSnapshot') }}
          </button>

          <!-- Snapshot history toggle (Cube & Rill, active) -->
          <button
            v-if="statusFor(a.key) === 'active' && a.canSnapshot"
            type="button"
            class="flex h-9 items-center gap-[7px] rounded-[9px] border px-[13px] text-[13px] font-semibold text-ink-2 hover:border-accent hover:text-accent"
            style="background:var(--surface-2); border-color:var(--line)"
            @click="toggleHistory(a.key as 'cube' | 'rill')"
          >
            <Icon name="clock" :size="14" />
            {{ t('apps.snapshotHistory.toggle') }}
          </button>

          <!-- DuckFlight active: no launch, connect via Flight SQL clients -->
          <span
            v-if="statusFor(a.key) === 'active' && !a.hasLaunch"
            class="text-[11.5px] text-ink-3"
          >{{ t(`apps.${a.key}.desc`) }}</span>

          <!-- Off: say where the switch actually is, rather than leaving an
               app card with no affordance at all. -->
          <span
            v-if="statusFor(a.key) === 'off'"
            class="text-[11.5px] text-ink-3"
          >{{ t('apps.selfHostNote') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
