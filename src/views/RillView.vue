<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { assistClient } from '../api'
import type { FileEntry } from '../api/gen/boxrepo_pb.js'
import { useWorkspaceStore } from '../stores/workspace'
import Icon from '../components/ui/Icon.vue'
import BoxRepoEditor from '../components/BoxRepoEditor.vue'
import DemoProjectCard from '../components/DemoProjectCard.vue'

const { t } = useI18n()
const customerStore = useWorkspaceStore()

// The editor engine (file tree, CodeMirror, save, history, AI) lives in the
// shared BoxRepoEditor; this view only owns the Rill page chrome (heading, the
// external "Open Rill" link, the starter-demo card and the git-mirror link).
const editor = ref<InstanceType<typeof BoxRepoEditor> | null>(null)
const repoFiles = ref<FileEntry[]>([])
const editorReady = ref(false)

const rillUrl = computed(() => customerStore.connectionDetails?.rillUrl ?? '')

// The demo card offers "Load" only while the workspace has no dashboards yet.
const workspaceEmpty = computed(
  () => !repoFiles.value.some((f) => f.path.startsWith('dashboards/') || f.path.startsWith('metrics/')),
)

function onLoaded(files: FileEntry[]) {
  repoFiles.value = files
  editorReady.value = true
}

function draftRill(prompt: string, existingPaths: string[]) {
  return assistClient.draftRillDashboard({ prompt, existingPaths })
}

onMounted(() => {
  void customerStore.ensureLoaded()
})
</script>

<template>
  <div style="max-width:1180px; margin:0 auto; padding:34px 34px 80px;">
    <div style="display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:22px;">
      <div>
        <h1 style="margin:0 0 5px; font-size:25px; font-weight:700; letter-spacing:-.02em;">{{ t('rillUi.heading') }}</h1>
        <div style="font-size:13.5px; color:var(--ink-2);">{{ t('rillUi.subtitle') }}</div>
      </div>
      <a
        v-if="rillUrl"
        :href="rillUrl"
        target="_blank"
        rel="noopener"
        style="display:flex; align-items:center; gap:8px; height:40px; padding:0 16px; border:1px solid var(--line); border-radius:11px; background:var(--surface); color:var(--ink); font-size:13.5px; font-weight:600; text-decoration:none; flex:none;"
      >
        <Icon name="launch" :size="15" />{{ t('rillUi.openRill') }}
      </a>
    </div>

    <!-- Starter demo (Load when no dashboards / Remove when loaded) -->
    <DemoProjectCard
      v-if="editorReady"
      :workspace-empty="workspaceEmpty"
      @changed="() => editor?.reload()"
    />

    <BoxRepoEditor
      ref="editor"
      repo="rill"
      t-prefix="rillUi"
      :new-file-roots="['models/', 'metrics/', 'dashboards/']"
      new-file-placeholder="dashboards/revenue.yaml"
      :ai-draft="draftRill"
      @loaded="onLoaded"
    />

    <!-- Push mirrors were consolidated onto the Workspace → Git page. -->
    <RouterLink
      v-if="editorReady"
      :to="{ name: 'git' }"
      style="display:inline-flex; align-items:center; gap:6px; margin-top:18px; font-size:12.5px; font-weight:600; color:var(--ink-3); text-decoration:none;"
    >
      <Icon name="link" :size="13" />{{ t('gitMirror.movedLink') }}
    </RouterLink>
  </div>
</template>
