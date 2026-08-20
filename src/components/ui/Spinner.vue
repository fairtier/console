<script setup lang="ts">
import Icon from './Icon.vue'
withDefaults(defineProps<{ size?: number }>(), { size: 18 })
</script>

<template>
    <Icon name="spinner" :size="size" :style="{ animation: 'ftspin 0.8s linear infinite' }" />
</template>
