<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import GitMirrorCard from '../components/GitMirrorCard.vue'
import Icon from '../components/ui/Icon.vue'
import Spinner from '../components/ui/Spinner.vue'

const { t } = useI18n()

// The box repos that may be mirrored — must match the backend allowlist
// (the FairTier API's mirror allowlist).
const REPOS = ['rill', 'transformations', 'pipelines'] as const

// Each card probes its own mirror status and reports back; the cards stay
// mounted the whole time (they render nothing until ready), so the page can
// show one spinner while probes run and one empty state if all of them hid.
const cardStates = ref<Record<string, 'ready' | 'hidden'>>({})
function onCardState(repo: string, state: 'ready' | 'hidden') {
  cardStates.value = { ...cardStates.value, [repo]: state }
}
const loading = computed(() => Object.keys(cardStates.value).length < REPOS.length)
const unavailable = computed(
  () => !loading.value && REPOS.every((r) => cardStates.value[r] === 'hidden'),
)
</script>

<template>
  <div class="mx-auto px-[34px] pb-20 pt-[34px]" style="max-width:880px">
    <!-- header -->
    <div class="mb-[22px]">
      <h1 class="m-0 mb-[5px] text-[25px] font-bold tracking-[-.02em]">{{ t('gitMirror.page.title') }}</h1>
      <div class="text-[13.5px] text-ink-2">{{ t('gitMirror.page.intro') }}</div>
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
      <div class="text-[13.5px]">{{ t('gitMirror.page.unavailable') }}</div>
    </div>

    <!-- v-show, not v-if: the cards must stay mounted while loading so their
         status probes run and report back. -->
    <div v-show="!loading">
      <GitMirrorCard
        v-for="repo in REPOS"
        :key="repo"
        :repo="repo"
        :title="t(`gitMirror.page.repos.${repo}.title`)"
        :subtitle="t(`gitMirror.page.repos.${repo}.desc`)"
        @state="(s) => onCardState(repo, s)"
      />
    </div>
  </div>
</template>
