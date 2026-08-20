import { defineConfig, devices } from '@playwright/test'

/**
 * Hermetic smoke tests for the Workspace Console. Playwright builds the app
 * and starts server.ts with dummy FT_* configuration; the specs assert what a
 * fresh deployment serves before anyone signs in (config document, health
 * endpoints, login page, SPA fallback).
 *
 * There is deliberately no authenticated project here: past the login the
 * Console needs a real workspace API and a real Casdoor, which no CI
 * environment has. That testing happens against a live workspace.
 */

const SMOKE_URL = process.env.FT_E2E_SMOKE_URL ?? 'http://localhost:3000'

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: 1,
    timeout: 30_000,
    expect: { timeout: 10_000 },
    reporter: [['list'], ['html', { open: 'never' }]],

    use: {
        baseURL: SMOKE_URL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        locale: 'en-US',
        actionTimeout: 10_000,
    },

    projects: [
        {
            name: 'smoke',
            testMatch: /.*\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    webServer: [
        {
            // The BUILT app behind server.ts: the runtime config arrives via
            // /config.json, which the Vite dev server does not serve. Includes
            // a production build, hence the long timeout.
            command: 'bun run build && bun run server.ts',
            url: `${SMOKE_URL}/healthz`,
            reuseExistingServer: !process.env.CI,
            timeout: 240_000,
            stdout: 'pipe',
            env: {
                PORT: '3000',
                // Syntactically valid dummies: the smoke specs never start a
                // login. Values are mirrored in e2e/smoke.spec.ts.
                FT_WORKSPACE_API_URL: 'http://localhost:9098',
                FT_AUTH_URL: 'http://localhost:9099',
                FT_AUTH_CLIENT_ID: 'smoke-e2e',
                FT_AUTH_REDIRECT_URI: `${SMOKE_URL}/callback`,
                FT_AUTH_ORGANIZATION: 'smoke',
                FT_ACCOUNT_URL: 'https://account.example.com',
            },
        },
    ],
})
