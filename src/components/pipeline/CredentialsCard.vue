<script setup lang="ts">
// How the pipeline authenticates to its source.
//
// For a Google source that is a *reference*, not a secret: a workspace
// connection the customer signed into once, which the pipeline follows so a
// reconnect happens in one place. The one-shot grant below it is the fallback
// for a workspace plane that does not serve ConnectionService yet, and the
// service-account textarea is the fallback below that. Every other source type
// pastes raw credentials JSON.
//
// The flow itself is useGoogleConnect's, owned by the wizard: applyDraft has to
// clear a sign-in while this card is not even mounted, so the composable cannot
// live here. This card renders it and owns the one coupling that belongs to a
// field rather than to the flow — typing a key clears the sign-in.
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { DETACH, type GoogleConnect } from '../../composables/useGoogleConnect'
import type { PipelineForm } from '../../lib/pipelineSources'
import Icon from '../ui/Icon.vue'
import Select from '../ui/Select.vue'
import Spinner from '../ui/Spinner.vue'

const props = defineProps<{
    form: PipelineForm
    /** True for a source that signs in with Google rather than pasting a key. */
    usesGoogle: boolean
    google: GoogleConnect
    isEdit: boolean
    /** On edit: the connection the pipeline is attached to, '' if it holds its own. */
    attachedConnectionId: string
    /** On edit: whether the server is keeping any credential for this pipeline. */
    hasStoredCredentials: boolean
    fieldErrors: Record<string, string>
}>()

const { t } = useI18n()

// The connection picker's options. A single control carries three different
// answers — see useGoogleConnect's credentialChoice, which unpacks the DETACH
// sentinel back into form.connectionId / form.detach.
//
// "Keep existing" appears only when there is something to keep that this picker
// cannot name: a pipeline holding its own token or a service-account key. An
// attached connection is shown as itself, selected.
const credentialOptions = computed(() => {
    const opts: { value: string; label: string }[] = []
    if (props.isEdit && props.hasStoredCredentials && !props.attachedConnectionId) {
        opts.push({ value: '', label: t('connections.picker.keepExisting') })
    }
    for (const c of props.google.connectionOptions.value) {
        opts.push({ value: c.id, label: c.email && c.email !== c.name ? `${c.name} (${c.email})` : c.name })
    }
    if (props.isEdit && props.hasStoredCredentials) {
        opts.push({ value: DETACH, label: t('connections.picker.detach') })
    }
    return opts
})

// Typing a service-account key clears any OAuth grant/connection so the two
// never collide. It lives here, next to the field that triggers it.
watch(
    () => props.form.credentialsRaw,
    (v) => {
        if (v.trim() && (props.form.oauthGrantId || props.form.connectionId)) props.google.disconnect()
    },
)
</script>

<template>
    <div
        class="mb-4 rounded-2xl border p-[22px]"
        style="background: var(--surface); border-color: var(--line); box-shadow: var(--shadow)"
    >
        <h2 class="mb-[5px] text-base font-bold">{{ t('pipelinesUi.wizard.configure.credentialsTitle') }}</h2>
        <div class="mb-4 text-[12.5px]" style="color: var(--ink-2)">
            {{ isEdit ? t('pipelinesUi.wizard.configure.credentialsHelpEdit') : t('pipelinesUi.wizard.configure.credentialsHelp') }}
        </div>

        <!-- google_sheets: Sign in with Google (default) + service account (advanced) -->
        <template v-if="usesGoogle">
            <!-- OAuth (hidden when the server has no Google OAuth configured) -->
            <div v-if="google.available.value !== false" class="mb-[14px]">
                <!-- Workspace connection picker (preferred): the pipeline
                     references an already-connected Google account instead of
                     holding its own token. -->
                <div
                    v-if="google.connectionOptions.value.length"
                    class="rounded-xl border px-[14px] py-3"
                    style="background: var(--inset); border-color: var(--line)"
                >
                    <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
                        {{ t('connections.picker.label') }}
                    </label>
                    <div class="flex flex-wrap items-center gap-[9px]">
                        <Select
                            v-model="google.credentialChoice.value"
                            :options="credentialOptions"
                            size="sm"
                            class="min-w-[220px] flex-1"
                            :aria-label="t('connections.picker.label')"
                        />
                        <button
                            type="button"
                            :disabled="google.connecting.value"
                            class="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[9px] border bg-transparent px-3 text-[12.5px] font-semibold"
                            style="border-color: var(--line); color: var(--ink-2)"
                            @click="google.connect"
                        >
                            <Spinner v-if="google.connecting.value" :size="13" />
                            <Icon v-else name="plus" :size="14" />
                            {{ t('connections.picker.connectNew') }}
                        </button>
                    </div>
                    <p class="mt-2 text-xs leading-[1.5]" style="color: var(--ink-3)">
                        {{ form.detach ? t('connections.picker.detachHint') : t('connections.picker.hint') }}
                    </p>
                    <p v-if="google.error.value" class="mt-2 text-xs" style="color: var(--err)">
                        {{ google.error.value }}
                    </p>
                </div>
                <div
                    v-else-if="google.connected.value"
                    class="flex items-center gap-[11px] rounded-xl border px-[14px] py-3"
                    style="background: var(--inset); border-color: var(--line)"
                >
                    <Icon name="check" :size="18" class="flex-none" :style="{ color: 'var(--ok, #16a34a)' }" />
                    <div class="flex-1 text-[13.5px] leading-[1.5]" style="color: var(--ink)">
                        {{ t('pipelinesUi.wizard.configure.sheetsOAuth.connectedAs', { email: form.oauthEmail }) }}
                    </div>
                    <button
                        type="button"
                        :disabled="google.connecting.value"
                        class="inline-flex cursor-pointer items-center gap-1.5 rounded-[9px] border bg-transparent px-3 py-[7px] text-[12.5px] font-semibold"
                        style="border-color: var(--line); color: var(--ink-2)"
                        @click="google.connect"
                    >
                        <Icon name="refresh" :size="14" />{{ t('pipelinesUi.wizard.configure.sheetsOAuth.reconnect') }}
                    </button>
                </div>
                <!-- The workspace has no Google app of its own yet. Signing in
                     needs one, so point at the setup rather than at a button
                     that would only fail. -->
                <div
                    v-else-if="google.state.value === 'setup'"
                    class="flex items-start gap-[11px] rounded-xl border px-[14px] py-3"
                    style="background: var(--inset); border-color: var(--line)"
                >
                    <Icon name="info" :size="16" class="mt-0.5 flex-none" :style="{ color: 'var(--ink-3)' }" />
                    <div class="min-w-0 flex-1">
                        <div class="mb-[9px] text-[13px] leading-[1.55]" style="color: var(--ink)">
                            {{ t('pipelinesUi.wizard.configure.sheetsOAuth.needsClient') }}
                        </div>
                        <RouterLink
                            :to="{ name: 'integrations' }"
                            class="inline-flex items-center gap-[7px] rounded-[9px] border px-3 py-[7px] text-[12.5px] font-semibold no-underline"
                            style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                        >
                            <Icon name="launch" :size="14" />
                            {{ t('pipelinesUi.wizard.configure.sheetsOAuth.goToIntegrations') }}
                        </RouterLink>
                    </div>
                </div>
                <div v-else>
                    <p class="mb-2.5 text-[12.5px] leading-[1.55]" style="color: var(--ink-2)">
                        {{ t('pipelinesUi.wizard.configure.sheetsOAuth.help') }}
                    </p>
                    <button
                        type="button"
                        :disabled="google.connecting.value"
                        class="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border-none px-4 py-2.5 text-[13.5px] font-[650] text-white"
                        style="background: var(--accent, #2563eb)"
                        @click="google.connect"
                    >
                        <Spinner v-if="google.connecting.value" :size="15" />
                        <Icon v-else name="link" :size="16" />
                        {{ t('pipelinesUi.wizard.configure.sheetsOAuth.connect') }}
                    </button>
                    <p v-if="google.error.value" class="mt-2 text-xs" style="color: var(--err)">
                        {{ google.error.value }}
                    </p>
                    <p v-if="isEdit" class="mt-2 text-xs" style="color: var(--ink-3)">
                        {{ t('pipelinesUi.wizard.configure.sheetsOAuth.editNote') }}
                    </p>
                </div>
            </div>

            <!-- Advanced: service account (open by default only when OAuth is unavailable) -->
            <details :open="google.available.value === false" class="border-t pt-3" style="border-color: var(--line)">
                <summary class="cursor-pointer list-none text-[12.5px] font-semibold" style="color: var(--ink-2)">
                    {{ t('pipelinesUi.wizard.configure.sheetsOAuth.advancedToggle') }}
                </summary>
                <div class="mt-3">
                    <div class="mb-2.5 text-[12.5px] leading-[1.55]" style="color: var(--ink-2)">
                        {{ t('pipelinesUi.wizard.configure.sheetsCredentialsHelp') }}
                    </div>
                    <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
                        {{ t('pipelines.sourceCredentials') }}
                    </label>
                    <textarea
                        v-model="form.credentialsRaw"
                        rows="4"
                        placeholder='{"service_account_key": { … }}'
                        class="w-full resize-y rounded-[10px] border px-[13px] py-[11px] font-mono text-[13px] leading-[1.5] outline-none"
                        style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                    ></textarea>
                    <p v-if="fieldErrors.credentialsRaw" class="mt-1.5 text-xs" style="color: var(--err)">
                        {{ fieldErrors.credentialsRaw }}
                    </p>
                </div>
            </details>
        </template>

        <!-- All other source types: raw credentials JSON -->
        <template v-else>
            <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
                {{ t('pipelines.sourceCredentials') }}
            </label>
            <textarea
                v-model="form.credentialsRaw"
                rows="2"
                placeholder='{"api_key": "..."}'
                class="w-full resize-y rounded-[10px] border px-[13px] py-[11px] font-mono text-[13px] leading-[1.5] outline-none"
                style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
            ></textarea>
            <p v-if="fieldErrors.credentialsRaw" class="mt-1.5 text-xs" style="color: var(--err)">
                {{ fieldErrors.credentialsRaw }}
            </p>
        </template>
    </div>
</template>
