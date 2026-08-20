// Error tracking.
//
// The SDK is Sentry's; the destination is whatever the DSN names — anything
// that speaks the Sentry envelope protocol works, so nothing here is
// vendor-specific and the destination is one config value away from changing.
//
// Off unless a DSN is configured. That is what keeps every non-production
// build silent without a mode check: no DSN is baked into the bundle
// (`.env.production` is deliberately empty), so `bun dev`, a dev build and
// the Playwright suite never ship an event. A deployment turns reporting on
// at runtime through `FT_SENTRY_DSN` (empty = off) — a self-hosted Console
// has no business reporting into anyone else's project.

import type { App } from 'vue'
import * as Sentry from '@sentry/vue'
import { runtimeConfig } from '../config/runtime'

/**
 * Installs the error handler on a Vue app. Call before `mount()` — Sentry
 * hooks `app.config.errorHandler`, and a component that throws during the
 * first render would otherwise go unreported.
 *
 * A no-op when no DSN is configured.
 */
export function initErrorTracking(app: App): void {
    const dsn = runtimeConfig().sentryDsn
    if (!dsn) return

    Sentry.init({
        app,
        dsn,
        environment: import.meta.env.MODE,
        // Errors only. The default integrations already give us the breadcrumbs
        // that make a stack trace readable (navigation, fetch/XHR, console),
        // and browser tracing would add both bundle weight and a stream of
        // transaction envelopes for a dashboard nobody profiles. Add
        // `tracesSampleRate` + `Sentry.browserTracingIntegration()` if that
        // ever stops being true.
        //
        // Stack traces arrive minified: the production build emits no source
        // maps and we upload none. Fixing that needs a source-map upload step
        // in CI (an authenticated one — a real secret), not a change here.
        sendDefaultPii: false,
    })
}
