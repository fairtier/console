<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ConnectError, Code } from '@connectrpc/connect'
import { useConnectionsStore } from '../stores/connections'
import { connectGoogleSheets, OAuthUnavailableError, OAuthClientNotConfiguredError } from '../api/googleOAuth'
import { errorMessage } from '../api/errors'
import Icon from './ui/Icon.vue'
import Spinner from './ui/Spinner.vue'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'

// Workspace-level Google connections: the customer signs in with Google ONCE
// and everything that needs that access consumes the connection — Sheets
// pipelines reference it, and live queries in the SQL editor read sheets
// through it. Distinct from GoogleOAuthCard below it, which registers the
// customer's own OAuth *application* (the prerequisite for connecting).

const emit = defineEmits<{ state: [state: 'ready' | 'hidden'] }>()

const { t } = useI18n()
const toast = useToast()
const { confirm } = useConfirm()
const store = useConnectionsStore()

type CardState = 'loading' | 'hidden' | 'ready'
const cardState = ref<CardState>('loading')
const busy = ref(false)
// Set when Connect failed because the workspace has no Google app yet — the
// fix is on this same page, one card down.
const needsApp = ref(false)

const googleConnections = computed(() => store.connections.filter((c) => c.type === 'google'))

async function loadStatus() {
  try {
    await store.load(true)
    cardState.value = store.availability === 'ready' ? 'ready' : 'hidden'
  } catch (err) {
    toast.error(errorMessage(err, t('connections.toast.loadFailed')))
    cardState.value = 'hidden'
  }
  emit('state', cardState.value === 'ready' ? 'ready' : 'hidden')
}

async function connect() {
  if (busy.value) return
  busy.value = true
  needsApp.value = false
  try {
    // Popup must open inside the click gesture; connectGoogleSheets handles that.
    const grant = await connectGoogleSheets()
    await store.createFromGoogleGrant(grant.grant_id)
    toast.success(t('connections.toast.connected', { email: grant.email }))
  } catch (err) {
    if (err instanceof OAuthClientNotConfiguredError) {
      needsApp.value = true
    } else if (err instanceof OAuthUnavailableError) {
      toast.error(t('connections.toast.flowUnavailable'))
    } else {
      toast.error(errorMessage(err, t('connections.toast.connectFailed')))
    }
  } finally {
    busy.value = false
  }
}

async function remove(id: string, name: string) {
  const ok = await confirm({
    title: t('connections.removeConfirm.title', { name }),
    body: t('connections.removeConfirm.body'),
    confirmLabel: t('connections.removeConfirm.confirm'),
    danger: true,
  })
  if (!ok || busy.value) return
  busy.value = true
  try {
    await store.remove(id)
    toast.success(t('connections.toast.removed'))
  } catch (err) {
    // FailedPrecondition = pipelines still reference it; name the fix.
    if (err instanceof ConnectError && err.code === Code.FailedPrecondition) {
      toast.error(t('connections.toast.inUse'))
    } else {
      toast.error(errorMessage(err, t('connections.toast.removeFailed')))
    }
  } finally {
    busy.value = false
  }
}

function formatTime(rfc3339: string): string {
  if (!rfc3339) return ''
  const d = new Date(rfc3339)
  return Number.isNaN(d.getTime()) ? rfc3339 : d.toLocaleDateString()
}

onMounted(loadStatus)
</script>

<template>
  <div
    v-if="cardState === 'ready'"
    style="margin-top:18px; background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); padding:20px 22px;"
  >
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px;">
      <div style="min-width:0;">
        <div style="display:flex; align-items:center; gap:9px; margin-bottom:4px;">
          <Icon name="link" :size="15" style="color:var(--ink-2); flex:none;" />
          <h2 style="margin:0; font-size:15px; font-weight:700; letter-spacing:-.01em;">{{ t('connections.google.title') }}</h2>
        </div>
        <div style="font-size:12.5px; color:var(--ink-2); line-height:1.5;">{{ t('connections.google.subtitle') }}</div>
      </div>
      <button
        @click="connect"
        :disabled="busy"
        style="display:flex; align-items:center; gap:7px; height:36px; padding:0 14px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:inherit; font-size:13px; font-weight:600; cursor:pointer; flex:none;"
      >
        <Spinner v-if="busy" :size="13" />
        <Icon v-else name="plus" :size="14" />
        {{ t('connections.google.connect') }}
      </button>
    </div>

    <!-- Connecting needs the workspace's own Google app; it lives one card down. -->
    <div
      v-if="needsApp"
      style="margin-top:14px; display:flex; gap:9px; align-items:flex-start; border:1px solid var(--line); border-radius:12px; background:var(--surface-2); padding:11px 13px;"
    >
      <Icon name="info" :size="14" style="color:var(--warn); flex:none; margin-top:2px;" />
      <div style="font-size:12.5px; color:var(--ink-2); line-height:1.55;">{{ t('connections.google.needsApp') }}</div>
    </div>

    <!-- Connection list -->
    <div v-if="googleConnections.length" style="margin-top:14px; display:grid; gap:8px;">
      <div
        v-for="c in googleConnections"
        :key="c.id"
        style="display:flex; align-items:center; gap:12px; border:1px solid var(--line); border-radius:12px; background:var(--surface-2); padding:10px 13px;"
      >
        <div style="min-width:0; flex:1;">
          <div style="font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ c.name }}</div>
          <div style="margin-top:2px; font-size:12px; color:var(--ink-3);">
            <span v-if="c.email && c.email !== c.name">{{ c.email }} · </span>{{ t('connections.google.since', { date: formatTime(c.createdAt) }) }}
          </div>
        </div>
        <button
          @click="remove(c.id, c.name)"
          :disabled="busy"
          style="height:32px; padding:0 12px; border:1px solid var(--line); border-radius:10px; background:transparent; color:var(--err); font-family:inherit; font-size:12.5px; font-weight:600; cursor:pointer; flex:none;"
        >{{ t('connections.google.disconnect') }}</button>
      </div>
    </div>

    <div v-else-if="!needsApp" style="margin-top:14px; font-size:12.5px; color:var(--ink-3);">
      {{ t('connections.google.empty') }}
    </div>

    <!-- Trust boundary, stated where the decision is made: anyone holding the
         workspace's engine token can query the connected sheets. -->
    <div style="margin-top:12px; font-size:11.5px; color:var(--ink-3); line-height:1.55;">
      {{ t('connections.google.trustNote') }}
    </div>
  </div>
</template>
