<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Icon from './ui/Icon.vue'
import CopyButton from './ui/CopyButton.vue'
import type { ExplainErrorResponse } from '../api/gen/assist_pb.js'

// Modal card rendering one AI error explanation. Read-only by design: the
// suggested snippet is copied, never applied — the user decides what to do
// with it.
defineProps<{
    open: boolean
    result: ExplainErrorResponse | null
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
</script>

<template>
    <Teleport to="body">
        <div
            v-if="open && result"
            style="position:fixed; inset:0; z-index:70; display:flex; align-items:center; justify-content:center; background:color-mix(in srgb, var(--ink) 32%, transparent); padding:24px;"
            @click.self="emit('close')"
        >
            <div
                role="dialog"
                :aria-label="t('explainUi.title')"
                style="width:min(560px, 100%); max-height:85vh; overflow:auto; border-radius:14px; border:1px solid var(--line); background:var(--surface); box-shadow:var(--shadow); padding:22px;"
            >
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
                    <Icon name="sparkle" :size="17" style="color: var(--accent)" />
                    <div style="flex:1; font-size:15.5px; font-weight:700;">{{ t('explainUi.title') }}</div>
                    <button
                        style="display:flex; padding:6px; border:none; border-radius:8px; background:transparent; cursor:pointer; color:var(--ink-3);"
                        :aria-label="t('explainUi.close')"
                        @click="emit('close')"
                    >
                        <Icon name="x" :size="16" />
                    </button>
                </div>

                <div style="font-size:13.5px; line-height:1.55; color:var(--ink);">{{ result.explanation }}</div>

                <div v-if="result.likelyCause" style="margin-top:14px;">
                    <div style="font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3); margin-bottom:4px;">
                        {{ t('explainUi.likelyCause') }}
                    </div>
                    <div style="font-size:13px; line-height:1.5; color:var(--ink-2);">{{ result.likelyCause }}</div>
                </div>

                <div v-if="result.suggestedFix" style="margin-top:14px;">
                    <div style="font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3); margin-bottom:4px;">
                        {{ t('explainUi.suggestedFix') }}
                    </div>
                    <div style="font-size:13px; line-height:1.5; color:var(--ink-2);">{{ result.suggestedFix }}</div>
                </div>

                <div v-if="result.suggestedSnippet" style="margin-top:14px;">
                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                        <div style="flex:1; font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3);">
                            {{ t('explainUi.suggestedSnippet') }}
                        </div>
                        <CopyButton :value="result.suggestedSnippet" />
                    </div>
                    <pre
                        style="margin:0; padding:10px 12px; border-radius:9px; background:var(--inset); border:1px solid var(--line-2); font-family:'JetBrains Mono', monospace; font-size:12px; line-height:1.5; white-space:pre-wrap; word-break:break-word; color:var(--ink);"
                    >{{ result.suggestedSnippet }}</pre>
                </div>

                <div style="margin-top:16px; font-size:11.5px; color:var(--ink-3);">{{ t('explainUi.disclaimer') }}</div>
            </div>
        </div>
    </Teleport>
</template>
