<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ConnectError, Code } from '@connectrpc/connect'
import { boxRepoClient } from '../api'
import { errorMessage } from '../api/errors'
import Icon from './ui/Icon.vue'
import Spinner from './ui/Spinner.vue'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'

// Push-mirror card for one box repo (rill / transformations / pipelines):
// mirror the repo to the customer's own GitHub/GitLab. The remote token goes
// straight through to the box's Gitea — never stored centrally, never echoed
// back (GetPushMirror returns a credential-stripped URL).
// Optional title/subtitle overrides let a page hosting several cards (GitView)
// label each one by repo instead of repeating the generic card copy.
const props = defineProps<{ repo: string; title?: string; subtitle?: string }>()

// Reports whether the card applies here, so a host page can show its own
// empty state when every card hid itself (non-VM workspace).
const emit = defineEmits<{ state: [state: 'ready' | 'hidden'] }>()

const { t } = useI18n()
const toast = useToast()
const { confirm } = useConfirm()

type CardState = 'loading' | 'hidden' | 'ready'
const cardState = ref<CardState>('loading')

const configured = ref(false)
const remoteUrl = ref('')
const lastUpdate = ref('')
const lastError = ref('')

const formOpen = ref(false)
const formUrl = ref('')
const formUsername = ref('')
const formToken = ref('')
const busy = ref(false)

async function loadStatus() {
  try {
    const resp = await boxRepoClient.getPushMirror({ repo: props.repo })
    configured.value = resp.configured
    remoteUrl.value = resp.remoteUrl
    lastUpdate.value = resp.lastUpdate
    lastError.value = resp.lastError
    cardState.value = 'ready'
  } catch (err) {
    // FAILED_PRECONDITION = not a dedicated box / credentials not deposited:
    // the mirror feature simply doesn't apply here, hide the card.
    if (err instanceof ConnectError && err.code === Code.FailedPrecondition) {
      cardState.value = 'hidden'
    } else {
      toast.error(errorMessage(err, t('gitMirror.toast.loadFailed')))
      cardState.value = 'hidden'
    }
  }
  emit('state', cardState.value === 'ready' ? 'ready' : 'hidden')
}

async function save() {
  if (busy.value) return
  busy.value = true
  try {
    await boxRepoClient.setPushMirror({
      repo: props.repo,
      remoteUrl: formUrl.value.trim(),
      remoteUsername: formUsername.value.trim(),
      remotePassword: formToken.value,
    })
    toast.success(t('gitMirror.toast.saved'))
    formOpen.value = false
    formToken.value = ''
    await loadStatus()
  } catch (err) {
    toast.error(errorMessage(err, t('gitMirror.toast.saveFailed')))
  } finally {
    busy.value = false
  }
}

async function syncNow() {
  if (busy.value) return
  busy.value = true
  try {
    await boxRepoClient.syncPushMirror({ repo: props.repo })
    toast.success(t('gitMirror.toast.synced'))
  } catch (err) {
    toast.error(errorMessage(err, t('gitMirror.toast.syncFailed')))
  } finally {
    busy.value = false
  }
}

async function remove() {
  const ok = await confirm({
    title: t('gitMirror.removeConfirm.title'),
    body: t('gitMirror.removeConfirm.body', { url: remoteUrl.value }),
    confirmLabel: t('gitMirror.removeConfirm.confirm'),
    danger: true,
  })
  if (!ok || busy.value) return
  busy.value = true
  try {
    await boxRepoClient.deletePushMirror({ repo: props.repo })
    toast.success(t('gitMirror.toast.removed'))
    await loadStatus()
  } catch (err) {
    toast.error(errorMessage(err, t('gitMirror.toast.removeFailed')))
  } finally {
    busy.value = false
  }
}

function openForm() {
  formUrl.value = ''
  formUsername.value = ''
  formToken.value = ''
  formOpen.value = true
}

function formatTime(rfc3339: string): string {
  // Gitea reports zero times for never-synced mirrors.
  if (!rfc3339 || rfc3339.startsWith('0001-')) return ''
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
          <Icon name="launch" :size="15" style="color:var(--ink-2); flex:none;" />
          <h2 style="margin:0; font-size:15px; font-weight:700; letter-spacing:-.01em;">{{ props.title ?? t('gitMirror.title') }}</h2>
        </div>
        <div style="font-size:12.5px; color:var(--ink-2); line-height:1.5;">{{ props.subtitle ?? t('gitMirror.subtitle') }}</div>
      </div>
      <button
        v-if="!configured && !formOpen"
        @click="openForm"
        style="display:flex; align-items:center; gap:7px; height:36px; padding:0 14px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:inherit; font-size:13px; font-weight:600; cursor:pointer; flex:none;"
      >
        <Icon name="plus" :size="14" />{{ t('gitMirror.enable') }}
      </button>
    </div>

    <!-- Configured status -->
    <div v-if="configured && !formOpen" style="margin-top:14px; display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
      <div style="min-width:0; flex:1;">
        <div style="font-size:12px; color:var(--ink-3); margin-bottom:2px;">{{ t('gitMirror.configured') }}</div>
        <div style="font-family:'JetBrains Mono',monospace; font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ remoteUrl }}</div>
        <div v-if="lastError" style="margin-top:4px; font-size:12px; color:var(--err);">{{ t('gitMirror.syncError', { error: lastError }) }}</div>
        <div v-else style="margin-top:4px; font-size:12px; color:var(--ink-3);">
          {{ formatTime(lastUpdate) ? t('gitMirror.lastSync', { time: formatTime(lastUpdate) }) : t('gitMirror.neverSynced') }}
        </div>
      </div>
      <div style="display:flex; gap:8px; flex:none;">
        <button
          @click="syncNow"
          :disabled="busy"
          style="display:flex; align-items:center; gap:6px; height:34px; padding:0 12px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:inherit; font-size:12.5px; font-weight:600; cursor:pointer;"
        >
          <Spinner v-if="busy" :size="13" />
          <Icon v-else name="refresh" :size="13" />{{ t('gitMirror.syncNow') }}
        </button>
        <button
          @click="openForm"
          style="height:34px; padding:0 12px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink-2); font-family:inherit; font-size:12.5px; font-weight:600; cursor:pointer;"
        >{{ t('gitMirror.edit') }}</button>
        <button
          @click="remove"
          :disabled="busy"
          style="height:34px; padding:0 12px; border:1px solid var(--line); border-radius:10px; background:transparent; color:var(--err); font-family:inherit; font-size:12.5px; font-weight:600; cursor:pointer;"
        >{{ t('gitMirror.remove') }}</button>
      </div>
    </div>

    <!-- Configure form -->
    <div v-if="formOpen" style="margin-top:14px; display:grid; gap:12px; max-width:560px;">
      <div>
        <label style="display:block; font-size:12px; font-weight:600; color:var(--ink-2); margin-bottom:5px;">{{ t('gitMirror.remoteUrl') }}</label>
        <input
          v-model="formUrl"
          type="url"
          :placeholder="t('gitMirror.remoteUrlPlaceholder')"
          style="width:100%; height:38px; padding:0 12px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:'JetBrains Mono',monospace; font-size:12.5px; outline:none;"
        />
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div>
          <label style="display:block; font-size:12px; font-weight:600; color:var(--ink-2); margin-bottom:5px;">{{ t('gitMirror.username') }}</label>
          <input
            v-model="formUsername"
            type="text"
            autocomplete="off"
            style="width:100%; height:38px; padding:0 12px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-size:13px; outline:none;"
          />
          <div style="margin-top:4px; font-size:11.5px; color:var(--ink-3);">{{ t('gitMirror.usernameHint') }}</div>
        </div>
        <div>
          <label style="display:block; font-size:12px; font-weight:600; color:var(--ink-2); margin-bottom:5px;">{{ t('gitMirror.token') }}</label>
          <input
            v-model="formToken"
            type="password"
            autocomplete="new-password"
            style="width:100%; height:38px; padding:0 12px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-size:13px; outline:none;"
          />
          <div style="margin-top:4px; font-size:11.5px; color:var(--ink-3);">{{ t('gitMirror.tokenHint') }}</div>
        </div>
      </div>
      <div style="display:flex; gap:10px;">
        <button
          @click="save"
          :disabled="!formUrl.trim() || !formUsername.trim() || !formToken || busy"
          :style="{
            display: 'flex', alignItems: 'center', gap: '7px', height: '38px', padding: '0 16px',
            border: 'none', borderRadius: '10px', background: 'var(--accent)', color: 'var(--accent-ink)',
            fontFamily: 'inherit', fontSize: '13px', fontWeight: 600,
            opacity: (!formUrl.trim() || !formUsername.trim() || !formToken || busy) ? 0.5 : 1,
            cursor: (!formUrl.trim() || !formUsername.trim() || !formToken || busy) ? 'not-allowed' : 'pointer',
          }"
        >
          <Spinner v-if="busy" :size="13" />{{ t('gitMirror.enable') }}
        </button>
        <button
          @click="formOpen = false"
          style="height:38px; padding:0 14px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink-2); font-family:inherit; font-size:13px; font-weight:600; cursor:pointer;"
        >{{ t('gitMirror.cancel') }}</button>
      </div>
    </div>
  </div>
</template>
