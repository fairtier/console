<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../stores/workspace'
import { runtimeConfig } from '../config/runtime'
import { warehouseClient } from '../api'
import { errorMessage } from '../api/errors'
import type { Warehouse } from '../api/gen/warehouse_pb'
import type { S3Config } from '../api/gen/warehouse_pb'
import { StorageProvider, CredentialDelegationMode } from '../api/gen/warehouse_pb'
import { useToast } from '../composables/useToast'
import Icon from '../components/ui/Icon.vue'
import Select from '../components/ui/Select.vue'
import SecretField from '../components/ui/SecretField.vue'
import CodeSnippet from '../components/ui/CodeSnippet.vue'
import Spinner from '../components/ui/Spinner.vue'

const { t } = useI18n()
const customerStore = useWorkspaceStore()
const toast = useToast()

const loading = ref(true)
const loadError = ref(false)
const warehouses = ref<Warehouse[]>([])

const whCreating = ref(false)
const whName = ref('')
const creating = ref(false)

// --- B6: optional per-warehouse custom storage. When the advanced section is
// left collapsed, the warehouse inherits the workspace's effective storage.
type WhProvider = 'cloudflare-r2' | 'aws' | 's3-compat'
const whAdvanced = ref(false)
const whStorage = ref({
    provider: 'cloudflare-r2' as WhProvider,
    bucket: '',
    region: '',
    endpoint: '',
    cloudflareAccountId: '',
    accessKeyId: '',
    secretAccessKey: '',
    credMode: 'vended' as 'vended' | 'remote-signing' | 'none',
})

const whProviderOptions: { value: WhProvider; label: string }[] = [
    { value: 'cloudflare-r2', label: t('catalog.warehouses.advanced.providerR2') },
    { value: 'aws', label: t('catalog.warehouses.advanced.providerAWS') },
    { value: 's3-compat', label: t('catalog.warehouses.advanced.providerS3Compat') },
]
const whCredModeOptions: { value: 'vended' | 'remote-signing' | 'none'; label: string }[] = [
    { value: 'vended', label: t('storage.form.credModeVended') },
    { value: 'remote-signing', label: t('storage.form.credModeRemoteSigning') },
    { value: 'none', label: t('storage.form.credModeNone') },
]

const whProviderToProto: Record<WhProvider, StorageProvider> = {
    'cloudflare-r2': StorageProvider.CLOUDFLARE_R2,
    'aws': StorageProvider.AWS,
    's3-compat': StorageProvider.S3_COMPAT,
}
const whCredModeToProto: Record<string, CredentialDelegationMode> = {
    'vended': CredentialDelegationMode.VENDED,
    'remote-signing': CredentialDelegationMode.REMOTE_SIGNING,
    'none': CredentialDelegationMode.NONE,
}

const whIsR2 = computed(() => whStorage.value.provider === 'cloudflare-r2')
const whIsS3Compat = computed(() => whStorage.value.provider === 's3-compat')

// Minimum fields needed before the advanced storage config is submittable.
const whStorageValid = computed(() => {
    if (!whAdvanced.value) return true
    const s = whStorage.value
    if (!s.bucket.trim() || !s.accessKeyId.trim() || !s.secretAccessKey.trim()) return false
    if (whIsR2.value && !s.cloudflareAccountId.trim()) return false
    if (whIsS3Compat.value && !s.endpoint.trim()) return false
    if (!whIsR2.value && !s.region.trim()) return false
    return true
})

function resetWhStorage() {
    whAdvanced.value = false
    whStorage.value = {
        provider: 'cloudflare-r2',
        bucket: '',
        region: '',
        endpoint: '',
        cloudflareAccountId: '',
        accessKeyId: '',
        secretAccessKey: '',
        credMode: 'vended',
    }
}

function buildWhS3(): S3Config {
    const s = whStorage.value
    return {
        bucket: s.bucket.trim(),
        keyPrefix: '',
        endpoint: s.endpoint.trim(),
        region: s.region.trim(),
        accessKeyId: s.accessKeyId.trim(),
        secretAccessKey: s.secretAccessKey,
        cloudflareAccountId: whIsR2.value ? s.cloudflareAccountId.trim() : '',
        cloudflareApiToken: '',
        credentialDelegationMode: whCredModeToProto[s.credMode] ?? CredentialDelegationMode.VENDED,
        storageProvider: whProviderToProto[s.provider],
        assumeRoleArn: '',
        storageMode: 'custom',
    } as S3Config
}

const conn = computed(() => customerStore.connectionDetails)

// --- connection snippet strings ---
const catalogUrl = computed(() => conn.value?.lakekeeperUrl ?? '')
const warehouseName = computed(() => conn.value?.lakekeeperWarehouse ?? '')
// The bootstrap document may not carry the catalog endpoint (see
// stores/workspace.ts); without it the connection card and the connect
// snippets would render blank fields, so both fall back to their
// "not ready" branches instead.
const connReady = computed(() => !!catalogUrl.value && !!warehouseName.value)
// The OAuth token endpoint is the workspace Casdoor's — derived from the
// runtime config rather than delivered by anyone.
const tokenEndpoint = computed(() => {
    const auth = runtimeConfig().authUrl
    return auth ? `${auth}/api/login/oauth/access_token` : ''
})

const duckdbSnippet = computed(() =>
    `INSTALL iceberg;
LOAD iceberg;

CREATE SECRET iceberg_secret (
    TYPE iceberg,
    TOKEN 'YOUR_TOKEN'
);

ATTACH '${warehouseName.value}' AS iceberg_catalog (
    TYPE iceberg,
    SECRET iceberg_secret,
    ENDPOINT '${catalogUrl.value}/catalog'
);`,
)

const pythonSnippet = computed(() =>
    `import os
from pyiceberg.catalog.rest import RestCatalog
from pyiceberg.io.pyarrow import PyArrowFileIO

catalog = RestCatalog(
    name="fairtier",
    uri="${catalogUrl.value}/catalog",
    warehouse="${warehouseName.value}",
    credential="YOUR_CLIENT_ID:YOUR_CLIENT_SECRET",
    **{"oauth2-server-uri": "${tokenEndpoint.value}"},
)`,
)

const goSnippet = computed(() =>
    `package main

import (
	"context"
	"log"
	"net/url"

	"github.com/apache/iceberg-go/catalog/rest"
)

func main() {
	ctx := context.Background()
	authURL, _ := url.Parse("${tokenEndpoint.value}")

	cat, err := rest.NewCatalog(ctx, "fairtier",
		"${catalogUrl.value}/catalog",
		rest.WithAuthURI(authURL),
		rest.WithCredential("YOUR_CLIENT_ID:YOUR_CLIENT_SECRET"),
		rest.WithWarehouseLocation("${warehouseName.value}"),
	)
	if err != nil {
		log.Fatal(err)
	}
	_ = cat
}`,
)

type Tab = 'duckdb' | 'python' | 'go'
const activeTab = ref<Tab>('duckdb')

const snippet = computed(() => {
    switch (activeTab.value) {
        case 'python':
            return { code: pythonSnippet.value, file: 'connect.py' }
        case 'go':
            return { code: goSnippet.value, file: 'main.go' }
        default:
            return { code: duckdbSnippet.value, file: 'connect.sql' }
    }
})

function tabStyle(tab: Tab) {
    const on = activeTab.value === tab
    return {
        border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
        background: on ? 'var(--accent-soft)' : 'var(--surface-2)',
        color: on ? 'var(--accent-soft-ink)' : 'var(--ink-2)',
    }
}

function toggleWhCreate() {
    whCreating.value = !whCreating.value
    if (!whCreating.value) {
        whName.value = ''
        resetWhStorage()
    }
}

async function createWarehouse() {
    const name = whName.value.trim()
    if (!name || creating.value || !whStorageValid.value) return
    creating.value = true
    try {
        await warehouseClient.createWarehouse({
            name,
            keyPrefix: name,
            // Omit s3 to inherit the workspace's effective storage.
            ...(whAdvanced.value ? { s3: buildWhS3() } : {}),
        })
        const resp = await warehouseClient.listWarehouses({})
        warehouses.value = resp.warehouses ?? []
        whName.value = ''
        whCreating.value = false
        resetWhStorage()
        toast.success(t('catalog.warehouses.created'))
    } catch (err) {
        toast.error(errorMessage(err, t('catalog.warehouses.createError')))
    } finally {
        creating.value = false
    }
}

onMounted(async () => {
    await customerStore.ensureLoaded()
    if (customerStore.isReady) {
        try {
            const resp = await warehouseClient.listWarehouses({})
            warehouses.value = resp.warehouses ?? []
        } catch {
            loadError.value = true
        }
    }
    loading.value = false
})
</script>

<template>
    <div class="mx-auto px-[34px] pb-20 pt-[34px]" style="max-width:1080px">
        <div class="mb-[22px]">
            <h1 class="m-0 mb-[5px] text-[25px] font-bold tracking-[-.02em]">{{ t('catalog.title') }}</h1>
            <div class="text-[13.5px] text-ink-2">{{ t('catalog.subtitle') }}</div>
        </div>

        <div v-if="loading" class="flex items-center justify-center py-24 text-ink-3">
            <Spinner :size="24" />
        </div>

        <template v-else>
            <!-- connection details -->
            <div class="mb-[18px] overflow-hidden rounded-2xl border" style="background:var(--surface); border-color:var(--line); box-shadow:var(--shadow)">
                <div class="flex items-center gap-[9px] p-[16px_20px_4px]">
                    <Icon name="link" :size="17" :style="{ color: 'var(--accent)' }" />
                    <div class="text-[15px] font-bold">{{ t('catalog.connection.title') }}</div>
                    <span class="ml-1.5 text-[11.5px] text-ink-3">{{ t('catalog.connection.hint') }}</span>
                </div>
                <div class="p-[12px_20px_18px]">
                    <template v-if="conn && connReady">
                        <SecretField :label="t('catalog.connection.catalogUrl')" :value="conn.lakekeeperUrl" />
                        <SecretField :label="t('catalog.connection.warehouse')" :value="conn.lakekeeperWarehouse" />
                        <SecretField v-if="conn.customerDomain" :label="t('catalog.connection.domain')" :value="conn.customerDomain" />
                        <SecretField v-if="tokenEndpoint" :label="t('catalog.connection.tokenEndpoint')" :value="tokenEndpoint" />
                    </template>
                    <div v-else class="text-[13px] text-ink-3">{{ t('catalog.connection.notReady') }}</div>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-[18px]">
                <!-- warehouses -->
                <div class="overflow-hidden rounded-2xl border" style="background:var(--surface); border-color:var(--line); box-shadow:var(--shadow)">
                    <div class="flex items-center justify-between p-[16px_18px_12px]">
                        <div class="text-[15px] font-bold">{{ t('catalog.warehouses.title') }}</div>
                        <button
                            type="button"
                            class="flex h-8 items-center gap-1.5 rounded-[9px] border bg-surface-2 px-[11px] text-[12.5px] font-semibold text-ink-2 hover:border-accent hover:text-accent"
                            style="border-color:var(--line)"
                            @click="toggleWhCreate"
                        >
                            <Icon name="plus" :size="14" />
                            {{ t('catalog.warehouses.create') }}
                        </button>
                    </div>

                    <div
                        v-if="whCreating"
                        class="mx-[18px] mb-[14px] rounded-xl border p-[14px]"
                        style="background:var(--surface-2); border-color:var(--line)"
                    >
                        <label class="mb-1.5 block text-[12px] font-semibold text-ink-2">{{ t('catalog.warehouses.nameLabel') }}</label>
                        <input
                            v-model="whName"
                            :placeholder="t('catalog.warehouses.namePlaceholder')"
                            class="h-[38px] w-full rounded-[9px] border px-3 font-mono text-[13px] text-ink outline-none focus:border-accent"
                            style="background:var(--surface); border-color:var(--line)"
                            @keyup.enter="createWarehouse"
                        />
                        <div class="mt-[7px] text-[11.5px] text-ink-3">{{ t('catalog.warehouses.nameHelp') }}</div>

                        <!-- B6: advanced per-warehouse custom storage -->
                        <button
                            type="button"
                            class="mt-3 flex items-center gap-1.5 text-[12px] font-semibold text-ink-2 hover:text-accent"
                            @click="whAdvanced = !whAdvanced"
                        >
                            <Icon :name="whAdvanced ? 'chevronDown' : 'chevronRight'" :size="14" />
                            {{ t('catalog.warehouses.advanced.toggle') }}
                        </button>
                        <div v-if="whAdvanced" class="mt-2 flex flex-col gap-[10px] rounded-[10px] border p-3" style="background:var(--surface); border-color:var(--line)">
                            <div class="text-[11.5px] text-ink-3">{{ t('catalog.warehouses.advanced.help') }}</div>

                            <div>
                                <label class="mb-1 block text-[11.5px] font-semibold text-ink-2">{{ t('catalog.warehouses.advanced.provider') }}</label>
                                <Select v-model="whStorage.provider" :options="whProviderOptions" size="sm" />
                            </div>

                            <div class="grid grid-cols-2 gap-2">
                                <div>
                                    <label class="mb-1 block text-[11.5px] font-semibold text-ink-2">{{ t('catalog.warehouses.advanced.bucket') }}</label>
                                    <input v-model="whStorage.bucket" class="h-[34px] w-full rounded-[9px] border bg-surface-2 px-2 font-mono text-[12.5px] text-ink outline-none focus:border-accent" style="border-color:var(--line)" />
                                </div>
                                <div v-if="!whIsR2">
                                    <label class="mb-1 block text-[11.5px] font-semibold text-ink-2">{{ t('catalog.warehouses.advanced.region') }}</label>
                                    <input v-model="whStorage.region" class="h-[34px] w-full rounded-[9px] border bg-surface-2 px-2 font-mono text-[12.5px] text-ink outline-none focus:border-accent" style="border-color:var(--line)" />
                                </div>
                                <div v-if="whIsR2">
                                    <label class="mb-1 block text-[11.5px] font-semibold text-ink-2">{{ t('catalog.warehouses.advanced.cloudflareAccountId') }}</label>
                                    <input v-model="whStorage.cloudflareAccountId" class="h-[34px] w-full rounded-[9px] border bg-surface-2 px-2 font-mono text-[12.5px] text-ink outline-none focus:border-accent" style="border-color:var(--line)" />
                                </div>
                                <div v-if="whIsS3Compat" class="col-span-2">
                                    <label class="mb-1 block text-[11.5px] font-semibold text-ink-2">{{ t('catalog.warehouses.advanced.endpoint') }}</label>
                                    <input v-model="whStorage.endpoint" placeholder="https://…" class="h-[34px] w-full rounded-[9px] border bg-surface-2 px-2 font-mono text-[12.5px] text-ink outline-none focus:border-accent" style="border-color:var(--line)" />
                                </div>
                                <div>
                                    <label class="mb-1 block text-[11.5px] font-semibold text-ink-2">{{ t('catalog.warehouses.advanced.accessKeyId') }}</label>
                                    <input v-model="whStorage.accessKeyId" class="h-[34px] w-full rounded-[9px] border bg-surface-2 px-2 font-mono text-[12.5px] text-ink outline-none focus:border-accent" style="border-color:var(--line)" />
                                </div>
                                <div>
                                    <label class="mb-1 block text-[11.5px] font-semibold text-ink-2">{{ t('catalog.warehouses.advanced.secretAccessKey') }}</label>
                                    <input v-model="whStorage.secretAccessKey" type="password" autocomplete="off" class="h-[34px] w-full rounded-[9px] border bg-surface-2 px-2 font-mono text-[12.5px] text-ink outline-none focus:border-accent" style="border-color:var(--line)" />
                                </div>
                            </div>

                            <div>
                                <label class="mb-1 block text-[11.5px] font-semibold text-ink-2">{{ t('catalog.warehouses.advanced.credMode') }}</label>
                                <Select v-model="whStorage.credMode" :options="whCredModeOptions" size="sm" />
                            </div>
                        </div>

                        <div class="mt-3 flex gap-2">
                            <button
                                type="button"
                                class="flex h-[34px] items-center gap-1.5 rounded-[9px] border-none px-[13px] text-[12.5px] font-semibold hover:brightness-105 disabled:opacity-60"
                                style="background:var(--accent); color:var(--accent-ink)"
                                :disabled="creating || !whName.trim() || !whStorageValid"
                                @click="createWarehouse"
                            >
                                <Spinner v-if="creating" :size="13" />
                                {{ t('catalog.warehouses.createButton') }}
                            </button>
                            <button
                                type="button"
                                class="h-[34px] rounded-[9px] border bg-transparent px-3 text-[12.5px] font-semibold text-ink-2 hover:border-ink-3"
                                style="border-color:var(--line)"
                                @click="toggleWhCreate"
                            >
                                {{ t('common.cancel') }}
                            </button>
                        </div>
                    </div>

                    <div
                        v-if="!warehouses.length"
                        class="border-t p-[12px_18px] text-[13px] text-ink-3"
                        style="border-color:var(--line-2)"
                    >
                        {{ t('catalog.warehouses.empty') }}
                    </div>
                    <div
                        v-for="w in warehouses"
                        :key="w.id"
                        class="flex items-center gap-[11px] border-t p-[12px_18px]"
                        style="border-color:var(--line-2)"
                    >
                        <Icon name="database" :size="16" class="text-ink-3" />
                        <div class="flex-1 font-mono text-[13px] font-medium">{{ w.name }}</div>
                        <span
                            v-if="w.name === 'default'"
                            class="rounded-full px-2 py-[2px] text-[11px] font-bold"
                            style="background:var(--accent-soft); color:var(--accent-soft-ink)"
                        >default</span>
                    </div>
                </div>

                <!-- connect guides -->
                <div class="overflow-hidden rounded-2xl border" style="background:var(--surface); border-color:var(--line); box-shadow:var(--shadow)">
                    <div class="p-[16px_18px_12px] text-[15px] font-bold">{{ t('catalog.connect.title') }}</div>
                    <template v-if="conn && connReady">
                        <div class="flex gap-1 p-[0_18px_12px]">
                            <button
                                type="button"
                                class="h-[30px] rounded-lg px-3 text-[12.5px] font-semibold"
                                :style="tabStyle('duckdb')"
                                @click="activeTab = 'duckdb'"
                            >DuckDB</button>
                            <button
                                type="button"
                                class="h-[30px] rounded-lg px-3 text-[12.5px] font-semibold"
                                :style="tabStyle('python')"
                                @click="activeTab = 'python'"
                            >Python</button>
                            <button
                                type="button"
                                class="h-[30px] rounded-lg px-3 text-[12.5px] font-semibold"
                                :style="tabStyle('go')"
                                @click="activeTab = 'go'"
                            >Go</button>
                        </div>
                        <div class="m-[0_18px_16px]">
                            <CodeSnippet :code="snippet.code" :filename="snippet.file" />
                        </div>
                    </template>
                    <div v-else class="p-[0_18px_16px] text-[13px] text-ink-3">{{ t('catalog.connect.notReady') }}</div>
                </div>
            </div>

            <div v-if="loadError" class="mt-4 text-[13px]" style="color:var(--err-ink)">{{ t('catalog.loadError') }}</div>
        </template>
    </div>
</template>
