/**
 * Hermetic smoke tests: the BUILT app behind server.ts, configured with dummy
 * FT_* values (see playwright.config.ts). No backend, no identity provider —
 * these assert what a fresh deployment serves before anyone signs in.
 *
 * Anything behind the login needs a real workspace API and a real Casdoor,
 * which no CI environment has; that testing happens against a live workspace.
 */

import { test, expect } from '@playwright/test'

test('/config.json serves the deployment configuration, uncached', async ({ request }) => {
    const res = await request.get('/config.json')
    expect(res.ok()).toBeTruthy()
    expect(res.headers()['cache-control']).toBe('no-store')
    expect(await res.json()).toMatchObject({
        workspaceApiUrl: 'http://localhost:9098',
        authUrl: 'http://localhost:9099',
        authClientId: 'smoke-e2e',
        authRedirectUri: 'http://localhost:3000/callback',
        authOrganization: 'smoke',
        accountUrl: 'https://account.example.com',
    })
})

test('/healthz and /readyz answer', async ({ request }) => {
    for (const path of ['/healthz', '/readyz']) {
        const res = await request.get(path)
        expect(res.ok()).toBeTruthy()
        expect(await res.json()).toMatchObject({ status: 'ok' })
    }
})

test('the login page renders, with no sign-up', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign up' })).toHaveCount(0)
})

test('unknown paths fall back to the SPA', async ({ page }) => {
    // Signed out, a deep link bounces through the router to the login page —
    // proving server.ts served index.html rather than a 404.
    await page.goto('/pipelines')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

test('/.well-known/change-password deep-links into Casdoor', async ({ request }) => {
    const res = await request.get('/.well-known/change-password', { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    expect(res.headers()['location']).toBe('http://localhost:9099/forget/console')
})
