<script setup lang="ts">
import { computed } from 'vue'

import { ICONS, type IconName } from './icons'

const props = withDefaults(defineProps<{ name: IconName; size?: number | string }>(), {
    size: 18,
})

const inner = computed(() => ICONS[props.name])
</script>

<template>
    <svg
        :width="size"
        :height="size"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        v-html="inner"
    />
</template>
