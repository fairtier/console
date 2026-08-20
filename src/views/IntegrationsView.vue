<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GoogleOAuthCard from '../components/GoogleOAuthCard.vue'
import GoogleConnectionsCard from '../components/GoogleConnectionsCard.vue'
import Icon from '../components/ui/Icon.vue'
import Spinner from '../components/ui/Spinner.vue'

const { t } = useI18n()

// What this workspace connects sources with: the Google *account* connection
// (workspace-level, consumed by pipelines and live SQL) first, then the
// Google *application* it depends on. The page exists because connecting is a
// one-time setup step that has to be findable outside the pipeline wizard.
const CARDS = ['google-account', 'google'] as const

// Same pattern as GitView: each card probes its own availability and reports
// back, so the page shows one spinner while probes run and one empty state if
// every card hid itself.
const cardStates = ref<Record<string, 'ready' | 'hidden'>>({})
function onCardState(card: string, state: 'ready' | 'hidden') {
  cardStates.value = { ...cardStates.value, [card]: state }
}
const loading = computed(() => Object.keys(cardStates.value).length < CARDS.length)
const unavailable = computed(
  () => !loading.value && CARDS.every((c) => cardStates.value[c] === 'hidden'),
)
</script>

<template>
  <div class="mx-auto px-[34px] pb-20 pt-[34px]" style="max-width:880px">
    <div class="mb-[22px]">
      <h1 class="m-0 mb-[5px] text-[25px] font-bold tracking-[-.02em]">{{ t('integrations.page.title') }}</h1>
      <div class="text-[13.5px] text-ink-2">{{ t('integrations.page.intro') }}</div>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-24 text-ink-3">
      <Spinner :size="24" />
    </div>

    <div
      v-else-if="unavailable"
      class="flex flex-col items-center gap-2.5 rounded-2xl border px-[22px] py-[46px] text-center"
      style="background:var(--surface); border-color:var(--line); box-shadow:var(--shadow); color:var(--ink-3)"
    >
      <Icon name="link" :size="26" />
      <div class="text-[13.5px]">{{ t('integrations.page.unavailable') }}</div>
    </div>

    <!-- v-show, not v-if: the cards must stay mounted while loading so their
         probes run and report back. -->
    <div v-show="!loading">
      <GoogleConnectionsCard @state="(s) => onCardState('google-account', s)" />
      <GoogleOAuthCard @state="(s) => onCardState('google', s)" />
    </div>
  </div>
</template>
