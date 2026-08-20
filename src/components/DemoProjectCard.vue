<script setup lang="ts">
// One-click "NYC Taxi Pulse" starter demo (docs/plans/starter-demo-project.md §9).
// Self-fetches demo status. Shown as a full card offering "Load demo project"
// on an empty workspace, and as a slim bar offering "Remove demo project" once
// the demo is loaded. Renders nothing when the demo is unavailable (no demo
// bucket configured, or not a VM box) or when there is nothing to show.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { demoClient } from '../api'
import { errorMessage } from '../api/errors'
import type { DemoStatus } from '../api/gen/demo_pb.js'
import Icon from './ui/Icon.vue'
import Spinner from './ui/Spinner.vue'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'

const props = defineProps<{
  // Whether the surrounding list (pipelines/transformations/dashboards) is
  // empty — the Load prompt only nudges empty workspaces.
  workspaceEmpty: boolean
}>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const { t } = useI18n()
const toast = useToast()
const { confirm } = useConfirm()

const status = ref<DemoStatus | null>(null)
const busy = ref(false)
// True while a Remove is in flight, so the busy bar reads "Removing…" and the
// poll-completion toast is "removed" (the server reports both load and removal
// as the same `loading` busy flag).
const removing = ref(false)

const loading = computed(() => !!status.value?.loading)
const showLoad = computed(() => !!status.value?.available && !status.value?.loaded && !loading.value && props.workspaceEmpty)
const showRemove = computed(() => !!status.value?.loaded)

// The load runs server-side in the background; poll until it finishes so the
// list refreshes as pipelines appear and the card flips to the Remove bar.
let pollTimer: ReturnType<typeof setInterval> | undefined
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = undefined
  }
}
function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    await fetchStatus()
    emit('changed') // surface pipelines/models as the worker creates (or prunes) them
    if (!loading.value) {
      stopPolling()
      if (removing.value) {
        removing.value = false
        toast.success(t('demoUi.toast.removed'))
      }
    }
  }, 4000)
}

async function fetchStatus() {
  try {
    const resp = await demoClient.getDemoStatus({})
    status.value = resp.status ?? null
  } catch {
    // Availability is best-effort: on any error just hide the card.
    status.value = null
  }
}

async function load() {
  if (busy.value) return
  busy.value = true
  try {
    const resp = await demoClient.loadDemoProject({ tier: '' })
    status.value = resp.status ?? null
    toast.success(t('demoUi.toast.loaded'))
    emit('changed')
    if (loading.value) startPolling()
  } catch (err) {
    toast.error(errorMessage(err, t('demoUi.toast.loadFailed')))
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (busy.value) return
  const ok = await confirm({ title: t('demoUi.remove'), body: t('demoUi.body'), confirmLabel: t('demoUi.remove'), danger: true })
  if (!ok) return
  busy.value = true
  try {
    // Removal runs server-side in the background (serial box I/O); poll until
    // the demo is gone, then toast. The card shows the busy bar meanwhile.
    await demoClient.removeDemoProject({})
    removing.value = true
    await fetchStatus()
    emit('changed')
    if (loading.value) {
      startPolling()
    } else {
      removing.value = false
      toast.success(t('demoUi.toast.removed'))
    }
  } catch (err) {
    removing.value = false
    toast.error(errorMessage(err, t('demoUi.toast.removeFailed')))
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  await fetchStatus()
  if (loading.value) startPolling() // a load was already in flight
})
onBeforeUnmount(stopPolling)
</script>

<template>
  <!-- Load prompt: full card on an empty workspace -->
  <div
    v-if="showLoad"
    style="background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); padding:32px 28px; text-align:center; margin-bottom:18px;"
  >
    <div style="width:44px; height:44px; margin:0 auto 14px; border-radius:12px; background:var(--accent-soft); color:var(--accent-soft-ink); display:flex; align-items:center; justify-content:center;">
      <Icon name="sparkle" :size="22" />
    </div>
    <h2 style="margin:0 0 6px; font-size:17px; font-weight:700; letter-spacing:-.01em;">{{ t('demoUi.title') }}</h2>
    <div style="font-size:13.5px; color:var(--ink-2); max-width:460px; margin:0 auto 20px; line-height:1.55;">{{ t('demoUi.body') }}</div>
    <button
      :disabled="busy"
      @click="load"
      style="display:inline-flex; align-items:center; gap:8px; height:42px; padding:0 20px; border:none; border-radius:11px; background:var(--accent); color:var(--accent-ink); font-family:inherit; font-size:14px; font-weight:600; cursor:pointer; box-shadow:var(--shadow);"
      :style="busy ? 'opacity:.6; cursor:default;' : ''"
    >
      <Icon name="sparkle" :size="16" />{{ busy ? t('demoUi.loading') : t('demoUi.load') }}
    </button>
  </div>

  <!-- Loading: slim bar while the background load runs -->
  <div
    v-else-if="loading"
    style="display:flex; align-items:center; gap:12px; background:var(--surface); border:1px solid var(--line); border-radius:12px; box-shadow:var(--shadow); padding:12px 16px; margin-bottom:18px;"
  >
    <Spinner :size="18" />
    <div style="flex:1; font-size:13px; color:var(--ink-2);">{{ removing ? t('demoUi.removing') : t('demoUi.loading') }}</div>
  </div>

  <!-- Remove control: slim bar once the demo is loaded -->
  <div
    v-else-if="showRemove"
    style="display:flex; align-items:center; gap:12px; background:var(--surface); border:1px solid var(--line); border-radius:12px; box-shadow:var(--shadow); padding:12px 16px; margin-bottom:18px;"
  >
    <div style="width:30px; height:30px; border-radius:9px; background:var(--accent-soft); color:var(--accent-soft-ink); display:flex; align-items:center; justify-content:center; flex:0 0 auto;">
      <Icon name="sparkle" :size="16" />
    </div>
    <div style="flex:1; font-size:13px; color:var(--ink-2);">{{ t('demoUi.loaded') }}</div>
    <button
      :disabled="busy"
      @click="remove"
      style="display:inline-flex; align-items:center; gap:6px; height:34px; padding:0 14px; border:1px solid var(--line); border-radius:9px; background:var(--surface); color:var(--ink-2); font-family:inherit; font-size:13px; font-weight:600; cursor:pointer;"
      :style="busy ? 'opacity:.6; cursor:default;' : ''"
    >
      {{ busy ? t('demoUi.removing') : t('demoUi.remove') }}
    </button>
  </div>
</template>
