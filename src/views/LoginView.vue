<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAuth } from '../composables/useAuth'
import Icon from '../components/ui/Icon.vue'

const { t } = useI18n()
const { login } = useAuth()
</script>

<template>
    <div
        style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:48px 24px; background:var(--bg); color:var(--ink);"
    >
        <div style="width:100%; max-width:380px; text-align:center;">
            <!-- brand -->
            <div
                style="width:52px; height:52px; border-radius:14px; background:var(--accent); display:flex; align-items:center; justify-content:center; margin:0 auto 22px; color:var(--accent-ink); box-shadow:var(--shadow);"
            >
                <Icon name="logo" :size="26" />
            </div>

            <h1 style="margin:0 0 6px; font-size:26px; font-weight:700; letter-spacing:-.02em;">
                {{ t('common.appName') }}
            </h1>
            <div style="font-size:14px; color:var(--ink-2); margin-bottom:6px;">{{ t('common.console') }}</div>
            <p style="font-size:13.5px; color:var(--ink-3); margin:0 0 30px;">{{ t('login.tagline') }}</p>

            <!-- actions -->
            <button
                type="button"
                @click="login"
                style="width:100%; height:44px; border:none; border-radius:11px; background:var(--accent); color:var(--accent-ink); font-family:inherit; font-size:14px; font-weight:600; cursor:pointer; box-shadow:var(--shadow);"
            >
                {{ t('auth.signIn') }}
            </button>


            <!-- value prop -->
            <div style="margin-top:34px; padding-top:24px; border-top:1px solid var(--line);">
                <p style="font-size:12px; color:var(--ink-3); line-height:1.6; margin:0;">
                    {{ t('login.philosophy') }}
                    <br />
                    {{ t('login.philosophySub') }}
                </p>
            </div>
        </div>
    </div>
</template>
