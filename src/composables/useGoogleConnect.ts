import { computed, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ConnectError, Code } from '@connectrpc/connect'
import {
    connectGoogle,
    connectionCovers,
    OAuthClientNotConfiguredError,
    OAuthUnavailableError,
    type GoogleCapability,
} from '../api/googleOAuth'
import { oauthClientClient } from '../api'
import { errorMessage } from '../api/errors'
import { useConnectionsStore } from '../stores/connections'
import type { Connection } from '../api'
import type { GoogleScope, PipelineForm } from '../lib/pipelineSources'
import { useToast } from './useToast'

// Three answers, not two, because the user can act on the middle one:
//   'unknown'     not probed yet
//   'unavailable' this server cannot run the flow — use a service account
//   'setup'       it can, but this workspace has not connected its own Google
//                 app yet — send them to Integrations
//   'ready'       an app is connected; the Connect button works
export type OAuthState = 'unknown' | 'unavailable' | 'setup' | 'ready'

/** Picker sentinel for "drop the stored credentials". */
export const DETACH = '__detach__'

/**
 * useGoogleConnect owns "Sign in with Google" for a pipeline form: the
 * capability probe, the consent popup, promoting the grant to a workspace
 * connection, and the picker that chooses between an existing connection,
 * keeping what is stored, and detaching it.
 *
 * It writes into the form because the mutual exclusions only make sense over
 * the whole object — a connection, a one-shot grant and a pasted service
 * account are three ways to say the same thing, and setting one has to clear
 * the other two.
 *
 * @param form     the wizard's form, mutated in place
 * @param scope    what the selected source needs from Google ('' = nothing).
 *                 Not a boolean, because the consent asks for exactly that: a
 *                 Sheets pipeline must never request the customer's Drive.
 * @param isEdit   whether the wizard is editing an existing pipeline
 */
export function useGoogleConnect(form: PipelineForm, scope: Ref<GoogleScope>, isEdit: Ref<boolean>) {
    const { t } = useI18n()
    const toast = useToast()
    const connectionsStore = useConnectionsStore()

    // The source signs in with Google at all.
    const enabled = computed(() => scope.value !== '')

    const state = ref<OAuthState>('unknown')
    const connecting = ref(false)
    const error = ref('')

    // What the consent has to ask for to serve this source.
    const capability = computed<GoogleCapability>(() => (scope.value === 'drive' ? 'drive' : ''))

    // Kept as a boolean for the template's "hide the whole block" test.
    const available = computed(() => (state.value === 'unknown' ? null : state.value !== 'unavailable'))

    // True once the user has connected a Google account this session (legacy
    // grant path — the connection picker has its own selected state).
    const connected = computed(() => enabled.value && !!form.oauthGrantId)

    // --- Workspace-level Google connections (the preferred credential) ---
    const connectionOptions = computed(() =>
        connectionsStore.availability === 'ready'
            ? connectionsStore.connections.filter((c) => c.type === 'google')
            : [],
    )

    // On create, preselect the only sensible default once the list arrives.
    // Edits are prefilled from the pipeline itself (loadForEdit) — a connection
    // id is a reference, not credential material, so the editor can and must
    // show which account is attached: a blank picker reads as "nothing is set"
    // while the server is still keeping something the user cannot see.
    watch(connectionOptions, (opts) => {
        const first = opts[0]
        if (!isEdit.value && enabled.value && !form.connectionId && !form.oauthGrantId && first) {
            form.connectionId = first.id
        }
    })

    /**
     * Does this connection carry what the selected source needs?
     *
     * The rule itself is connectionCovers (see it for why an empty scope list
     * has to read as unknown rather than as "nothing granted"); this binds it
     * to the source currently selected.
     */
    function covers(c: Connection): boolean {
        return connectionCovers(c.scopes, capability.value)
    }

    /**
     * The chosen account is known NOT to carry what this source needs — the
     * one case worth a warning, because the fix (reconnect, which widens the
     * same connection in place) is one click away and the alternative is a 403
     * inside a scheduled run.
     */
    const selectedLacksScope = computed(() => {
        const sel = connectionOptions.value.find((c) => c.id === form.connectionId)
        return !!sel && !covers(sel)
    })

    // The picker carries one value, so detach rides in the same control as the
    // connection choice and is unpacked into form.connectionId / form.detach.
    const credentialChoice = computed<string>({
        get: () => (form.detach ? DETACH : form.connectionId),
        set: (v) => {
            form.detach = v === DETACH
            form.connectionId = v === DETACH ? '' : v
        },
    })

    // Ask the workspace whether an OAuth app is connected. The RPC is the
    // source of truth rather than a probe of /start: it distinguishes "no app
    // connected yet" from "this server has no OAuth at all", and unlike the old
    // probe it does not mint a consent state just to find out.
    async function probe() {
        if (!enabled.value || state.value !== 'unknown') return
        try {
            const resp = await oauthClientClient.getOAuthClient({ provider: 'google' })
            if (!resp.flowAvailable) state.value = 'unavailable'
            else state.value = resp.configured ? 'ready' : 'setup'
        } catch (err) {
            // An older workspace plane does not serve the service at all.
            state.value = err instanceof ConnectError && err.code === Code.Unimplemented ? 'unavailable' : 'setup'
        }
    }

    async function connect() {
        error.value = ''
        connecting.value = true
        try {
            const res = await connectGoogle(capability.value)
            let promoted = false
            if (connectionsStore.availability !== 'unavailable') {
                // Promote the grant to a workspace connection so this sign-in is
                // the last one: future pipelines (and live SQL) reuse it by
                // reference. Attempted even while availability is still
                // 'unknown' — the probe is best-effort and a swallowed load must
                // not silently downgrade a capable plane to the one-shot grant
                // path.
                //
                // Signing in with an account that is already connected
                // re-authorizes that connection server-side and returns it, id
                // unchanged. There is deliberately no client-side "already
                // exists → reuse the existing row" fallback: that turned a
                // reconnect into a no-op that reattached the very token the user
                // was trying to replace, and spent the fresh grant doing it, so
                // the error the customer was told to fix could not be fixed. If
                // the server ever does refuse, the refusal must be visible.
                try {
                    const conn = await connectionsStore.createFromGoogleGrant(res.grant_id)
                    form.connectionId = conn.id
                    form.detach = false
                    form.oauthGrantId = ''
                    form.oauthEmail = ''
                    promoted = true
                } catch (err) {
                    if (!(err instanceof ConnectError && err.code === Code.Unimplemented)) {
                        // Grants are one-time and consumption happens
                        // server-side, so after any other failure the grant may
                        // already be dead — surface the error instead of
                        // embedding a reference that cannot redeem.
                        throw err
                    }
                    // Unimplemented: an older plane without ConnectionService —
                    // the grant was never touched, the one-shot fallback below
                    // is correct.
                }
            }
            if (!promoted) {
                // Legacy plane without ConnectionService: one-shot grant per
                // pipeline.
                form.oauthGrantId = res.grant_id
                form.oauthEmail = res.email
                form.connectionId = ''
                form.detach = false
            }
            form.credentialsRaw = '' // OAuth and service-account are mutually exclusive
            state.value = 'ready'
            toast.success(t('pipelinesUi.wizard.configure.sheetsOAuth.connected', { email: res.email }))
        } catch (err) {
            if (err instanceof OAuthUnavailableError) {
                state.value = 'unavailable'
            } else if (err instanceof OAuthClientNotConfiguredError) {
                // The app was disconnected between the probe and the click.
                state.value = 'setup'
            } else {
                error.value = errorMessage(err, t('pipelinesUi.wizard.configure.sheetsOAuth.failed'))
            }
        } finally {
            connecting.value = false
        }
    }

    /** Forget the connection reference and any one-shot grant. */
    function disconnect() {
        form.oauthGrantId = ''
        form.oauthEmail = ''
        form.connectionId = ''
        form.detach = false
    }

    // Probe when a Google source becomes the selected one; forget the sign-in
    // when it stops being — a grant is meaningless for a source that does not
    // use it. The connections list loads alongside; an older plane answers
    // Unimplemented and the picker simply never appears.
    watch(
        enabled,
        (on) => {
            if (on) {
                probe()
                connectionsStore.load().catch(() => {})
            } else {
                disconnect()
            }
        },
        { immediate: true },
    )

    return {
        state, scope, available, connecting, error, connected,
        connectionOptions, credentialChoice, covers, selectedLacksScope,
        connect, disconnect,
    }
}

/** The flow's public surface, as the wizard hands it to CredentialsCard. */
export type GoogleConnect = ReturnType<typeof useGoogleConnect>
