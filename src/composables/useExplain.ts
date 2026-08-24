import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ConnectError, Code } from '@connectrpc/connect'
import type { MessageInitShape } from '@bufbuild/protobuf'
import { assistClient } from '../api'
import { errorMessage } from '../api/errors'
import type { ExplainErrorRequestSchema, ExplainErrorResponse } from '../api/gen/assist_pb.js'
import { useToast } from './useToast'

// The request's oneof in init form — what callers construct as
// `{ case: 'sql', value: { … } }` plain objects.
export type ExplainTarget = MessageInitShape<typeof ExplainErrorRequestSchema>['target']

// Shared "Explain this error" state for the AI panel: one in-flight request,
// one result, one open/closed flag. Every failure surface (pipeline run, dbt
// run, SQL editor) uses this so the degradation behavior stays identical to
// the draft RPCs: UNIMPLEMENTED → soft "coming soon" toast, rate limit →
// wait-a-moment toast, anything else → error toast. The panel opens only on
// success.
export function useExplain() {
    const { t } = useI18n()
    const toast = useToast()

    const open = ref(false)
    const loading = ref(false)
    const result = ref<ExplainErrorResponse | null>(null)

    async function explain(target: ExplainTarget) {
        if (loading.value) return
        loading.value = true
        try {
            result.value = await assistClient.explainError({ target })
            open.value = true
        } catch (err) {
            if (err instanceof ConnectError && err.code === Code.Unimplemented) {
                toast.info(t('explainUi.notConfigured'))
            } else if (err instanceof ConnectError && err.code === Code.ResourceExhausted) {
                toast.info(t('explainUi.rateLimited'))
            } else {
                toast.error(errorMessage(err, t('explainUi.failed')))
            }
        } finally {
            loading.value = false
        }
    }

    function close() {
        open.value = false
    }

    return { open, loading, result, explain, close }
}
