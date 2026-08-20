<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '../composables/useAuth'
import Icon from '../components/ui/Icon.vue'
import Spinner from '../components/ui/Spinner.vue'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const { handleCallback, isLoading, error } = useAuth()

onMounted(async () => {
    const code = route.query.code as string
    const state = route.query.state as string
    const errorParam = route.query.error as string

    if (errorParam) {
        error.value = (route.query.error_description as string) || errorParam
        return
    }

    if (!code || !state) {
        error.value = t('account.callback.missingCode')
        return
    }

    const success = await handleCallback(code, state)
    if (success) {
        router.replace({ name: 'overview' })
    }
})
</script>

<template>
    <div
        style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:48px 24px; background:var(--bg); color:var(--ink);"
    >
        <div style="width:100%; max-width:380px; text-align:center;">
            <template v-if="isLoading">
                <div style="display:flex; justify-content:center; margin-bottom:16px; color:var(--accent);">
                    <Spinner :size="32" />
                </div>
                <p style="font-size:14px; color:var(--ink-2); margin:0;">{{ t('account.callback.loading') }}</p>
            </template>

            <template v-else-if="error">
                <div
                    style="display:flex; align-items:flex-start; gap:13px; text-align:left; background:var(--err-soft); border:1px solid color-mix(in srgb, var(--err) 30%, transparent); border-radius:14px; padding:16px 18px;"
                >
                    <span style="display:flex; color:var(--err); flex:none; margin-top:1px;">
                        <Icon name="danger" :size="20" />
                    </span>
                    <div>
                        <div style="font-weight:700; font-size:14px; color:var(--err-ink);">
                            {{ t('account.callback.failedTitle') }}
                        </div>
                        <div style="font-size:12.5px; color:var(--err-ink); opacity:.85; margin-top:3px;">
                            {{ error }}
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    @click="$router.push({ name: 'login' })"
                    style="margin-top:18px; height:40px; padding:0 18px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink-2); font-family:inherit; font-size:13px; font-weight:600; cursor:pointer;"
                >
                    {{ t('account.callback.returnToLogin') }}
                </button>
            </template>
        </div>
    </div>
</template>
