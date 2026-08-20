# FairTier Workspace Console

The web console of a [FairTier](https://fairtier.com) data workspace — a Vue 3
SPA for the product itself: pipelines, transformations, SQL, the Iceberg
catalog, dashboards, service accounts. It is served next to the workspace it
manages, talks only to that workspace's own
[workspace-api](https://github.com/fairtier/workspace-api), and authenticates
against the workspace's own identity provider (Casdoor).

This is deliberately **not** where accounts, billing or provisioning live —
those belong to whoever hosts the workspace (on FairTier's hosted service,
the central console; self-hosted, nobody). The workspace console runs the
same everywhere, which is FairTier's exit story: a customer who leaves keeps
their UI along with their data.

Everything deployment-specific is **runtime** configuration served as
`/config.json`; see [Environment variables](#environment-variables). Nothing
is baked into the image.

See [CLAUDE.md](./CLAUDE.md) for the design guide and coding standards.

## Tech stack

- [Bun](https://bun.sh/) 1.3+ — runtime, package manager, production server
- [Vue 3.5](https://vuejs.org/) with `<script setup>` and Composition API
- [Vite + Rolldown](https://vite.dev/) — Rust-powered bundler
- [Pinia](https://pinia.vuejs.org/) — store-per-feature state
- [Tailwind CSS 4](https://tailwindcss.com/) — utility-first styles
- [Vue Router 4](https://router.vuejs.org/) + [Vue I18n](https://vue-i18n.intlify.dev/)
- [Connect-RPC](https://connectrpc.com/) for typed API calls (generated client in [`src/api/gen/`](./src/api/))

## Commands

```bash
bun install           # install dependencies
bun dev               # Vite dev server (hot reload) — see .env.local.example
bun run type-check    # vue-tsc strict type check (app + tests + node + e2e configs)
bun test              # unit tests (src/**/*.test.ts, bun:test)
bun run test:e2e      # hermetic browser smoke tests (Playwright)
bun run build         # production build → ./dist
bun run server.ts     # serve ./dist + server routes (production entry point)
```

## Testing

Two tiers, and the split is enforced by config rather than habit:

- **Unit** — `bun test`, files at `src/**/*.test.ts` using `bun:test`.
  `bunfig.toml` scopes the runner with `[test] root = "src"`, because Bun
  discovers `*.spec.*` too and would otherwise sweep up the Playwright specs
  and choke on their imports.
- **Smoke** — `bun run test:e2e`, files at `e2e/*.spec.ts`. Hermetic: Playwright
  builds the app and starts [`server.ts`](./server.ts) with dummy `FT_*`
  values, then asserts what a fresh deployment serves before anyone signs in.
  No backend and no identity provider — anything behind the login needs a real
  workspace, and is tested against one.

Playwright's runner is Node-based — there is no Bun-native equivalent — but it
is still invoked through Bun: `bun run test:e2e` resolves
`node_modules/.bin/playwright`, whose `#!/usr/bin/env node` shebang hands
execution to Node. Do not "fix" this with `--bun`; the runner does not work
under Bun's runtime.

## Updating dependencies

Routine workflow:

```bash
bun outdated          # what's behind?
bun update            # bump to latest compatible (respects ^ ~ ranges in package.json)
bun update --latest   # bump to absolute latest (rewrites ranges; breaking changes possible)
bun update <pkg>      # bump a single package
bun audit             # check the result for known CVEs
bun run type-check && bun run build   # sanity check before committing
```

Bumping a package pinned via npm-alias (e.g. `"vite": "npm:rolldown-vite@…"`)
means editing **both** the `devDependencies` entry **and** the `overrides`
entry in [`package.json`](./package.json), then running `bun install`. Same
for any version forced via `overrides`.

### Supply-chain delay

[`bunfig.toml`](./bunfig.toml) sets `minimumReleaseAge = 86400` (1 day). Bun
refuses to install any package version published less than 24 h ago. Most
compromised npm releases are detected and yanked within hours, so a small
delay catches them at zero cost to normal work. If a CVE fix genuinely cannot
wait, add the package to `minimumReleaseAgeExcludes` rather than removing the
global delay.

CI fails on `bun audit --audit-level=high`.

## Environment variables

All deployment configuration is **runtime**: [`server.ts`](./server.ts) reads
`FT_*` env and serves it to the SPA as `/config.json`
([`src/config/runtime.ts`](./src/config/runtime.ts)). The `VITE_*` build-time
values exist for the dev server ([`.env.local.example`](./.env.local.example));
[`.env.production`](./.env.production) is deliberately empty, so the published
image is neutral.

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (default `3000`) |
| `FT_WORKSPACE_API_URL` | **required** — workspace-api base URL |
| `FT_AUTH_URL`, `FT_AUTH_CLIENT_ID`, `FT_AUTH_REDIRECT_URI`, `FT_AUTH_ORGANIZATION` | **required** — the OIDC (Casdoor) client this workspace authenticates against |
| `FT_AUTH_CLIENT_APP` | Casdoor application name for the password-reset deep link (default `console`) |
| `FT_ACCOUNT_URL` | where "Account & Billing" lives when a hosting provider manages this workspace; leave unset (the self-host default) to hide the link |
| `FT_SENTRY_DSN` | error-tracking DSN (Sentry envelope format); unset or empty = reporting off |

**The server refuses to start unconfigured**: the image ships neutral, so a
missing `FT_*` does not mean "use a default" — `server.ts` exits, naming the
missing variables, rather than serving a bundle that points nowhere.

## Error tracking

Uncaught errors go to an error tracker spoken to with the **Sentry SDK**
(`@sentry/vue`). Initialisation lives in [`src/lib/sentry.ts`](./src/lib/sentry.ts)
and runs from [`src/main.ts`](./src/main.ts) before `mount()`. The SDK is
inert without a DSN, and that is the whole on/off mechanism: only a deployment
that sets `FT_SENTRY_DSN` reports. Dev servers, CI and the smoke suite set
nothing and stay silent. A DSN is a public write-only ingest endpoint, not a
credential — every browser that loads the page can see it.

Self-hosted deployments should leave it unset unless they point it at their
own project — a self-hoster's browser errors are nobody else's to collect.

### Smoke-testing a deployment

There is deliberately no `window.Sentry` global (the SDK is an ES-module
import scoped to a chunk), so paste-in `Sentry.captureMessage(...)` snippets
fail with `Sentry is not defined` — that says nothing about whether reporting
works. Trigger a real uncaught error instead:

```js
setTimeout(() => { throw new Error("FT smoke: uncaught error") })
```

The `setTimeout` is the load-bearing part: a bare `throw` at the console
prompt is caught by devtools' own eval and `window.onerror` never fires.
Throwing from a fresh task escapes to the global handler — the same route a
real bug takes. If nothing reports, check `/config.json` for the DSN before
suspecting the SDK.

Two deliberate omissions, both a config change away: no tracing (errors only),
and no source maps (production stack traces are minified; un-minifying them
would need a CI upload step and an API token — a real secret).

## Server routes

[`server.ts`](./server.ts) is a minimal Bun.serve handler:

- Serves static files from `./dist`
- `GET /config.json` — the runtime configuration, `Cache-Control: no-store`
- `GET /healthz`, `GET /readyz` — liveness/readiness probes
- `GET /.well-known/change-password` — W3C redirect to the workspace Casdoor's
  password-reset flow (used by password managers)
- All other paths fall back to `index.html` so Vue Router can take over

## Protobuf stubs

`src/api/gen/*_pb.ts` is generated, committed, and never hand-edited. The
stubs come from the public
[workspace-api](https://github.com/fairtier/workspace-api) protos at the tag
pinned in the [Makefile](./Makefile) (`make proto`, drift-checked in CI). See
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Deployment

Released images are published to `ghcr.io/fairtier/console` (semver tags, from
[release.yml](./.github/workflows/release.yml)). The
[`Dockerfile`](./Dockerfile) is a multi-stage `oven/bun:slim` build; the
container serves plain HTTP on `:3000` and expects TLS termination in front of
it. Configure entirely via the `FT_*` variables above.

## Directory layout

- [`src/views/`](./src/views/) — top-level pages
- [`src/components/`](./src/components/) — reusable UI widgets
- [`src/composables/`](./src/composables/) — shared business logic hooks
- [`src/lib/`](./src/lib/) — framework-free helpers, unit-tested in place
- [`src/stores/`](./src/stores/) — Pinia stores (one per feature)
- [`src/api/`](./src/api/) — Connect-RPC client; `gen/` is generated, do not edit
- [`src/auth/`](./src/auth/) — PKCE and claim mapping
- [`src/i18n/`](./src/i18n/) — translations (`en`/`cs`)
- [`src/router/`](./src/router/), [`src/layouts/`](./src/layouts/) — routing and shell
- [`e2e/`](./e2e/) — hermetic Playwright smoke tests
- [`server.ts`](./server.ts) — production entry point

## License

[Apache-2.0](./LICENSE)
