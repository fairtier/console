# Contributing

Thanks for your interest in improving the FairTier Console.

## Build, test, lint

```bash
bun install
bun run type-check   # vue-tsc, strict — covers app, tests, node and e2e configs
bun test             # unit tests (src/**/*.test.ts, bun:test)
bun run build        # production build
```

CI runs the type check, the unit tests, `bun audit`, the production build, a
server config smoke test, the proto drift check, and a Docker build on every
pull request — running the commands above locally first saves a round trip.

The Playwright suite under `e2e/` is hermetic (`bun run test:e2e`): it builds
the app, boots `server.ts` with dummy `FT_*`, and asserts the pre-login
surface. Anything behind the login needs a real workspace and is tested
against one.

## Proto changes

`src/api/gen/*_pb.ts` is generated and committed; CI verifies it matches the
pinned `workspace-api` tag but does not regenerate it:

1. Land the proto change in
   [fairtier/workspace-api](https://github.com/fairtier/workspace-api) and tag
   a release.
2. Bump `WORKSPACE_API_VERSION` in the [Makefile](./Makefile).
3. Run `make proto` (needs `buf`) and commit the regenerated stubs together
   with the version bump.

## Ground rules

- This is a public repository: no secrets, no credentials, no internal
  hostnames, no customer names — in code, comments, tests, or docs.
- Always Bun, never npm/yarn/node — see [CLAUDE.md](./CLAUDE.md) for the
  documented exceptions and the rest of the coding standards.
