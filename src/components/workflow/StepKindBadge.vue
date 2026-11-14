<script setup lang="ts">
// The square badge in front of a step: the transformations list's "DBT" tile
// for a transformation, the pipelines icon for a pipeline.
import { useI18n } from 'vue-i18n'
import Icon from '../ui/Icon.vue'

withDefaults(defineProps<{ kind: string; size?: number }>(), { size: 24 })
const { t } = useI18n()
</script>

<template>
    <span
        :title="kind === 'transformation' ? t('workflowsUi.kind.transformation') : t('workflowsUi.kind.pipeline')"
        :style="{
            width: size + 'px', height: size + 'px', borderRadius: Math.round(size / 3.5) + 'px',
            border: '1px solid var(--line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            flex: 'none', fontSize: Math.max(8, Math.round(size / 3.2)) + 'px', fontWeight: 700, letterSpacing: '.03em',
            background: kind === 'transformation' ? 'var(--info-soft)' : 'var(--accent-soft)',
            color: kind === 'transformation' ? 'var(--info-ink)' : 'var(--accent-soft-ink)',
        }"
    >
        <template v-if="kind === 'transformation'">DBT</template>
        <Icon v-else name="pipelines" :size="Math.round(size * 0.58)" />
    </span>
</template>
