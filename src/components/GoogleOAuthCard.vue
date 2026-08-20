<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ConnectError, Code } from '@connectrpc/connect'
import { oauthClientClient } from '../api'
import { errorMessage } from '../api/errors'
import Icon from './ui/Icon.vue'
import Spinner from './ui/Spinner.vue'
import CopyButton from './ui/CopyButton.vue'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'

// The workspace's OWN Google OAuth application, used by the Google Sheets
// "Sign in with Google" source flow.
//
// It is the customer's app on purpose: the client pair has to travel with the
// refresh token into their own box repo so the worker can refresh offline, and
// a shared FairTier app would therefore put our Google identity on every
// customer's machine. The upside for them is that the consent screen, the quota
// and the Google verification status are all their own.
//
// The client secret is write-only — GetOAuthClient never returns it, so the form
// always asks for both halves rather than offering a "leave blank to keep".

// Reports whether the card applies here, so the host page can show one empty
// state when it hides itself.
const emit = defineEmits<{ state: [state: 'ready' | 'hidden'] }>()

const { t } = useI18n()
const toast = useToast()
const { confirm } = useConfirm()

type CardState = 'loading' | 'hidden' | 'ready'
const cardState = ref<CardState>('loading')

const configured = ref(false)
const clientId = ref('')
const redirectUri = ref('')
const requiredScopes = ref<string[]>([])
const flowAvailable = ref(false)
const updatedAt = ref('')

const formOpen = ref(false)
const formClientId = ref('')
const formClientSecret = ref('')
const busy = ref(false)

const canSave = computed(
  () => !!formClientId.value.trim() && !!formClientSecret.value.trim() && !busy.value,
)

async function loadStatus() {
  try {
    const resp = await oauthClientClient.getOAuthClient({ provider: 'google' })
    configured.value = resp.configured
    clientId.value = resp.clientId
    redirectUri.value = resp.redirectUri
    requiredScopes.value = resp.requiredScopes
    flowAvailable.value = resp.flowAvailable
    updatedAt.value = resp.updatedAt
    cardState.value = 'ready'
  } catch (err) {
    // Unimplemented = the workspace plane serving this Console does not mount
    // the service (an older box). Not an error worth a toast: the feature
    // simply does not exist here, so hide the card.
    if (err instanceof ConnectError && err.code === Code.Unimplemented) {
      cardState.value = 'hidden'
    } else {
      toast.error(errorMessage(err, t('integrations.google.toast.loadFailed')))
      cardState.value = 'hidden'
    }
  }
  emit('state', cardState.value === 'ready' ? 'ready' : 'hidden')
}

async function save() {
  if (!canSave.value) return
  busy.value = true
  try {
    await oauthClientClient.setOAuthClient({
      provider: 'google',
      clientId: formClientId.value.trim(),
      clientSecret: formClientSecret.value.trim(),
    })
    toast.success(t('integrations.google.toast.saved'))
    formOpen.value = false
    formClientSecret.value = ''
    await loadStatus()
  } catch (err) {
    toast.error(errorMessage(err, t('integrations.google.toast.saveFailed')))
  } finally {
    busy.value = false
  }
}

async function remove() {
  const ok = await confirm({
    title: t('integrations.google.removeConfirm.title'),
    body: t('integrations.google.removeConfirm.body'),
    confirmLabel: t('integrations.google.removeConfirm.confirm'),
    danger: true,
  })
  if (!ok || busy.value) return
  busy.value = true
  try {
    await oauthClientClient.deleteOAuthClient({ provider: 'google' })
    toast.success(t('integrations.google.toast.removed'))
    await loadStatus()
  } catch (err) {
    toast.error(errorMessage(err, t('integrations.google.toast.removeFailed')))
  } finally {
    busy.value = false
  }
}

function openForm() {
  // Prefill the id (not a secret) so "replace" is an edit, not a retype; the
  // secret always starts empty because it is never sent back to the browser.
  formClientId.value = clientId.value
  formClientSecret.value = ''
  formOpen.value = true
}

function formatTime(rfc3339: string): string {
  if (!rfc3339) return ''
  const d = new Date(rfc3339)
  return Number.isNaN(d.getTime()) ? rfc3339 : d.toLocaleString()
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
          <Icon name="table" :size="15" style="color:var(--ink-2); flex:none;" />
          <h2 style="margin:0; font-size:15px; font-weight:700; letter-spacing:-.01em;">{{ t('integrations.google.title') }}</h2>
        </div>
        <div style="font-size:12.5px; color:var(--ink-2); line-height:1.5;">{{ t('integrations.google.subtitle') }}</div>
      </div>
      <button
        v-if="!configured && !formOpen"
        @click="openForm"
        style="display:flex; align-items:center; gap:7px; height:36px; padding:0 14px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:inherit; font-size:13px; font-weight:600; cursor:pointer; flex:none;"
      >
        <Icon name="plus" :size="14" />{{ t('integrations.google.connect') }}
      </button>
    </div>

    <!-- Connected status -->
    <div v-if="configured && !formOpen" style="margin-top:14px; display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
      <div style="min-width:0; flex:1;">
        <div style="font-size:12px; color:var(--ink-3); margin-bottom:2px;">{{ t('integrations.google.connected') }}</div>
        <div style="font-family:'JetBrains Mono',monospace; font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ clientId }}</div>
        <div v-if="formatTime(updatedAt)" style="margin-top:4px; font-size:12px; color:var(--ink-3);">
          {{ t('integrations.google.updatedAt', { time: formatTime(updatedAt) }) }}
        </div>
      </div>
      <div style="display:flex; gap:8px; flex:none;">
        <button
          @click="openForm"
          style="height:34px; padding:0 12px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink-2); font-family:inherit; font-size:12.5px; font-weight:600; cursor:pointer;"
        >{{ t('integrations.google.edit') }}</button>
        <button
          @click="remove"
          :disabled="busy"
          style="height:34px; padding:0 12px; border:1px solid var(--line); border-radius:10px; background:transparent; color:var(--err); font-family:inherit; font-size:12.5px; font-weight:600; cursor:pointer;"
        >{{ t('integrations.google.remove') }}</button>
      </div>
    </div>

    <!-- New connections need a redirect URI registered for THIS host; a box
         has none of its own yet, so it can hold the pair but not run consent. -->
    <div
      v-if="!flowAvailable"
      style="margin-top:14px; display:flex; gap:9px; align-items:flex-start; border:1px solid var(--line); border-radius:12px; background:var(--surface-2); padding:11px 13px;"
    >
      <Icon name="info" :size="14" style="color:var(--ink-3); flex:none; margin-top:2px;" />
      <div style="font-size:12.5px; color:var(--ink-2); line-height:1.55;">{{ t('integrations.google.flowUnavailable') }}</div>
    </div>

    <!-- Configure form -->
    <div v-if="formOpen" style="margin-top:14px; display:grid; gap:14px; max-width:620px;">
      <!-- What to do in Google Cloud, in order, before the fields below. -->
      <div style="border:1px solid var(--line); border-radius:12px; background:var(--surface-2); padding:13px 15px;">
        <div style="font-size:12.5px; font-weight:700; margin-bottom:8px;">{{ t('integrations.google.setup.title') }}</div>
        <ol style="margin:0; padding-left:18px; font-size:12.5px; color:var(--ink-2); line-height:1.65;">
          <li>{{ t('integrations.google.setup.step1') }}</li>
          <li>{{ t('integrations.google.setup.step2') }}</li>
          <li>
            {{ t('integrations.google.setup.step3') }}
            <div v-if="redirectUri" style="margin:6px 0 2px; display:flex; align-items:center; gap:7px;">
              <code style="flex:1; min-width:0; overflow-x:auto; white-space:nowrap; font-family:'JetBrains Mono',monospace; font-size:12px; background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:6px 9px;">{{ redirectUri }}</code>
              <CopyButton :value="redirectUri" />
            </div>
          </li>
          <li>
            {{ t('integrations.google.setup.step4') }}
            <div v-for="scope in requiredScopes" :key="scope" style="margin:6px 0 2px; display:flex; align-items:center; gap:7px;">
              <code style="flex:1; min-width:0; overflow-x:auto; white-space:nowrap; font-family:'JetBrains Mono',monospace; font-size:12px; background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:6px 9px;">{{ scope }}</code>
              <CopyButton :value="scope" />
            </div>
          </li>
        </ol>
        <div style="margin-top:9px; font-size:11.5px; color:var(--ink-3); line-height:1.55;">{{ t('integrations.google.setup.verificationNote') }}</div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="display:block; font-size:12px; font-weight:600; color:var(--ink-2); margin-bottom:5px;">{{ t('integrations.google.clientId') }}</label>
          <input
            v-model="formClientId"
            type="text"
            autocomplete="off"
            :placeholder="t('integrations.google.clientIdPlaceholder')"
            style="width:100%; height:38px; padding:0 12px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:'JetBrains Mono',monospace; font-size:12.5px; outline:none;"
          />
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:600; color:var(--ink-2); margin-bottom:5px;">{{ t('integrations.google.clientSecret') }}</label>
          <input
            v-model="formClientSecret"
            type="password"
            autocomplete="new-password"
            style="width:100%; height:38px; padding:0 12px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-size:13px; outline:none;"
          />
          <div style="margin-top:4px; font-size:11.5px; color:var(--ink-3);">{{ t('integrations.google.clientSecretHint') }}</div>
        </div>
      </div>

      <div style="display:flex; gap:10px;">
        <button
          @click="save"
          :disabled="!canSave"
          :style="{
            display: 'flex', alignItems: 'center', gap: '7px', height: '38px', padding: '0 16px',
            border: 'none', borderRadius: '10px', background: 'var(--accent)', color: 'var(--accent-ink)',
            fontFamily: 'inherit', fontSize: '13px', fontWeight: 600,
            opacity: canSave ? 1 : 0.5,
            cursor: canSave ? 'pointer' : 'not-allowed',
          }"
        >
          <Spinner v-if="busy" :size="13" />{{ t('integrations.google.save') }}
        </button>
        <button
          @click="formOpen = false"
          style="height:38px; padding:0 14px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink-2); font-family:inherit; font-size:13px; font-weight:600; cursor:pointer;"
        >{{ t('integrations.google.cancel') }}</button>
      </div>
    </div>
  </div>
</template>
