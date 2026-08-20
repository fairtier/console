/// <reference types="vite/client" />

// Build-time configuration. These are compiled into the bundle, so they are
// the same for every deployment of a given image. A deployment can override
// them at runtime via /config.json (FT_* env on the Bun server) — see
// src/config/runtime.ts. Read the resolved values through runtimeConfig(),
// not through import.meta.env directly.
interface ImportMetaEnv {
    /** Workspace API base URL — the dev-server floor; a deployed Console
     * gets it from /config.json (FT_WORKSPACE_API_URL) instead. */
    readonly VITE_WORKSPACE_API_URL?: string
    readonly VITE_AUTH_URL: string
    readonly VITE_AUTH_CLIENT_ID: string
    readonly VITE_AUTH_REDIRECT_URI: string
    readonly VITE_AUTH_ORGANIZATION: string
    /** Error-tracking DSN (Sentry SDK format). Unset
     * means error tracking is off — see src/lib/sentry.ts. */
    readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}

declare module "*.vue" {
    import type {DefineComponent} from "vue";
    const component: DefineComponent<{}, {}, any>;
    export default component;
}
