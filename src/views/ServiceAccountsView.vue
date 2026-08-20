<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { lakekeeperUserClient, warehouseClient } from '../api'
import { errorMessage } from '../api/errors'
import Icon from '../components/ui/Icon.vue'
import CopyButton from '../components/ui/CopyButton.vue'
import Spinner from '../components/ui/Spinner.vue'
import { useConfirm } from '../composables/useConfirm'
import { useToast } from '../composables/useToast'

type Role = 'reader' | 'writer' | 'admin'

interface ServiceAccount {
  id: string
  name: string
  role: string
  warehouse: string
}

interface CreatedCredentials {
  clientId: string
  clientSecret: string
}

const { t } = useI18n()
const { confirm } = useConfirm()
const toast = useToast()

// Casdoor username rules (ported from ServiceAccountManager.vue)
const usernameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$/
const consecutiveRegex = /[-_]{2}/

const accounts = ref<ServiceAccount[]>([])
const warehouses = ref<string[]>([])
const loading = ref(true)
const creating = ref(false)
const submitting = ref(false)
const deletingId = ref<string | null>(null)
const formError = ref('')
const result = ref<CreatedCredentials | null>(null)

const form = reactive({
  name: '',
  role: 'writer' as Role,
  warehouseName: 'default',
})

// Role chip colours, ported from the design's roleChip.
const roleStyles: Record<string, { bg: string; fg: string }> = {
  admin: { bg: 'var(--clay-soft)', fg: 'var(--clay-soft-ink)' },
  writer: { bg: 'var(--accent-soft)', fg: 'var(--accent-soft-ink)' },
  reader: { bg: 'var(--info-soft)', fg: 'var(--info-soft-ink)' },
}

function roleStyle(role: string): { background: string; color: string } {
  const s = roleStyles[role] ?? { bg: 'var(--surface-2)', fg: 'var(--ink-2)' }
  return { background: s.bg, color: s.fg }
}

async function loadAccounts() {
  loading.value = true
  try {
    const resp = await lakekeeperUserClient.listUsers({})
    accounts.value = resp.users.map((u) => ({ id: u.id, name: u.name, role: u.role, warehouse: u.warehouse }))
  } catch {
    toast.error(t('serviceAccounts.toast.loadError'))
  } finally {
    loading.value = false
  }
}

async function loadWarehouses() {
  try {
    const resp = await warehouseClient.listWarehouses({})
    const names = resp.warehouses.map((w) => w.name)
    warehouses.value = names.length > 0 ? names : ['default']
  } catch {
    warehouses.value = ['default']
  }
  if (!warehouses.value.includes(form.warehouseName)) {
    form.warehouseName = warehouses.value[0] ?? 'default'
  }
}

onMounted(() => {
  void loadAccounts()
  void loadWarehouses()
})

function startCreate() {
  result.value = null
  formError.value = ''
  form.name = ''
  form.role = 'writer'
  form.warehouseName = warehouses.value[0] ?? 'default'
  creating.value = true
}

function cancelCreate() {
  creating.value = false
  formError.value = ''
}

async function confirmCreate() {
  formError.value = ''
  const name = form.name.trim()

  if (!name) {
    formError.value = t('serviceAccounts.validation.required')
    return
  }
  if (!usernameRegex.test(name) || consecutiveRegex.test(name)) {
    formError.value = t('serviceAccounts.validation.invalidName')
    return
  }
  if (accounts.value.some((a) => a.name === name)) {
    formError.value = t('serviceAccounts.validation.duplicate')
    return
  }

  submitting.value = true
  try {
    const resp = await lakekeeperUserClient.addUser({
      name,
      role: form.role,
      warehouseName: form.warehouseName,
    })
    result.value = { clientId: resp.clientId, clientSecret: resp.clientSecret }
    creating.value = false
    toast.success(t('serviceAccounts.toast.created'))
    await loadAccounts()
  } catch (err) {
    formError.value = errorMessage(err, t('serviceAccounts.toast.createError'))
  } finally {
    submitting.value = false
  }
}

function dismissResult() {
  result.value = null
}

async function deleteAccount(account: ServiceAccount) {
  const ok = await confirm({
    title: t('serviceAccounts.confirmDelete.title'),
    body: t('serviceAccounts.confirmDelete.body', { name: account.name }),
    confirmLabel: t('serviceAccounts.confirmDelete.confirm'),
    danger: true,
  })
  if (!ok) return

  deletingId.value = account.id
  try {
    await lakekeeperUserClient.removeUser({ userId: account.id })
    toast.success(t('serviceAccounts.toast.deleted'))
    await loadAccounts()
  } catch (err) {
    toast.error(errorMessage(err, t('serviceAccounts.toast.deleteError')))
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="mx-auto px-[34px] pb-20 pt-[34px]" style="max-width: 880px">
    <!-- header -->
    <div class="mb-[22px] flex items-end justify-between gap-5">
      <div>
        <h1 class="m-0 mb-[5px] text-[25px] font-bold" style="letter-spacing: -0.02em">
          {{ t('serviceAccounts.title') }}
        </h1>
        <div class="text-[13.5px]" style="color: var(--ink-2)">{{ t('serviceAccounts.intro') }}</div>
      </div>
      <button
        class="flex h-10 cursor-pointer items-center gap-[7px] rounded-[10px] border-none px-4 text-[13.5px] font-semibold"
        style="background: var(--accent); color: var(--accent-ink); box-shadow: var(--shadow)"
        @click="startCreate"
      >
        <Icon name="plus" :size="16" />
        {{ t('serviceAccounts.newAccount') }}
      </button>
    </div>

    <!-- secret-once result -->
    <div
      v-if="result"
      class="mb-[18px] rounded-2xl p-[22px]"
      style="
        background: var(--surface);
        border: 1.5px solid var(--clay);
        box-shadow: var(--shadow-lg);
      "
    >
      <div class="mb-[6px] flex items-center gap-[10px]">
        <div
          class="flex h-[30px] w-[30px] items-center justify-center rounded-full"
          style="background: var(--clay-soft); color: var(--clay)"
        >
          <Icon name="lock" :size="17" />
        </div>
        <span class="text-[16px] font-bold">{{ t('serviceAccounts.result.title') }}</span>
      </div>
      <div
        class="my-[10px] mb-4 flex items-center gap-[9px] rounded-[10px] px-[13px] py-[10px] text-[13px]"
        style="color: var(--clay-soft-ink); background: var(--clay-soft)"
      >
        <Icon name="danger" :size="16" :style="{ flex: 'none' }" />
        <span>{{ t('serviceAccounts.result.warning') }}</span>
      </div>

      <div class="mb-[9px] grid items-center gap-[10px]" style="grid-template-columns: 120px 1fr auto">
        <span class="text-[12.5px] font-semibold" style="color: var(--ink-3)">{{
          t('serviceAccounts.result.clientId')
        }}</span>
        <span
          class="overflow-hidden text-ellipsis whitespace-nowrap rounded-lg px-[11px] py-2 font-mono text-[13px]"
          style="color: var(--ink); background: var(--inset)"
          >{{ result.clientId }}</span
        >
        <CopyButton :value="result.clientId" :size="34" />
      </div>
      <div class="grid items-center gap-[10px]" style="grid-template-columns: 120px 1fr auto">
        <span class="text-[12.5px] font-semibold" style="color: var(--ink-3)">{{
          t('serviceAccounts.result.clientSecret')
        }}</span>
        <span
          class="overflow-hidden text-ellipsis whitespace-nowrap rounded-lg px-[11px] py-2 font-mono text-[13px]"
          style="color: var(--ink); background: var(--inset)"
          >{{ result.clientSecret }}</span
        >
        <CopyButton :value="result.clientSecret" :size="34" />
      </div>

      <div class="mt-3 text-[12.5px]" style="color: var(--ink-2)">
        {{ t('serviceAccounts.result.activation') }}
      </div>

      <button
        class="mt-[18px] h-[38px] cursor-pointer rounded-[10px] border-none px-4 text-[13px] font-semibold"
        style="background: var(--accent); color: var(--accent-ink)"
        @click="dismissResult"
      >
        {{ t('serviceAccounts.result.dismiss') }}
      </button>
    </div>

    <!-- create form -->
    <div
      v-if="creating"
      class="mb-[18px] rounded-2xl p-[22px]"
      style="background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow)"
    >
      <h2 class="m-0 mb-4 text-[16px] font-bold">{{ t('serviceAccounts.form.title') }}</h2>
      <div class="grid items-end gap-[14px]" style="grid-template-columns: 2fr 1fr 1fr">
        <div>
          <label class="mb-[6px] block text-[12.5px] font-semibold" style="color: var(--ink-2)">{{
            t('serviceAccounts.form.name')
          }}</label>
          <input
            v-model="form.name"
            type="text"
            :placeholder="t('serviceAccounts.form.namePlaceholder')"
            class="h-10 w-full rounded-[10px] px-[13px] font-mono text-[13px] outline-none"
            style="border: 1px solid var(--line); background: var(--surface-2); color: var(--ink)"
            @keyup.enter="confirmCreate"
          />
        </div>
        <div>
          <label class="mb-[6px] block text-[12.5px] font-semibold" style="color: var(--ink-2)">{{
            t('serviceAccounts.form.role')
          }}</label>
          <div class="relative">
            <select
              v-model="form.role"
              class="h-10 w-full cursor-pointer appearance-none rounded-[10px] px-[13px] text-[14px] outline-none"
              style="border: 1px solid var(--line); background: var(--surface-2); color: var(--ink)"
            >
              <option value="reader">{{ t('serviceAccounts.roles.reader') }}</option>
              <option value="writer">{{ t('serviceAccounts.roles.writer') }}</option>
              <option value="admin">{{ t('serviceAccounts.roles.admin') }}</option>
            </select>
            <Icon
              name="chevronDown"
              :size="15"
              class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
              :style="{ color: 'var(--ink-3)' }"
            />
          </div>
        </div>
        <div>
          <label class="mb-[6px] block text-[12.5px] font-semibold" style="color: var(--ink-2)">{{
            t('serviceAccounts.form.warehouse')
          }}</label>
          <div class="relative">
            <select
              v-model="form.warehouseName"
              class="h-10 w-full cursor-pointer appearance-none rounded-[10px] px-[13px] text-[14px] outline-none"
              style="border: 1px solid var(--line); background: var(--surface-2); color: var(--ink)"
            >
              <option v-for="w in warehouses" :key="w" :value="w">{{ w }}</option>
            </select>
            <Icon
              name="chevronDown"
              :size="15"
              class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
              :style="{ color: 'var(--ink-3)' }"
            />
          </div>
        </div>
      </div>

      <p v-if="formError" class="mt-2 text-[13px]" style="color: var(--err)">{{ formError }}</p>

      <div class="mt-[18px] flex gap-[10px]">
        <button
          class="flex h-[38px] cursor-pointer items-center gap-2 rounded-[10px] border-none px-4 text-[13px] font-semibold disabled:opacity-60"
          style="background: var(--accent); color: var(--accent-ink)"
          :disabled="submitting"
          @click="confirmCreate"
        >
          <Spinner v-if="submitting" :size="14" />
          {{ submitting ? t('serviceAccounts.form.creating') : t('serviceAccounts.form.create') }}
        </button>
        <button
          class="h-[38px] cursor-pointer rounded-[10px] bg-transparent px-[14px] text-[13px] font-semibold"
          style="border: 1px solid var(--line); color: var(--ink-2)"
          :disabled="submitting"
          @click="cancelCreate"
        >
          {{ t('serviceAccounts.form.cancel') }}
        </button>
      </div>
    </div>

    <!-- list -->
    <div
      class="overflow-hidden rounded-2xl"
      style="background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow)"
    >
      <div
        class="grid gap-[14px] px-5 py-[11px] text-[11.5px] font-bold uppercase"
        style="
          grid-template-columns: 2fr 1fr 1fr 40px;
          border-bottom: 1px solid var(--line);
          letter-spacing: 0.04em;
          color: var(--ink-3);
        "
      >
        <div>{{ t('serviceAccounts.table.name') }}</div>
        <div>{{ t('serviceAccounts.table.role') }}</div>
        <div>{{ t('serviceAccounts.table.warehouse') }}</div>
        <div></div>
      </div>

      <!-- loading -->
      <div
        v-if="loading"
        class="flex items-center justify-center gap-2 px-5 py-10 text-[13px]"
        style="color: var(--ink-3)"
      >
        <Spinner :size="16" />
        {{ t('serviceAccounts.loading') }}
      </div>

      <!-- empty -->
      <div
        v-else-if="accounts.length === 0"
        class="px-5 py-10 text-center text-[13px]"
        style="color: var(--ink-3)"
      >
        {{ t('serviceAccounts.empty') }}
      </div>

      <!-- rows -->
      <template v-else>
        <div
          v-for="s in accounts"
          :key="s.id"
          class="grid items-center gap-[14px] px-5 py-[13px]"
          style="grid-template-columns: 2fr 1fr 1fr 40px; border-top: 1px solid var(--line-2)"
        >
          <div class="flex items-center gap-[10px]">
            <div
              class="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg"
              style="background: var(--surface-2); border: 1px solid var(--line); color: var(--ink-3)"
            >
              <Icon name="lock" :size="15" />
            </div>
            <span class="font-mono text-[13px] font-medium">{{ s.name }}</span>
          </div>
          <div>
            <span
              class="rounded-full px-[10px] py-[3px] text-[11.5px] font-bold"
              :style="roleStyle(s.role)"
              >{{ s.role || '—' }}</span
            >
          </div>
          <div class="font-mono text-[12.5px]" style="color: var(--ink-2)">
            {{ s.warehouse || t('serviceAccounts.table.unknownWarehouse') }}
          </div>
          <button
            class="flex h-[30px] w-[30px] items-center justify-center rounded-lg border-none bg-transparent disabled:opacity-50"
            :class="deletingId === s.id ? '' : 'cursor-pointer'"
            style="color: var(--ink-3)"
            :title="t('serviceAccounts.table.delete')"
            :disabled="deletingId === s.id"
            @click="deleteAccount(s)"
          >
            <Spinner v-if="deletingId === s.id" :size="15" />
            <Icon v-else name="trash" :size="15" />
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
