<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { chipFor } from '../../lib/status'

const props = defineProps<{
    status: string
    /** Optional explicit label (overrides the status default). */
    label?: string
    /** Hide the leading dot. */
    noDot?: boolean
}>()

const { t } = useI18n()
const chip = computed(() => chipFor(props.status))
const text = computed(() => props.label ?? t(chip.value.labelKey))
</script>

<template>
    <span
        class="inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11.5px] font-bold"
        :style="{ background: chip.bg, color: chip.fg }"
    >
        <span
            v-if="!noDot"
            class="h-[7px] w-[7px] rounded-full"
            :style="{ background: chip.dot }"
        />
        {{ text }}
    </span>
</template>
