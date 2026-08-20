<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ConnectError, Code } from '@connectrpc/connect'
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { sql, PostgreSQL } from '@codemirror/lang-sql'
import { yaml } from '@codemirror/lang-yaml'
import { tags } from '@lezer/highlight'
import { boxRepoClient } from '../api'
import { errorMessage } from '../api/errors'
import type { FileEntry, FileCommit } from '../api/gen/boxrepo_pb.js'
import type { DraftFile } from '../api/gen/assist_pb.js'
import Icon from './ui/Icon.vue'
import Spinner from './ui/Spinner.vue'
import { useToast } from '../composables/useToast'
import { useConfirm } from '../composables/useConfirm'

// Generic box-repo file editor (CodeMirror tree + tabs + save-with-conflict +
// version history + optional AI draft). Drives the box Gitea REST contents API
// via boxRepoClient for whatever `repo` it is pointed at (rill, transformations,
// …). All copy is resolved under `tPrefix` so each host keeps its own voice
// (e.g. Rill mentions hot-reload; dbt mentions dbt build) — the two namespaces
// share an identical key structure (see rillUi.* / transformationsUi.editor.*).
const props = defineProps<{
  // Box repo to edit (must be in the BoxRepoService allowlist).
  repo: string
  // i18n key prefix holding this editor's chrome copy, e.g. 'rillUi' or
  // 'transformationsUi.editor'. Both must expose the same sub-keys.
  tPrefix: string
  // Allowed top-level dirs for new files, e.g. ['models/','metrics/'].
  newFileRoots: string[]
  // Placeholder shown in the new-file path input.
  newFilePlaceholder?: string
  // When provided, the AI draft panel is shown and calls this. Omit to hide it.
  aiDraft?: (prompt: string, existingPaths: string[]) => Promise<{ files: DraftFile[]; notes: string }>
}>()

const emit = defineEmits<{
  // Fires whenever the file list is (re)loaded — lets hosts derive empty-state.
  (e: 'loaded', files: FileEntry[]): void
  // Fires after a successful save (a new commit landed on the box).
  (e: 'changed'): void
}>()

const { t } = useI18n()
// Prefixed translate — all editor copy lives under props.tPrefix.
function tp(key: string, named?: Record<string, unknown>): string {
  return named ? t(`${props.tPrefix}.${key}`, named) : t(`${props.tPrefix}.${key}`)
}

const toast = useToast()
const { confirm } = useConfirm()

type ViewState = 'loading' | 'unavailable' | 'error' | 'ready'
const viewState = ref<ViewState>('loading')
const loadError = ref('')

const files = ref<FileEntry[]>([])

interface Buffer {
  path: string
  content: string
  sha: string // '' = new file, PutFile creates it
  dirty: boolean
}
const buffers = ref<Buffer[]>([])
const activePath = ref<string | null>(null)
const saving = ref(false)
const fileLoading = ref(false)

// --- AI draft panel ---------------------------------------------------------
const aiOpen = ref(false)
const aiPrompt = ref('')
const drafting = ref(false)
const draftNotes = ref('')

// --- New file ---------------------------------------------------------------
const newFileOpen = ref(false)
const newFilePath = ref('')

// --- Version history --------------------------------------------------------
const historyOpen = ref(false)
const historyLoading = ref(false)
const historyCommits = ref<FileCommit[]>([])

const newFilePlaceholderText = computed(
  () => props.newFilePlaceholder ?? `${props.newFileRoots[0] ?? ''}example.sql`,
)

const groupedFiles = computed(() => {
  const groups: Record<string, FileEntry[]> = {}
  for (const f of files.value) {
    const slash = f.path.indexOf('/')
    const dir = slash > 0 ? f.path.slice(0, slash) : tp('files.other')
    ;(groups[dir] ??= []).push(f)
  }
  return groups
})

const activeBuffer = computed(() => buffers.value.find((b) => b.path === activePath.value) ?? null)

// silent skips the full-section loading state — used by a host's background
// poll so a refresh every few seconds doesn't flash the editor.
async function loadFiles(silent = false) {
  if (!silent) viewState.value = 'loading'
  try {
    const resp = await boxRepoClient.listFiles({ repo: props.repo })
    files.value = resp.files
    emit('loaded', resp.files)
    viewState.value = 'ready'
  } catch (err) {
    // FAILED_PRECONDITION covers every "not for this workspace (yet)" case:
    // not a dedicated box, repo disabled, or the box has not deposited its
    // editor credentials yet.
    if (err instanceof ConnectError && err.code === Code.FailedPrecondition) {
      viewState.value = 'unavailable'
    } else {
      loadError.value = errorMessage(err, tp('toast.loadFailed'))
      viewState.value = 'error'
    }
  }
}

// Reload the file list; exposed so hosts (e.g. a demo loader) can refresh the
// editor after they mutate the repo out-of-band.
defineExpose({ reload: () => loadFiles(true) })

async function openFile(path: string) {
  const existing = buffers.value.find((b) => b.path === path)
  if (existing) {
    activePath.value = path
    return
  }
  fileLoading.value = true
  try {
    const resp = await boxRepoClient.getFile({ repo: props.repo, path })
    buffers.value.push({ path, content: resp.content, sha: resp.sha, dirty: false })
    activePath.value = path
  } catch (err) {
    toast.error(errorMessage(err, tp('toast.openFailed')))
  } finally {
    fileLoading.value = false
  }
}

async function closeBuffer(path: string) {
  const buf = buffers.value.find((b) => b.path === path)
  if (buf?.dirty) {
    const ok = await confirm({
      title: tp('closeConfirm.title'),
      body: tp('closeConfirm.body', { path }),
      confirmLabel: tp('closeConfirm.confirm'),
      danger: true,
    })
    if (!ok) return
  }
  buffers.value = buffers.value.filter((b) => b.path !== path)
  if (activePath.value === path) {
    activePath.value = buffers.value[0]?.path ?? null
  }
}

async function saveActive() {
  const buf = activeBuffer.value
  if (!buf || saving.value) return
  saving.value = true
  try {
    const resp = await boxRepoClient.putFile({
      repo: props.repo,
      path: buf.path,
      content: buf.content,
      sha: buf.sha,
      message: '',
    })
    buf.sha = resp.sha
    buf.dirty = false
    toast.success(tp('toast.saved'))
    emit('changed')
    await loadFiles()
  } catch (err) {
    if (err instanceof ConnectError && err.code === Code.Aborted) {
      toast.error(tp('toast.conflict'))
    } else {
      toast.error(errorMessage(err, tp('toast.saveFailed')))
    }
  } finally {
    saving.value = false
  }
}

async function reloadActive() {
  const buf = activeBuffer.value
  if (!buf) return
  if (buf.dirty) {
    const ok = await confirm({
      title: tp('reloadConfirm.title'),
      body: tp('reloadConfirm.body'),
      confirmLabel: tp('reloadConfirm.confirm'),
      danger: true,
    })
    if (!ok) return
  }
  try {
    const resp = await boxRepoClient.getFile({ repo: props.repo, path: buf.path })
    buf.content = resp.content
    buf.sha = resp.sha
    buf.dirty = false
    syncEditor()
  } catch (err) {
    toast.error(errorMessage(err, tp('toast.openFailed')))
  }
}

function toggleHistory() {
  historyOpen.value = !historyOpen.value
  if (historyOpen.value) void loadHistory()
}

async function loadHistory() {
  const buf = activeBuffer.value
  if (!buf) return
  historyLoading.value = true
  try {
    const resp = await boxRepoClient.listFileHistory({ repo: props.repo, path: buf.path })
    historyCommits.value = resp.commits
  } catch (err) {
    historyOpen.value = false
    toast.error(errorMessage(err, tp('history.loadFailed')))
  } finally {
    historyLoading.value = false
  }
}

// Restoring = loading the old content into the buffer and saving through the
// normal flow — a forward commit guarded by the current blob sha, never a
// git revert.
async function loadVersion(commit: FileCommit) {
  const buf = activeBuffer.value
  if (!buf) return
  try {
    const resp = await boxRepoClient.getFileAtRef({ repo: props.repo, path: buf.path, ref: commit.sha })
    buf.content = resp.content
    buf.dirty = true
    syncEditor()
    toast.info(tp('history.loaded', { sha: commit.sha.slice(0, 8) }))
  } catch (err) {
    toast.error(errorMessage(err, tp('history.loadVersionFailed')))
  }
}

function commitSummary(message: string): string {
  return message.split('\n')[0] ?? ''
}

function formatRelative(iso: string): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const sec = Math.round((Date.now() - then) / 1000)
  const min = Math.round(sec / 60)
  const hr = Math.round(min / 60)
  const day = Math.round(hr / 24)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (Math.abs(sec) < 60) return rtf.format(-sec, 'second')
  if (Math.abs(min) < 60) return rtf.format(-min, 'minute')
  if (Math.abs(hr) < 24) return rtf.format(-hr, 'hour')
  return rtf.format(-day, 'day')
}

function createNewFile() {
  const path = newFilePath.value.trim()
  if (!props.newFileRoots.some((r) => path.startsWith(r) && path.length > r.length)) {
    toast.error(tp('toast.badNewPath'))
    return
  }
  if (!buffers.value.some((b) => b.path === path)) {
    const known = files.value.find((f) => f.path === path)
    buffers.value.push({ path, content: '', sha: known?.sha ?? '', dirty: true })
  }
  activePath.value = path
  newFileOpen.value = false
  newFilePath.value = ''
}

async function draftWithAI() {
  const prompt = aiPrompt.value.trim()
  if (!prompt || drafting.value || !props.aiDraft) return
  drafting.value = true
  try {
    const resp = await props.aiDraft(prompt, files.value.map((f) => f.path))
    draftNotes.value = resp.notes
    for (const f of resp.files) {
      const existing = buffers.value.find((b) => b.path === f.path)
      if (existing) {
        existing.content = f.content
        existing.dirty = true
      } else {
        // Keep the repo sha when the draft overwrites an existing file so a
        // save updates it instead of failing as a duplicate create.
        const known = files.value.find((x) => x.path === f.path)
        buffers.value.push({ path: f.path, content: f.content, sha: known?.sha ?? '', dirty: true })
      }
    }
    if (resp.files.length > 0) {
      activePath.value = resp.files[0]!.path
    }
    toast.success(tp('ai.drafted', { count: resp.files.length }))
  } catch (err) {
    if (err instanceof ConnectError && err.code === Code.Unimplemented) {
      toast.info(tp('ai.notConfigured'))
    } else if (err instanceof ConnectError && err.code === Code.ResourceExhausted) {
      toast.info(tp('ai.rateLimited'))
    } else {
      toast.error(errorMessage(err, tp('ai.draftFailed')))
    }
  } finally {
    drafting.value = false
  }
}

// --- CodeMirror (same var-based theme approach as components/sql/SqlEditor) --
const host = ref<HTMLElement | null>(null)
let view: EditorView | null = null
const langCompartment = new Compartment()

const theme = EditorView.theme({
  '&': { fontSize: '13px', height: '100%', backgroundColor: 'var(--surface)', color: 'var(--ink)' },
  '.cm-content': { fontFamily: "'JetBrains Mono', monospace", caretColor: 'var(--accent)', padding: '10px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground': { backgroundColor: 'var(--accent-soft)' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '&.cm-focused .cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 4%, transparent)' },
  '.cm-gutters': {
    backgroundColor: 'var(--surface)',
    color: 'var(--ink-3)',
    border: 'none',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11.5px',
  },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink-2)' },
})

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--accent)', fontWeight: '600' },
  { tag: tags.string, color: 'var(--ok)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--warn)' },
  { tag: tags.comment, color: 'var(--ink-3)', fontStyle: 'italic' },
  { tag: [tags.propertyName, tags.attributeName], color: 'var(--info)' },
])

function langFor(path: string) {
  return path.endsWith('.sql') ? sql({ dialect: PostgreSQL }) : yaml()
}

function initEditor() {
  if (view || !host.value || !activeBuffer.value) return
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: activeBuffer.value.content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        langCompartment.of(langFor(activeBuffer.value.path)),
        theme,
        syntaxHighlighting(highlight),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && activeBuffer.value) {
            activeBuffer.value.content = update.state.doc.toString()
            activeBuffer.value.dirty = true
          }
        }),
      ],
    }),
  })
}

function syncEditor() {
  const buf = activeBuffer.value
  if (!buf) return
  if (!view) {
    nextTick(initEditor)
    return
  }
  if (view.state.doc.toString() !== buf.content) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: buf.content } })
  }
  view.dispatch({ effects: langCompartment.reconfigure(langFor(buf.path)) })
}

watch(activePath, () => {
  nextTick(syncEditor)
  if (historyOpen.value) void loadHistory()
})

onMounted(() => {
  void loadFiles()
})
onBeforeUnmount(() => {
  view?.destroy()
  view = null
})
</script>

<template>
  <div>
    <!-- Loading -->
    <div v-if="viewState === 'loading'" style="display:flex; align-items:center; justify-content:center; padding:60px 0;">
      <Spinner />
    </div>

    <!-- Unavailable (not a box / repo disabled / credentials not deposited) -->
    <div
      v-else-if="viewState === 'unavailable'"
      style="background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); padding:48px 34px; text-align:center;"
    >
      <div style="width:48px; height:48px; margin:0 auto 16px; border-radius:13px; background:var(--inset); color:var(--ink-3); display:flex; align-items:center; justify-content:center;">
        <Icon name="file" :size="24" />
      </div>
      <h2 style="margin:0 0 6px; font-size:18px; font-weight:700; letter-spacing:-.01em;">{{ tp('unavailable.title') }}</h2>
      <div style="font-size:13.5px; color:var(--ink-2); max-width:460px; margin:0 auto 22px; line-height:1.55;">{{ tp('unavailable.body') }}</div>
      <button
        @click="() => loadFiles()"
        style="display:inline-flex; align-items:center; gap:8px; height:40px; padding:0 18px; border:1px solid var(--line); border-radius:11px; background:var(--surface-2); color:var(--ink); font-family:inherit; font-size:13.5px; font-weight:600; cursor:pointer;"
      >
        <Icon name="refresh" :size="15" />{{ tp('retry') }}
      </button>
    </div>

    <!-- Error -->
    <div
      v-else-if="viewState === 'error'"
      style="background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); padding:48px 34px; text-align:center;"
    >
      <h2 style="margin:0 0 6px; font-size:18px; font-weight:700;">{{ tp('error.title') }}</h2>
      <div style="font-size:13.5px; color:var(--err); margin-bottom:22px;">{{ loadError }}</div>
      <button
        @click="() => loadFiles()"
        style="display:inline-flex; align-items:center; gap:8px; height:40px; padding:0 18px; border:1px solid var(--line); border-radius:11px; background:var(--surface-2); color:var(--ink); font-family:inherit; font-size:13.5px; font-weight:600; cursor:pointer;"
      >
        <Icon name="refresh" :size="15" />{{ tp('retry') }}
      </button>
    </div>

    <!-- Editor -->
    <div
      v-else
      style="display:grid; grid-template-columns:250px 1fr; gap:0; background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:var(--shadow); overflow:hidden; min-height:560px;"
    >
      <!-- Sidebar -->
      <div style="border-right:1px solid var(--line); display:flex; flex-direction:column; min-height:0;">
        <!-- AI draft -->
        <div v-if="aiDraft" style="border-bottom:1px solid var(--line); padding:12px;">
          <button
            @click="aiOpen = !aiOpen"
            style="display:flex; align-items:center; gap:8px; width:100%; border:none; background:var(--clay-soft); color:var(--clay); border-radius:10px; padding:9px 12px; font-family:inherit; font-size:13px; font-weight:700; cursor:pointer;"
          >
            <Icon name="sparkle" :size="15" />{{ tp('ai.button') }}
          </button>
          <div v-if="aiOpen" style="margin-top:10px;">
            <textarea
              v-model="aiPrompt"
              rows="3"
              :placeholder="tp('ai.placeholder')"
              style="width:100%; padding:10px 11px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--ink); font-family:inherit; font-size:13px; line-height:1.5; resize:vertical; outline:none;"
            ></textarea>
            <button
              @click="draftWithAI"
              :disabled="!aiPrompt.trim() || drafting"
              :style="{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', width: '100%',
                marginTop: '8px', height: '36px', border: 'none', borderRadius: '10px',
                background: 'var(--clay)', color: '#fff', fontFamily: 'inherit', fontSize: '13px', fontWeight: 600,
                opacity: (!aiPrompt.trim() || drafting) ? 0.5 : 1,
                cursor: (!aiPrompt.trim() || drafting) ? 'not-allowed' : 'pointer',
              }"
            >
              <Spinner v-if="drafting" :size="14" />
              <Icon v-else name="sparkle" :size="14" />{{ tp('ai.draft') }}
            </button>
            <div v-if="draftNotes" style="margin-top:8px; font-size:12px; color:var(--ink-2); line-height:1.5; background:var(--inset); border:1px solid var(--line); border-radius:9px; padding:9px 11px;">{{ draftNotes }}</div>
          </div>
        </div>

        <!-- File tree -->
        <div style="flex:1; overflow-y:auto; padding:10px 12px;">
          <div v-for="(group, dir) in groupedFiles" :key="dir" style="margin-bottom:12px;">
            <div style="font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3); padding:4px 6px;">{{ dir }}</div>
            <button
              v-for="f in group"
              :key="f.path"
              @click="openFile(f.path)"
              style="display:block; width:100%; text-align:left; border:none; border-radius:8px; padding:6px 8px; font-family:'JetBrains Mono',monospace; font-size:12px; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"
              :style="{
                background: activePath === f.path ? 'var(--accent-soft)' : 'transparent',
                color: activePath === f.path ? 'var(--accent-soft-ink)' : 'var(--ink-2)',
              }"
            >{{ f.path.split('/').slice(1).join('/') || f.path }}</button>
          </div>
          <div v-if="files.length === 0" style="font-size:12.5px; color:var(--ink-3); padding:6px; line-height:1.5;">{{ tp('files.empty') }}</div>
        </div>

        <!-- New file -->
        <div style="border-top:1px solid var(--line); padding:10px 12px;">
          <button
            v-if="!newFileOpen"
            @click="newFileOpen = true"
            style="display:flex; align-items:center; gap:7px; border:none; background:transparent; color:var(--accent); font-family:inherit; font-size:12.5px; font-weight:700; cursor:pointer; padding:4px 2px;"
          >
            <Icon name="plus" :size="13" />{{ tp('files.new') }}
          </button>
          <div v-else>
            <input
              v-model="newFilePath"
              type="text"
              :placeholder="newFilePlaceholderText"
              style="width:100%; height:32px; padding:0 9px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--ink); font-family:'JetBrains Mono',monospace; font-size:12px; outline:none;"
              @keydown.enter="createNewFile"
              @keydown.esc="newFileOpen = false"
            />
            <div style="display:flex; gap:8px; margin-top:6px;">
              <button @click="createNewFile" style="border:none; background:transparent; color:var(--accent); font-family:inherit; font-size:12px; font-weight:700; cursor:pointer;">{{ tp('files.create') }}</button>
              <button @click="newFileOpen = false" style="border:none; background:transparent; color:var(--ink-3); font-family:inherit; font-size:12px; font-weight:600; cursor:pointer;">{{ tp('files.cancel') }}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Main pane -->
      <div style="display:flex; flex-direction:column; min-width:0; min-height:0;">
        <!-- Tabs + actions -->
        <div v-if="buffers.length" style="display:flex; align-items:center; border-bottom:1px solid var(--line);">
          <div style="flex:1; display:flex; overflow-x:auto; min-width:0;">
            <div
              v-for="b in buffers"
              :key="b.path"
              style="display:flex; align-items:center; gap:7px; padding:10px 14px; cursor:pointer; font-family:'JetBrains Mono',monospace; font-size:12px; white-space:nowrap;"
              :style="{
                borderBottom: activePath === b.path ? '2px solid var(--accent)' : '2px solid transparent',
                color: activePath === b.path ? 'var(--ink)' : 'var(--ink-3)',
              }"
              @click="activePath = b.path"
            >
              <span v-if="b.dirty" style="width:7px; height:7px; border-radius:50%; background:var(--warn); flex:none;"></span>
              {{ b.path }}
              <button
                @click.stop="closeBuffer(b.path)"
                style="border:none; background:transparent; color:var(--ink-3); cursor:pointer; padding:0; display:flex;"
              ><Icon name="x" :size="12" /></button>
            </div>
          </div>
          <div style="display:flex; gap:8px; padding:0 12px; flex:none;">
            <button
              @click="toggleHistory"
              :disabled="!activeBuffer"
              style="display:flex; align-items:center; gap:6px; height:32px; padding:0 12px; border:1px solid var(--line); border-radius:9px; font-family:inherit; font-size:12.5px; font-weight:600; cursor:pointer;"
              :style="{
                background: historyOpen ? 'var(--accent-soft)' : 'var(--surface-2)',
                color: historyOpen ? 'var(--accent-soft-ink)' : 'var(--ink-2)',
              }"
            >
              <Icon name="clock" :size="13" />{{ tp('history.button') }}
            </button>
            <button
              @click="reloadActive"
              :disabled="!activeBuffer"
              style="display:flex; align-items:center; gap:6px; height:32px; padding:0 12px; border:1px solid var(--line); border-radius:9px; background:var(--surface-2); color:var(--ink-2); font-family:inherit; font-size:12.5px; font-weight:600; cursor:pointer;"
            >
              <Icon name="refresh" :size="13" />{{ tp('editor.reload') }}
            </button>
            <button
              @click="saveActive"
              :disabled="!activeBuffer?.dirty || saving"
              :style="{
                display: 'flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 14px',
                border: 'none', borderRadius: '9px', background: 'var(--accent)', color: 'var(--accent-ink)',
                fontFamily: 'inherit', fontSize: '12.5px', fontWeight: 600,
                opacity: (!activeBuffer?.dirty || saving) ? 0.5 : 1,
                cursor: (!activeBuffer?.dirty || saving) ? 'not-allowed' : 'pointer',
              }"
            >
              <Spinner v-if="saving" :size="13" />
              <Icon v-else name="check" :size="13" />{{ tp('editor.save') }}
            </button>
          </div>
        </div>

        <!-- Version history panel -->
        <div v-if="historyOpen && activeBuffer" style="border-bottom:1px solid var(--line); background:var(--inset); max-height:220px; overflow-y:auto;">
          <div style="padding:10px 14px 4px; font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3);">{{ tp('history.title') }}</div>
          <div v-if="historyLoading" style="display:flex; justify-content:center; padding:14px;"><Spinner :size="16" /></div>
          <div v-else-if="historyCommits.length === 0" style="padding:6px 14px 12px; font-size:12.5px; color:var(--ink-3);">{{ tp('history.empty') }}</div>
          <div v-else style="padding:2px 8px 10px;">
            <div
              v-for="c in historyCommits"
              :key="c.sha"
              style="display:flex; align-items:center; gap:10px; padding:6px 6px; border-radius:8px; font-size:12.5px;"
            >
              <span style="color:var(--ink-2); flex:none; min-width:92px;">{{ formatRelative(c.date) }}</span>
              <span style="font-weight:600; flex:none; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ c.authorName }}</span>
              <span style="font-family:'JetBrains Mono',monospace; font-size:11.5px; color:var(--ink-3); flex:none;">{{ c.sha.slice(0, 8) }}</span>
              <span style="flex:1; color:var(--ink-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ commitSummary(c.message) }}</span>
              <button
                @click="loadVersion(c)"
                style="border:1px solid var(--line); background:var(--surface); color:var(--accent); border-radius:8px; height:26px; padding:0 10px; font-family:inherit; font-size:12px; font-weight:700; cursor:pointer; flex:none;"
              >{{ tp('history.load') }}</button>
            </div>
          </div>
        </div>

        <!-- Editor host / placeholder -->
        <div v-if="fileLoading" style="flex:1; display:flex; align-items:center; justify-content:center;">
          <Spinner />
        </div>
        <div v-else-if="!activeBuffer" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:var(--ink-3);">
          <Icon name="file" :size="28" />
          <div style="font-size:13.5px;">{{ tp('editor.placeholder') }}</div>
        </div>
        <div v-show="activeBuffer && !fileLoading" ref="host" style="flex:1; min-height:0; overflow:auto;" class="[&>.cm-editor]:h-full"></div>

        <!-- Footer hint -->
        <div v-if="activeBuffer" style="border-top:1px solid var(--line); padding:8px 14px; font-size:12px; color:var(--ink-3);">
          {{ tp('editor.hint') }}
        </div>
      </div>
    </div>
  </div>
</template>
