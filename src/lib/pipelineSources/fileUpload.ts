import type { PipelineSource } from './types'

export const fileUpload: PipelineSource = {
    key: 'file_upload',
    id: 'file_upload',
    group: 'files',
    labelKey: 'pipelines.sourceTypes.file_upload',
    badge: { abbr: 'UP', bg: 'var(--warn-soft)', fg: 'var(--warn-ink)' },

    // No guided form and no JSON editor either: the config is the
    // platform-managed file list, written by the uploads themselves and never
    // hand-edited. The wizard shows the file drop where the config would be.
    guided: false,
    // The platform injects the workspace's own storage credentials
    // server-side, so there is nothing for the user to supply.
    credentials: false,
    credentialFields: [],
    // Runs manually: drop a file, hit run.
    schedulable: false,
    fileDrop: true,
    googleScope: () => '',

    // Neither raw editor is ever rendered for this type: the file drop takes
    // the config's place, and the platform holds the credentials.
    configPlaceholder: '{}',
    credentialsPlaceholder: '{}',

    isGuidable: () => false,
    toForm: () => ({}),
    toConfig: () => ({}),

    // Applied when the user selects this type while creating. Replace keeps
    // the table matching the file that was last dropped.
    defaults: { credentialsRaw: '', schedule: '', writeDisposition: 'replace' },
}
