<script setup lang="ts">
// Drop zone + file list for a file_upload pipeline. Used by the pipeline
// wizard both right after creating the pipeline and when editing it.
// Uploads run sequentially (the backend updates the pipeline config per
// file), then the list is re-fetched from the server as the source of truth.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { pipelineClient } from '../api'
import type { UploadedFile } from '../api/gen/pipeline_pb'
import { FILE_DROP_ACCEPT, uploadPipelineFile } from '../api/filedrop'
import { errorMessage } from '../api/errors'
import { useToast } from '../composables/useToast'
import Icon from './ui/Icon.vue'
import Spinner from './ui/Spinner.vue'

const props = defineProps<{ pipelineId: string }>()
const emit = defineEmits<{ (e: 'changed', count: number): void }>()

const { t } = useI18n()
const toast = useToast()

const files = ref<UploadedFile[]>([])
const loading = ref(true)
const uploading = ref<string[]>([]) // filenames currently in flight
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const hasMissing = computed(() => files.value.some((f) => f.missing))

async function refresh() {
  try {
    const resp = await pipelineClient.listUploadedFiles({ pipelineId: props.pipelineId })
    files.value = resp.files
    emit('changed', files.value.length)
  } finally {
    loading.value = false
  }
}

onMounted(refresh)

async function uploadAll(list: FileList | File[]) {
  for (const file of Array.from(list)) {
    uploading.value = [...uploading.value, file.name]
    try {
      await uploadPipelineFile(props.pipelineId, file)
    } catch (err) {
      toast.error(errorMessage(err, t('pipelinesUi.fileDrop.uploadFailed', { file: file.name })))
    } finally {
      uploading.value = uploading.value.filter((n) => n !== file.name)
    }
  }
  await refresh()
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) void uploadAll(input.files)
  input.value = ''
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  if (e.dataTransfer?.files.length) void uploadAll(e.dataTransfer.files)
}

async function removeFile(name: string) {
  try {
    await pipelineClient.deleteUploadedFile({ pipelineId: props.pipelineId, file: name })
    await refresh()
  } catch (err) {
    toast.error(errorMessage(err, t('pipelinesUi.fileDrop.deleteFailed')))
  }
}

function formatSize(bytes: bigint | number): string {
  const n = Number(bytes)
  if (n >= 1 << 30) return `${(n / (1 << 30)).toFixed(1)} GiB`
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MiB`
  if (n >= 1 << 10) return `${(n / (1 << 10)).toFixed(1)} KiB`
  return `${n} B`
}
</script>

<template>
  <div>
    <!-- Drop zone -->
    <div
      @click="fileInput?.click()"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
      :style="{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
        border: '1.5px dashed', borderColor: dragOver ? 'var(--accent)' : 'var(--line)',
        borderRadius: '14px', padding: '26px 16px', cursor: 'pointer',
        background: dragOver ? 'var(--accent-soft)' : 'var(--surface-2)',
        transition: 'background .15s, border-color .15s',
      }"
    >
      <Icon name="file" :size="22" :style="{ color: 'var(--ink-3)' }" />
      <div style="font-size:13.5px; font-weight:600; color:var(--ink-2);">{{ t('pipelinesUi.fileDrop.dropHint') }}</div>
      <div style="font-size:12px; color:var(--ink-3);">{{ t('pipelinesUi.fileDrop.formats') }}</div>
      <input ref="fileInput" type="file" multiple :accept="FILE_DROP_ACCEPT" style="display:none;" @change="onPick" />
    </div>

    <!-- In-flight uploads -->
    <div v-for="name in uploading" :key="name" style="display:flex; align-items:center; gap:9px; padding:10px 4px; font-size:13px; color:var(--ink-2);">
      <Spinner :size="14" />{{ t('pipelinesUi.fileDrop.uploading', { file: name }) }}
    </div>

    <!-- Uploaded files -->
    <div v-if="loading" style="display:flex; justify-content:center; padding:14px;">
      <Spinner :size="16" />
    </div>
    <template v-else>
      <!-- Missing-file warning: a table whose object is gone loads 0 rows -->
      <div
        v-if="hasMissing"
        style="display:flex; align-items:flex-start; gap:8px; margin-top:12px; padding:10px 12px; border-radius:10px; background:var(--warn-soft); color:var(--warn-ink); font-size:12.5px; line-height:1.45;"
      >
        <Icon name="danger" :size="15" :style="{ color: 'var(--warn)', flex: 'none', marginTop: '1px' }" />
        <span>{{ t('pipelinesUi.fileDrop.missingWarning') }}</span>
      </div>

      <div
        v-for="f in files"
        :key="f.file"
        style="display:flex; align-items:center; gap:10px; padding:10px 4px; border-bottom:1px solid var(--line);"
      >
        <Icon
          :name="f.missing ? 'danger' : 'file'"
          :size="15"
          :style="{ color: f.missing ? 'var(--warn)' : 'var(--ink-3)', flex: 'none' }"
        />
        <span style="font-family:'JetBrains Mono',monospace; font-size:13px; color:var(--ink);">{{ f.file }}</span>
        <span
          v-if="f.missing"
          :title="t('pipelinesUi.fileDrop.missingHint', { file: f.file })"
          style="font-family:'JetBrains Mono',monospace; font-size:11.5px; background:var(--warn-soft); color:var(--warn-ink); border-radius:7px; padding:2px 8px;"
        >⚠ {{ t('pipelinesUi.fileDrop.missingBadge') }}</span>
        <span
          v-else
          :title="t('pipelinesUi.fileDrop.tableHint')"
          style="font-family:'JetBrains Mono',monospace; font-size:11.5px; background:var(--accent-soft); color:var(--accent-soft-ink); border-radius:7px; padding:2px 8px;"
        >→ {{ f.name }}</span>
        <span style="margin-left:auto; font-size:12px; color:var(--ink-3);">{{ formatSize(f.sizeBytes) }}</span>
        <button
          @click="removeFile(f.file)"
          :title="t('pipelinesUi.fileDrop.delete')"
          style="border:none; background:transparent; color:var(--ink-3); cursor:pointer; display:flex; padding:4px;"
        >
          <Icon name="trash" :size="14" />
        </button>
      </div>
      <div v-if="!files.length && !uploading.length" style="padding:12px 4px; font-size:12.5px; color:var(--ink-3);">
        {{ t('pipelinesUi.fileDrop.empty') }}
      </div>
    </template>
  </div>
</template>
