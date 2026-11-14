<script setup lang="ts">
// AI agents: connect a person's own MCP client (Claude Code, Cursor, …) to
// this workspace's /mcp endpoint, and manage the access tokens it uses
// (workspace-api access_token.v1). The endpoint and the token service are off
// unless the box sets MCP_ENABLED=true; the bootstrap document does not say
// so, so the page probes ListAccessTokens and treats Unimplemented/NotFound as
// "not enabled here" — a calm explanatory state, not an error.
//
// The secret of a freshly created token lives in this component only: shown
// once, filled into the snippets, gone on reload or dismissal.
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Code, ConnectError } from '@connectrpc/connect'
import { accessTokenClient, workspaceApiBase } from '../api'
import { errorMessage, fieldViolations } from '../api/errors'
import type { AccessToken } from '../api/gen/access_token_pb.js'
import Icon from '../components/ui/Icon.vue'
import CodeSnippet from '../components/ui/CodeSnippet.vue'
import CopyButton from '../components/ui/CopyButton.vue'
import Segmented from '../components/ui/Segmented.vue'
import Spinner from '../components/ui/Spinner.vue'
import { useConfirm } from '../composables/useConfirm'
import { useToast } from '../composables/useToast'
import {
  CLIENTS,
  EXPIRY_PRESETS,
  MAX_NAME_LENGTH,
  TOKEN_PLACEHOLDER,
  capabilitiesByScope,
  clientSnippet,
  clientSnippetFile,
  daysLeft,
  mcpEndpoint,
  scopeLabel,
  scopesFor,
  sortTokens,
  tokenState,
  tokenViolationField,
  validateTokenName,
  type Access,
  type ClientId,
  type ExpiryPreset,
  type TokenField,
} from '../lib/agents'
import { formatRelative } from '../lib/workflow'

const { t, locale } = useI18n()
const toast = useToast()
const { confirm } = useConfirm()

// --- Availability + list ---------------------------------------------------------
const loading = ref(true)
const unavailable = ref(false)
const tokens = ref<AccessToken[]>([])
const now = ref(Date.now())
const sorted = computed(() => sortTokens(tokens.value, now.value))

function isUnavailable(err: unknown): boolean {
  return err instanceof ConnectError && (err.code === Code.Unimplemented || err.code === Code.NotFound)
}

async function loadTokens(initial = false) {
  try {
    const resp = await accessTokenClient.listAccessTokens({})
    tokens.value = resp.tokens
    unavailable.value = false
    now.value = Date.now()
  } catch (err) {
    if (isUnavailable(err)) unavailable.value = true
    else toast.error(errorMessage(err, t('agentsUi.toast.loadFailed')))
  } finally {
    if (initial) loading.value = false
  }
}
onMounted(() => loadTokens(true))

// --- Connect snippets ----------------------------------------------------------------
const endpoint = computed(() => mcpEndpoint(workspaceApiBase()))
const client = ref<ClientId>('claude-code')
const clientOptions = computed(() => CLIENTS.map((c) => ({ value: c, label: t(`agentsUi.connect.clients.${c}`) })))
const secret = ref('')
const snippet = computed(() => clientSnippet(client.value, endpoint.value, secret.value))

// --- Create -----------------------------------------------------------------------------
const creating = ref(false)
const submitting = ref(false)
const form = reactive({ name: '', access: 'read' as Access, days: 90 as ExpiryPreset })
const errors = reactive<Record<TokenField, string>>({ name: '', scopes: '', expiresInDays: '' })
const formError = ref('')
const expiryOptions = computed(() =>
  EXPIRY_PRESETS.map((d) => ({ value: String(d), label: t('agentsUi.form.days', { n: d }) })),
)
const expiryModel = computed({
  get: () => String(form.days),
  set: (v: string) => (form.days = Number(v) as ExpiryPreset),
})
const nameInput = ref<HTMLInputElement | null>(null)
const topEl = ref<HTMLElement | null>(null)

// A server error describes the value that was sent; editing it clears that.
watch(() => form.name, () => (errors.name = ''))
watch(() => form.access, () => (errors.scopes = ''))
watch(() => form.days, () => (errors.expiresInDays = ''))

function clearErrors() {
  errors.name = ''
  errors.scopes = ''
  errors.expiresInDays = ''
  formError.value = ''
}

async function startCreate() {
  clearErrors()
  form.name = ''
  form.access = 'read'
  form.days = 90
  creating.value = true
  await nextTick()
  nameInput.value?.focus()
}

function cancelCreate() {
  creating.value = false
  clearErrors()
}

async function submit() {
  clearErrors()
  const invalid = validateTokenName(form.name)
  if (invalid) {
    errors.name = t(`agentsUi.validation.${invalid}`, { n: MAX_NAME_LENGTH })
    return
  }
  submitting.value = true
  try {
    const resp = await accessTokenClient.createAccessToken({
      name: form.name.trim(),
      scopes: scopesFor(form.access),
      expiresInDays: form.days,
    })
    secret.value = resp.secret
    creating.value = false
    if (resp.token) tokens.value = [resp.token, ...tokens.value.filter((x) => x.id !== resp.token?.id)]
    now.value = Date.now()
    await nextTick()
    topEl.value?.scrollIntoView({ block: 'start' })
  } catch (err) {
    const violations = fieldViolations(err)
    let placed = false
    for (const v of violations) {
      const field = tokenViolationField(v.field)
      if (field) {
        errors[field] = v.description
        placed = true
      }
    }
    if (!placed) formError.value = errorMessage(err, t('agentsUi.toast.createFailed'))
  } finally {
    submitting.value = false
  }
}

function dismissSecret() {
  secret.value = ''
}

// --- Revoke -----------------------------------------------------------------------------
const revoking = ref<string | null>(null)
async function revoke(tok: AccessToken) {
  const ok = await confirm({
    title: t('agentsUi.confirmRevoke.title'),
    body: t('agentsUi.confirmRevoke.body', { name: tok.name }),
    confirmLabel: t('agentsUi.confirmRevoke.confirm'),
    danger: true,
  })
  if (!ok) return
  revoking.value = tok.id
  try {
    await accessTokenClient.revokeAccessToken({ id: tok.id })
    toast.success(t('agentsUi.toast.revoked'))
    await loadTokens()
  } catch (err) {
    toast.error(errorMessage(err, t('agentsUi.toast.revokeFailed')))
  } finally {
    revoking.value = null
  }
}

// --- Row presentation ----------------------------------------------------------------
function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(locale.value, { year: 'numeric', month: 'short', day: 'numeric' })
}
function rowState(tok: AccessToken) {
  return tokenState(tok, now.value)
}

// --- Static copy --------------------------------------------------------------------
const capabilityGroups = capabilitiesByScope()
const PROMPTS = ['failed', 'workflow', 'profile'] as const
</script>

<template>
  <div ref="topEl" class="mx-auto px-[34px] pb-20 pt-[34px]" style="max-width: 920px; scroll-margin-top: 16px">
    <!-- header -->
    <div class="mb-[22px]">
      <h1 class="m-0 mb-[5px] text-[25px] font-bold" style="letter-spacing: -0.02em">{{ t('agentsUi.title') }}</h1>
      <div class="text-[13.5px]" style="color: var(--ink-2)">{{ t('agentsUi.intro') }}</div>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-24" style="color: var(--ink-3)">
      <Spinner :size="24" />
    </div>

    <!-- Not enabled on this workspace -->
    <div
      v-else-if="unavailable"
      data-testid="agents-disabled"
      class="mb-[18px] rounded-2xl px-[34px] py-[40px]"
      style="background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow)"
    >
      <div
        class="mb-4 flex h-12 w-12 items-center justify-center rounded-[13px]"
        style="background: var(--accent-soft); color: var(--accent-soft-ink)"
      >
        <Icon name="agent" :size="24" />
      </div>
      <h2 class="m-0 mb-[6px] text-[18px] font-bold" style="letter-spacing: -0.01em">{{ t('agentsUi.disabled.title') }}</h2>
      <p class="m-0 mb-5 max-w-[620px] text-[13.5px] leading-[1.55]" style="color: var(--ink-2)">
        {{ t('agentsUi.disabled.body') }}
      </p>
      <div class="mb-2 text-[13px] font-semibold" style="color: var(--ink-2)">{{ t('agentsUi.disabled.howTo') }}</div>
      <div class="max-w-[420px]">
        <CodeSnippet code="MCP_ENABLED=true" filename="workspace-api" />
      </div>
      <div class="mt-3 text-[12.5px]" style="color: var(--ink-3)">{{ t('agentsUi.disabled.hosted') }}</div>
    </div>

    <template v-else>
      <!-- One-time secret -->
      <div
        v-if="secret"
        data-testid="agents-secret"
        class="mb-[18px] rounded-2xl p-[22px]"
        style="background: var(--surface); border: 1.5px solid var(--clay); box-shadow: var(--shadow-lg)"
      >
        <div class="mb-[6px] flex items-center gap-[10px]">
          <div
            class="flex h-[30px] w-[30px] items-center justify-center rounded-full"
            style="background: var(--clay-soft); color: var(--clay)"
          >
            <Icon name="lock" :size="17" />
          </div>
          <span class="text-[16px] font-bold">{{ t('agentsUi.reveal.title') }}</span>
        </div>
        <div
          class="my-[10px] mb-4 flex items-center gap-[9px] rounded-[10px] px-[13px] py-[10px] text-[13px] font-semibold"
          style="color: var(--clay-soft-ink); background: var(--clay-soft)"
        >
          <Icon name="danger" :size="16" :style="{ flex: 'none' }" />
          <span>{{ t('agentsUi.reveal.warning') }}</span>
        </div>
        <div class="grid items-center gap-[10px]" style="grid-template-columns: 70px 1fr auto">
          <span class="text-[12.5px] font-semibold" style="color: var(--ink-3)">{{ t('agentsUi.reveal.token') }}</span>
          <span
            data-testid="agents-secret-value"
            class="overflow-hidden text-ellipsis whitespace-nowrap rounded-lg px-[11px] py-2 font-mono text-[13px]"
            style="color: var(--ink); background: var(--inset)"
            >{{ secret }}</span
          >
          <CopyButton :value="secret" :size="34" />
        </div>
        <button
          class="mt-[18px] h-[38px] cursor-pointer rounded-[10px] border-none px-4 text-[13px] font-semibold"
          style="background: var(--accent); color: var(--accent-ink)"
          @click="dismissSecret"
        >
          {{ t('agentsUi.reveal.dismiss') }}
        </button>
      </div>

      <!-- Connect -->
      <section
        class="mb-[18px] rounded-2xl p-[22px]"
        style="background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow)"
      >
        <h2 class="m-0 mb-2 text-[16px] font-bold">{{ t('agentsUi.connect.title') }}</h2>
        <p class="m-0 mb-4 text-[13.5px] leading-[1.6]" style="color: var(--ink-2)">{{ t('agentsUi.connect.body') }}</p>

        <div class="mb-4 grid items-center gap-[10px]" style="grid-template-columns: 70px 1fr auto">
          <span class="text-[12.5px] font-semibold" style="color: var(--ink-3)">{{ t('agentsUi.connect.endpoint') }}</span>
          <span
            data-testid="agents-endpoint"
            class="overflow-hidden text-ellipsis whitespace-nowrap rounded-lg px-[11px] py-2 font-mono text-[13px]"
            style="color: var(--ink); background: var(--inset)"
            >{{ endpoint }}</span
          >
          <CopyButton :value="endpoint" :size="34" />
        </div>

        <div class="mb-3 flex">
          <Segmented v-model="client" :options="clientOptions" />
        </div>
        <div data-testid="agents-snippet">
          <CodeSnippet :code="snippet" :filename="clientSnippetFile(client)" />
        </div>
        <div class="mt-2 text-[12.5px] leading-[1.5]" style="color: var(--ink-3)">
          {{ t(`agentsUi.connect.hints.${client}`) }}
        </div>
        <div
          class="mt-3 flex items-start gap-2 rounded-[10px] px-3 py-[9px] text-[12.5px] leading-[1.5]"
          :style="secret
            ? { background: 'var(--clay-soft)', color: 'var(--clay-soft-ink)' }
            : { background: 'var(--info-soft)', color: 'var(--info-ink)' }"
        >
          <Icon :name="secret ? 'danger' : 'info'" :size="15" :style="{ flex: 'none', marginTop: '1px' }" />
          <span v-if="secret">{{ t('agentsUi.connect.tokenFilled') }}</span>
          <span v-else>{{ t('agentsUi.connect.needToken', { placeholder: TOKEN_PLACEHOLDER }) }}</span>
        </div>
      </section>

      <!-- Tokens -->
      <section
        class="mb-[18px] overflow-hidden rounded-2xl"
        style="background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow)"
      >
        <div class="flex items-end justify-between gap-5 px-[22px] pb-4 pt-[20px]">
          <div>
            <h2 class="m-0 mb-1 text-[16px] font-bold">{{ t('agentsUi.tokens.title') }}</h2>
            <div class="text-[13px]" style="color: var(--ink-2)">{{ t('agentsUi.tokens.intro') }}</div>
          </div>
          <button
            v-if="!creating"
            class="flex h-10 flex-none cursor-pointer items-center gap-[7px] rounded-[10px] border-none px-4 text-[13.5px] font-semibold"
            style="background: var(--accent); color: var(--accent-ink); box-shadow: var(--shadow)"
            @click="startCreate"
          >
            <Icon name="plus" :size="16" />
            {{ t('agentsUi.tokens.new') }}
          </button>
        </div>

        <!-- create form -->
        <form
          v-if="creating"
          data-testid="agents-create"
          class="mx-[22px] mb-5 rounded-xl p-[18px]"
          style="background: var(--surface-2); border: 1px solid var(--line)"
          novalidate
          @submit.prevent="submit"
        >
          <h3 class="m-0 mb-4 text-[14.5px] font-bold">{{ t('agentsUi.form.title') }}</h3>

          <label for="agent-token-name" class="mb-[6px] block text-[12.5px] font-semibold" style="color: var(--ink-2)">{{
            t('agentsUi.form.name')
          }}</label>
          <input
            id="agent-token-name"
            ref="nameInput"
            v-model="form.name"
            type="text"
            :maxlength="MAX_NAME_LENGTH + 20"
            :placeholder="t('agentsUi.form.namePlaceholder')"
            :aria-invalid="!!errors.name"
            class="h-10 w-full max-w-[420px] rounded-[10px] px-[13px] text-[13.5px] outline-none"
            :style="{ border: `1px solid ${errors.name ? 'var(--err)' : 'var(--line)'}`, background: 'var(--surface)', color: 'var(--ink)' }"
          />
          <div class="mt-1 text-[12px]" :style="{ color: errors.name ? 'var(--err)' : 'var(--ink-3)' }">
            {{ errors.name || t('agentsUi.form.nameHint') }}
          </div>

          <div class="mb-[6px] mt-4 text-[12.5px] font-semibold" style="color: var(--ink-2)">{{ t('agentsUi.form.access') }}</div>
          <div role="radiogroup" :aria-label="t('agentsUi.form.access')" class="grid gap-[10px]" style="grid-template-columns: 1fr 1fr">
            <label
              v-for="opt in (['read', 'operate'] as const)"
              :key="opt"
              class="flex cursor-pointer gap-[10px] rounded-[11px] p-[13px]"
              :style="{
                background: 'var(--surface)',
                border: `1.5px solid ${form.access === opt ? 'var(--accent)' : 'var(--line)'}`,
              }"
            >
              <input v-model="form.access" type="radio" name="agent-token-access" :value="opt" class="mt-[3px] flex-none self-start accent-[var(--accent)]" />
              <span>
                <span class="block text-[13.5px] font-semibold">{{
                  t(opt === 'read' ? 'agentsUi.form.accessRead' : 'agentsUi.form.accessOperate')
                }}</span>
                <span class="mt-[3px] block text-[12.5px] leading-[1.45]" style="color: var(--ink-3)">{{
                  t(opt === 'read' ? 'agentsUi.form.accessReadHint' : 'agentsUi.form.accessOperateHint')
                }}</span>
              </span>
            </label>
          </div>
          <div v-if="errors.scopes" class="mt-1 text-[12px]" style="color: var(--err)">{{ errors.scopes }}</div>

          <div class="mb-[6px] mt-4 text-[12.5px] font-semibold" style="color: var(--ink-2)">{{ t('agentsUi.form.expiry') }}</div>
          <div class="inline-block">
            <Segmented v-model="expiryModel" :options="expiryOptions" />
          </div>
          <div v-if="errors.expiresInDays" class="mt-1 text-[12px]" style="color: var(--err)">{{ errors.expiresInDays }}</div>

          <p v-if="formError" class="mb-0 mt-3 text-[13px]" style="color: var(--err)">{{ formError }}</p>

          <div class="mt-[18px] flex gap-[10px]">
            <button
              type="submit"
              class="flex h-[38px] cursor-pointer items-center gap-2 rounded-[10px] border-none px-4 text-[13px] font-semibold disabled:opacity-60"
              style="background: var(--accent); color: var(--accent-ink)"
              :disabled="submitting"
            >
              <Spinner v-if="submitting" :size="14" />
              {{ submitting ? t('agentsUi.form.creating') : t('agentsUi.form.create') }}
            </button>
            <button
              type="button"
              class="h-[38px] cursor-pointer rounded-[10px] bg-transparent px-[14px] text-[13px] font-semibold"
              style="border: 1px solid var(--line); color: var(--ink-2)"
              :disabled="submitting"
              @click="cancelCreate"
            >
              {{ t('agentsUi.form.cancel') }}
            </button>
          </div>
        </form>

        <!-- list -->
        <div
          class="grid gap-[14px] px-[22px] py-[10px] text-[11.5px] font-bold uppercase"
          style="
            grid-template-columns: 2fr 1.1fr 0.9fr 1fr 1fr 76px;
            border-top: 1px solid var(--line);
            border-bottom: 1px solid var(--line);
            letter-spacing: 0.04em;
            color: var(--ink-3);
          "
        >
          <div>{{ t('agentsUi.tokens.cols.name') }}</div>
          <div>{{ t('agentsUi.tokens.cols.scopes') }}</div>
          <div>{{ t('agentsUi.tokens.cols.created') }}</div>
          <div>{{ t('agentsUi.tokens.cols.expires') }}</div>
          <div>{{ t('agentsUi.tokens.cols.lastUsed') }}</div>
          <div></div>
        </div>

        <div v-if="tokens.length === 0" class="px-[22px] py-10 text-center text-[13px]" style="color: var(--ink-3)">
          {{ t('agentsUi.tokens.empty') }}
        </div>
        <div
          v-for="tok in sorted"
          v-else
          :key="tok.id"
          data-testid="agents-token-row"
          :data-state="rowState(tok)"
          class="grid items-center gap-[14px] px-[22px] py-[13px]"
          style="grid-template-columns: 2fr 1.1fr 0.9fr 1fr 1fr 76px; border-top: 1px solid var(--line-2)"
        >
          <div class="flex min-w-0 items-center gap-[10px]" :style="{ opacity: rowState(tok) === 'revoked' || rowState(tok) === 'expired' ? 0.6 : 1 }">
            <div
              class="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg"
              style="background: var(--surface-2); border: 1px solid var(--line); color: var(--ink-3)"
            >
              <Icon name="agent" :size="15" />
            </div>
            <div class="min-w-0">
              <div class="truncate text-[13.5px] font-semibold" :title="tok.name">{{ tok.name }}</div>
              <div class="truncate font-mono text-[11.5px]" style="color: var(--ink-3)">{{ tok.prefix }}…</div>
            </div>
          </div>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="s in tok.scopes"
              :key="s"
              class="rounded-full px-[9px] py-[2px] text-[11.5px] font-bold"
              :style="s === 'workspace:write'
                ? { background: 'var(--clay-soft)', color: 'var(--clay-soft-ink)' }
                : { background: 'var(--info-soft)', color: 'var(--info-ink)' }"
              :title="s"
              >{{ scopeLabel(s) }}</span
            >
          </div>
          <div class="text-[12.5px]" style="color: var(--ink-2)" :title="tok.createdAt">{{ formatDate(tok.createdAt) }}</div>
          <div class="min-w-0">
            <span
              v-if="rowState(tok) === 'revoked'"
              class="rounded-full px-[9px] py-[2px] text-[11.5px] font-bold"
              style="background: var(--surface-2); color: var(--ink-3); border: 1px solid var(--line)"
              :title="tok.revokedAt"
              >{{ t('agentsUi.tokens.revoked') }}</span
            >
            <span
              v-else-if="rowState(tok) === 'expired'"
              class="rounded-full px-[9px] py-[2px] text-[11.5px] font-bold"
              style="background: var(--err-soft); color: var(--err-ink)"
              :title="tok.expiresAt"
              >{{ t('agentsUi.tokens.expired') }}</span
            >
            <span
              v-else-if="rowState(tok) === 'expiring'"
              data-testid="agents-expiring"
              class="rounded-full px-[9px] py-[2px] text-[11.5px] font-bold"
              style="background: var(--warn-soft); color: var(--warn-ink)"
              :title="formatDate(tok.expiresAt)"
              >{{ t('agentsUi.tokens.expiresIn', daysLeft(tok.expiresAt, now)) }}</span
            >
            <span v-else class="text-[12.5px]" style="color: var(--ink-2)" :title="tok.expiresAt">{{ formatDate(tok.expiresAt) }}</span>
          </div>
          <div class="truncate text-[12.5px]" style="color: var(--ink-3)" :title="tok.lastUsedAt">
            {{ tok.lastUsedAt ? formatRelative(tok.lastUsedAt, now, locale) : t('agentsUi.tokens.neverUsed') }}
          </div>
          <div class="flex justify-end">
            <button
              v-if="rowState(tok) === 'active' || rowState(tok) === 'expiring'"
              type="button"
              class="flex h-[30px] cursor-pointer items-center gap-1.5 rounded-lg bg-transparent px-2.5 text-[12.5px] font-semibold disabled:opacity-50"
              style="border: 1px solid var(--line); color: var(--err)"
              :disabled="revoking === tok.id"
              @click="revoke(tok)"
            >
              <Spinner v-if="revoking === tok.id" :size="12" />
              {{ t('agentsUi.tokens.revoke') }}
            </button>
          </div>
        </div>
      </section>
    </template>

    <!-- What the agent can do + prompts + safety (also shown when disabled: it is what the operator would be turning on) -->
    <div v-if="!loading" class="grid gap-[18px]" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))">
      <section
        data-testid="agents-capabilities"
        class="rounded-2xl p-[22px]"
        style="background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow)"
      >
        <h2 class="m-0 mb-3 text-[16px] font-bold">{{ t('agentsUi.can.title') }}</h2>
        <div v-for="group in capabilityGroups" :key="group.scope" class="mb-4">
          <div class="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase" style="letter-spacing: 0.04em; color: var(--ink-3)">
            <span
              class="rounded-full px-[9px] py-[2px] text-[11px] normal-case"
              :style="group.scope === 'write'
                ? { background: 'var(--clay-soft)', color: 'var(--clay-soft-ink)', letterSpacing: 0 }
                : { background: 'var(--info-soft)', color: 'var(--info-ink)', letterSpacing: 0 }"
              >{{ group.scope }}</span
            >
            {{ t(group.scope === 'read' ? 'agentsUi.can.read' : 'agentsUi.can.write') }}
          </div>
          <ul class="m-0 list-none p-0">
            <li
              v-for="c in group.items"
              :key="c.key"
              class="flex gap-2 py-[3px] text-[13px] leading-[1.45]"
              :title="t('agentsUi.can.tools', { tools: c.tools.join(', ') })"
            >
              <Icon name="check" :size="14" :style="{ flex: 'none', marginTop: '2px', color: 'var(--ok)' }" />
              <span>{{ t(`agentsUi.can.items.${c.key}`) }}</span>
            </li>
          </ul>
        </div>
        <div class="text-[12.5px] leading-[1.5]" style="color: var(--ink-3)">{{ t('agentsUi.can.never') }}</div>
      </section>

      <div class="flex flex-col gap-[18px]">
        <section
          class="rounded-2xl p-[22px]"
          style="background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow)"
        >
          <h2 class="m-0 mb-3 text-[16px] font-bold">{{ t('agentsUi.prompts.title') }}</h2>
          <div
            v-for="p in PROMPTS"
            :key="p"
            class="mb-2 flex items-center gap-2 rounded-[10px] py-[7px] pl-3 pr-[6px] last:mb-0"
            style="background: var(--inset)"
          >
            <span class="flex-1 text-[13px] leading-[1.45]" style="color: var(--ink)">{{ t(`agentsUi.prompts.items.${p}`) }}</span>
            <CopyButton :value="t(`agentsUi.prompts.items.${p}`)" :size="28" />
          </div>
        </section>

        <section
          data-testid="agents-safety"
          class="rounded-2xl p-[22px]"
          style="background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow)"
        >
          <h2 class="m-0 mb-3 flex items-center gap-2 text-[16px] font-bold">
            <Icon name="lock" :size="16" :style="{ color: 'var(--ink-3)' }" />{{ t('agentsUi.safety.title') }}
          </h2>
          <ul class="m-0 flex list-none flex-col gap-2 p-0 text-[13px] leading-[1.5]" style="color: var(--ink-2)">
            <li>{{ t('agentsUi.safety.actsAsYou') }}</li>
            <li>{{ t('agentsUi.safety.injection') }}</li>
            <li>{{ t('agentsUi.safety.revoke') }}</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
