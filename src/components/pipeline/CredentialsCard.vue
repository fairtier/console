<script setup lang="ts">
// How the pipeline authenticates to its source.
//
// For a Google source that is a *reference*, not a secret: a workspace
// connection the customer signed into once, which the pipeline follows so a
// reconnect happens in one place. The one-shot grant below it is the fallback
// for a workspace plane that does not serve ConnectionService yet, and the raw
// textarea is the fallback below that. Every other source type pastes raw
// credentials JSON.
//
// "A Google source" is google_sheets AND duckdb with the gdrive extension —
// which is why the branch tests the flow's scope rather than the source type.
// The two want different words for the same control: one reads a spreadsheet,
// the other reads files in Drive, and telling a Drive customer to share a
// spreadsheet with a service account would be nonsense.
//
// A source that names its credentials — a database's one password — gets those
// fields instead of the textarea: `source.credentialFields`, packed into
// `attach_params.password` by buildCredentials. And a source that needs none at
// all (a PDF at a public URL) is not shown this card at all, which is the
// wizard's decision, made from `source.credentials`.
//
// The flow itself is useGoogleConnect's, owned by the wizard: applyDraft has to
// clear a sign-in while this card is not even mounted, so the composable cannot
// live here. This card renders it and owns the one coupling that belongs to a
// field rather than to the flow — typing a key clears the sign-in.
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { DETACH, type GoogleConnect } from '../../composables/useGoogleConnect'
import type { PipelineForm, PipelineSource } from '../../lib/pipelineSources'
import Icon from '../ui/Icon.vue'
import Select from '../ui/Select.vue'
import Spinner from '../ui/Spinner.vue'

const props = defineProps<{
    form: PipelineForm
    /** The source being configured: how it authenticates, and what its raw
     *  credentials editor should show when empty. */
    source: PipelineSource
    google: GoogleConnect
    isEdit: boolean
    /** Advanced JSON: the raw textarea takes over from the named fields, the
     *  way it takes over from the guided config form. A hand-written ATTACH
     *  template can carry placeholders no named field knows about. */
    advancedJson: boolean
    /** On edit: the connection the pipeline is attached to, '' if it holds its own. */
    attachedConnectionId: string
    /** On edit: whether the server is keeping any credential for this pipeline. */
    hasStoredCredentials: boolean
    fieldErrors: Record<string, string>
}>()

const { t } = useI18n()

// The named credential fields this source declares, when the guided form is
// what is on screen. Empty for every source that takes a whole JSON object, a
// Google connection, or nothing at all.
const namedFields = computed(() =>
    props.source.guided && !props.advancedJson ? props.source.credentialFields : [],
)

// Sheets and Drive differ in what they ask for, so they differ in what they
// say. Only the strings that would be wrong for the other one are switched;
// everything shared (connect, reconnect, connected as…) stays one string.
const copy = computed(() => {
    const ns = props.google.scope.value === 'drive' ? 'driveOAuth' : 'sheetsOAuth'
    return (key: string) => t(`pipelinesUi.wizard.configure.${ns}.${key}`)
})

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
        const name = c.email && c.email !== c.name ? `${c.name} (${c.email})` : c.name
        // An account we KNOW does not carry this source's access is labelled,
        // not hidden: it is still choosable (reconnecting widens it in place),
        // and hiding the account the customer is looking for would be worse
        // than naming what it is missing.
        opts.push({ value: c.id, label: props.google.covers(c) ? name : `${name} — ${t('connections.picker.missingScope')}` })
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

        <!-- Google-backed source (google_sheets, duckdb/gdrive): Sign in with
             Google by default, raw credentials as the advanced fallback. -->
        <template v-if="google.scope.value">
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
                    <p
                        v-if="google.selectedLacksScope.value && !form.detach"
                        class="mt-2 text-xs leading-[1.5]"
                        style="color: var(--warn-ink)"
                    >
                        {{ t('connections.picker.reconnectForScope') }}
                    </p>
                    <p v-else class="mt-2 text-xs leading-[1.5]" style="color: var(--ink-3)">
                        {{ form.detach ? t('connections.picker.detachHint') : t('connections.picker.hint') }}
                    </p>
                    <p v-if="google.error.value" class="mt-2 text-xs" style="color: var(--err)">
                        {{ google.error.value }}
                    </p>
                    <!-- The server's own refusal — "this account is not
                         authorized for Google Drive" — belongs on the control
                         that chose the account, not in a toast that scrolls
                         away. -->
                    <p v-if="fieldErrors.connectionId" class="mt-2 text-xs" style="color: var(--err)">
                        {{ fieldErrors.connectionId }}
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
                            {{ copy('needsClient') }}
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
                        {{ copy('help') }}
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
                    {{ copy('advancedToggle') }}
                </summary>
                <div class="mt-3">
                    <div class="mb-2.5 text-[12.5px] leading-[1.55]" style="color: var(--ink-2)">
                        {{ copy('advancedHelp') }}
                    </div>
                    <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
                        {{ t('pipelines.sourceCredentials') }}
                    </label>
                    <textarea
                        v-model="form.credentialsRaw"
                        rows="4"
                        :placeholder="source.credentialsPlaceholder"
                        class="w-full resize-y rounded-[10px] border px-[13px] py-[11px] font-mono text-[13px] leading-[1.5] outline-none"
                        style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                    ></textarea>
                    <p v-if="fieldErrors.credentialsRaw" class="mt-1.5 text-xs" style="color: var(--err)">
                        {{ fieldErrors.credentialsRaw }}
                    </p>
                </div>
            </details>
        </template>

        <!-- A source that names its credentials: one labelled field each,
             instead of a JSON object the user has to know the shape of. -->
        <template v-else-if="namedFields.length">
            <div v-for="f in namedFields" :key="f.field" class="mb-1">
                <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
                    {{ t(f.labelKey) }}
                </label>
                <input
                    v-model="form[f.field]"
                    type="password"
                    autocomplete="new-password"
                    :placeholder="isEdit ? t('pipelinesUi.wizard.configure.credentialsKeep') : ''"
                    class="h-10 w-full rounded-[10px] border px-[13px] font-mono text-[13px] outline-none"
                    style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
                />
                <p v-if="fieldErrors[f.field]" class="mt-1.5 text-xs" style="color: var(--err)">
                    {{ fieldErrors[f.field] }}
                </p>
            </div>
            <p class="mt-2 text-xs leading-[1.5]" style="color: var(--ink-3)">
                {{ t('pipelinesUi.wizard.configure.duckdb.passwordHint') }}
            </p>
        </template>

        <!-- All other source types: raw credentials JSON -->
        <template v-else>
            <label class="mb-1.5 block text-[12.5px] font-semibold" style="color: var(--ink-2)">
                {{ t('pipelines.sourceCredentials') }}
            </label>
            <textarea
                v-model="form.credentialsRaw"
                rows="2"
                :placeholder="source.credentialsPlaceholder"
                class="w-full resize-y rounded-[10px] border px-[13px] py-[11px] font-mono text-[13px] leading-[1.5] outline-none"
                style="background: var(--surface-2); border-color: var(--line); color: var(--ink)"
            ></textarea>
            <p v-if="fieldErrors.credentialsRaw" class="mt-1.5 text-xs" style="color: var(--err)">
                {{ fieldErrors.credentialsRaw }}
            </p>
        </template>
    </div>
</template>
