// File-drop upload helper. The upload is a plain HTTP endpoint (not
// ConnectRPC) because browsers cannot client-stream over connect-web and the
// backend streams the body straight into the workspace bucket. Listing and
// deleting files go through the regular pipelineClient RPCs.

import { workspaceApiBase, workspaceAuthToken } from './transport'

/** Accept attribute for file inputs — mirrors the backend's extension allowlist. */
export const FILE_DROP_ACCEPT = '.csv,.tsv,.parquet,.jsonl,.ndjson'

export interface DroppedFile {
    name: string
    file: string
    size_bytes: number
    uploaded_at: string
}

export async function uploadPipelineFile(pipelineId: string, file: File): Promise<DroppedFile> {
    const base = workspaceApiBase()
    const token = workspaceAuthToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const resp = await fetch(
        `${base}/filedrop/${encodeURIComponent(pipelineId)}/${encodeURIComponent(file.name)}`,
        { method: 'POST', headers, body: file },
    )
    if (!resp.ok) {
        let message = `Upload failed (HTTP ${resp.status})`
        try {
            const body = (await resp.json()) as { error?: string }
            if (body.error) message = body.error
        } catch {
            // keep the generic message
        }
        throw new Error(message)
    }
    return (await resp.json()) as DroppedFile
}
