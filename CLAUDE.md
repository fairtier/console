# FairTier Workspace Console - Guide for Claude

## Project Vision

The web console of a FairTier data workspace: pipelines, transformations,
SQL, catalog, dashboards. It is served next to the workspace it manages and
talks only to that workspace's own API — accounts, billing and provisioning
belong to whoever hosts the workspace, not to this app.

- **Frontend:** Vue 3 SPA.
- **Backend:** a SEPARATE Go API (external to this repo): the public
  [workspace-api](https://github.com/fairtier/workspace-api).
- **Communication:** Connect-RPC over fetch.
- **Environment:** a container behind a TLS-terminating proxy; all
  deployment configuration is runtime `FT_*` env (see README).

## Tech Stack (2026 Standards)

- **Runtime & PM:** Bun 1.4+ (Rust-powered — 1.4 rewrote Bun from Zig to Rust).
- **Frontend:** Vue 3.5+ (Composition API with `<script setup>`).
- **Build Tool:** Vite + Rolldown (Rust-powered unified bundler).
- **State:** Pinia (Store-per-feature).
- **Styles:** Tailwind CSS 4.0+.
- **Server:** Bun.serve (Native HTTP) via `server.ts` (Simple static file server
  with SPA fallback).

## Critical Commands

- **Install:** `bun install`
- **Dev:** `bun dev` (Vite dev server)
- **Build:** `bun run build` (Rolldown production build)
- **Prod Run:** `bun run server.ts` (Serves /dist + API)
- **Unit test:** `bun test` (native Bun runner; `src/**/*.test.ts` only, scoped
  by `[test] root` in `bunfig.toml`)
- **E2E:** `bun run test:e2e` (Playwright; hermetic smoke — builds the app,
  boots `server.ts` with dummy `FT_*`, asserts the pre-login surface)
- **Type Check:** `bun run type-check` (via vue-tsc)

## Coding Standards & Patterns

- **Language:** Strict TypeScript. No `any`. Use `interface` for data, `type`
  for unions.
- **Vue Components:** - Use `<script setup lang="ts">`.
    - PascalCase for file names (e.g., `UserTable.vue`).
    - Use `defineProps<{ ... }>()` and `defineEmits()`.
- **CSS:** Utility-first Tailwind. Keep components lean; extract complex logic
  to Composables.
- **Reactivity:** Use `ref` for primitives/simple state, `shallowRef` for large
  datasets (dashboards).
- **API:** Use native `fetch` or `Bun.fetch`.
- **Formatting:** Prettier standard. Use kebab-case for custom events.

## Directory Structure

- `src/components/`: Reusable UI widgets.
- `src/composables/`: Shared business logic/state hooks.
- `src/views/`: Main dashboard pages (Console sections).
- `src/api/gen/`: Generated protobuf stubs (Do not edit — see below).
- `e2e/`: hermetic Playwright smoke tests.
- `dist/`: Build output (Do not edit).
- `server.ts`: Production entry point.

## Protobuf Stubs

`src/api/gen/*_pb.ts` is generated, never hand-edited, and the Console owns
all of it — `make proto` here is the only thing that writes to it. The protos
come from the public `github.com/fairtier/workspace-api` repo (which itself
generates Go only), cloned at the tag pinned by `WORKSPACE_API_VERSION` in the
[Makefile](./Makefile); CI drift-checks the committed stubs against it.

Changing a proto therefore means: land it in the public workspace-api repo,
tag a release, bump the Makefile pin, then `make proto` here. Both
`buf.gen.yaml` (plugin version) and `package.json` (`@bufbuild/protobuf`) pin
the same protoc-gen-es major/minor; bump them together.

## Deployment Guardrails

- **Docker:** Multi-stage `oven/bun:slim` build.
- **SPA routing:** always ensure `server.ts` handles fallbacks (index.html
  for non-existent paths).
- **TLS:** terminated in front of the container; Bun serves plain HTTP.

## Environment Variables

- **Client-side:** Prefix with `VITE_`. Access via `import.meta.env.VITE_...`.
- **Server-side (Bun):** Access via `Bun.env.VARIABLE_NAME`.
- **Key Vars:**
    - `FT_*`: ALL deployment configuration — API URL, OIDC client, error
      tracking. Served to the SPA as `/config.json`; see README.
    - `VITE_*`: dev-server conveniences only. `.env.production` is
      deliberately empty so the published image stays neutral.
    - `PORT`: The port Bun serves the frontend on (default 3000).

## Error Tracking

Uncaught errors go to the error tracker configured via `FT_SENTRY_DSN`,
spoken to with the **Sentry SDK** (`@sentry/vue`) — anything that ingests
Sentry envelopes works, so only the DSN host is vendor-specific.
Init is [src/lib/sentry.ts](./src/lib/sentry.ts), called from `main.ts` before
`mount()` (the Vue error handler must be installed while the app is unmounted).
Errors only — no tracing, no source-map upload. See
[README.md](./README.md#error-tracking) for the on/off matrix and the
paste-into-devtools smoke test.

There is deliberately **no `window.Sentry`**. Vendor "paste this in devtools"
`Sentry.captureMessage(...)` snippets therefore fail with `Sentry is not
defined` — they are written for CDN loaders, where the SDK is a global, and
that failure says nothing about whether reporting works. Do not "fix" it by
publishing the namespace; the smoke test in the README triggers a real
uncaught error instead, which exercises the path an actual bug takes.

`@sentry/vue` is the second documented exception to "Speed over Bloat" (rule 2
below): the envelope protocol *is* the product. Hand-rolling it means owning
cross-browser stack-trace parsing, breadcrumb capture, dedupe and envelope
framing, which is not a `fetch` call.

## Claude-Specific Instructions

1. **Always use Bun:** Do not suggest `npm`, `yarn`, or `node` commands.
   *One partial exception:* Playwright ships no Bun-native runner of its own.
   `bun run test:e2e` resolves `node_modules/.bin/playwright`, whose
   `#!/usr/bin/env node` shebang hands execution to Node — started by the OS,
   not by anyone typing `node`. That is still the default, and CI runs it.
   Bun 1.4 added support for running `playwright test` under Bun's own runtime
   (`bun --bun run test:e2e`), and the smoke suite was verified green that way
   on 2026-08-25. It is an option, not the default: Node is what Playwright
   supports upstream, so a failure there is a real failure rather than a
   runtime question. Do not switch the scripts or CI over without a reason to.
2. **Speed over Bloat:** Prefer Bun's built-in APIs (e.g., `Bun.password`,
   `Bun.sqlite`, `Bun.SQL`) over adding heavy npm dependencies.
   *One documented exception,* where the alternative was reimplementing a
   protocol rather than writing a fetch call: `@sentry/vue`, the
   error-tracking client — see [Error Tracking](#error-tracking) above.
3. **Tests First:** Two tiers, and the boundary is enforced by config.
   Unit/logic tests use `bun:test` and live at `src/**/*.test.ts`. Browser
   tests use Playwright and live at `e2e/*.spec.ts`. `[test] root = "src"`
   in `bunfig.toml` keeps them apart — Bun's runner discovers `*.spec.*` too and
   would otherwise load the Playwright specs and crash. Never put a Playwright
   spec under `src/`.
4. **Environment:** If a top-level await is needed in `server.ts`, ensure
   `tsconfig.node.json` is set to `ESNext`.

