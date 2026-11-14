/**
 * The AI agents page against a faked workspace API (./fixtures/workspaceApi):
 * the calm state when MCP is not enabled on the box, the token list, creating
 * a token whose secret is shown once and fills the setup snippets, and
 * revoking one.
 *
 * Set FT_E2E_SCREENSHOTS=<dir> to also write screenshots there (agents-*.png).
 */

import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { API, NEW_SECRET, fakeWorkspaceApi } from './fixtures/workspaceApi'

const SHOTS = process.env.FT_E2E_SCREENSHOTS
const ENDPOINT = `${API}/mcp`

async function shot(page: Page, name: string) {
    if (!SHOTS) return
    await page.screenshot({ path: join(SHOTS, `${name}.png`) })
    await page.emulateMedia({ colorScheme: 'dark' })
    // Let colour transitions (copy buttons) finish before the capture.
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(SHOTS, `${name}-dark.png`) })
    await page.emulateMedia({ colorScheme: 'light' })
}

test.use({ viewport: { width: 1360, height: SHOTS ? 1700 : 900 } })

test('without MCP on the box, the page explains what it is and how it is enabled', async ({ page }) => {
    // A current box says so in the bootstrap document: no probe.
    const api = await fakeWorkspaceApi(page)
    await page.goto('/agents')

    const disabled = page.getByTestId('agents-disabled')
    await expect(disabled).toBeVisible()
    await expect(disabled).toContainText('MCP_ENABLED=true')
    // Calm, not an error: no toast, no token UI.
    await expect(page.getByText('Could not load access tokens.')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'New token' })).toHaveCount(0)
    // What the operator would be turning on is still described.
    await expect(page.getByTestId('agents-capabilities')).toBeVisible()
    expect(api.calls).not.toContain('AccessTokenService/ListAccessTokens')

    // It sits in the Workspace group of the sidebar.
    await expect(page.getByRole('link', { name: 'AI agents' })).toBeVisible()
    await shot(page, 'agents-disabled')
})

test('the list shows scopes, expiry warnings and revoked tokens', async ({ page }) => {
    await fakeWorkspaceApi(page, { mcp: true })
    await page.goto('/agents')

    await expect(page.getByTestId('agents-endpoint')).toHaveText(ENDPOINT)
    const snippet = page.getByTestId('agents-snippet')
    await expect(snippet).toContainText(`claude mcp add --transport http fairtier ${ENDPOINT}`)
    await expect(snippet).toContainText('Bearer <your-access-token>')

    const rows = page.getByTestId('agents-token-row')
    await expect(rows).toHaveCount(3)
    // Usable first; revoked last.
    await expect(rows.nth(2)).toHaveAttribute('data-state', 'revoked')
    await expect(rows.nth(2)).toContainText('Revoked')
    await expect(rows.nth(2).getByRole('button', { name: 'Revoke' })).toHaveCount(0)

    const expiring = rows.filter({ hasText: 'cursor on the build box' })
    await expect(expiring.getByTestId('agents-expiring')).toHaveText('in 5 days')
    await expect(expiring).toContainText('read')
    await expect(expiring).toContainText('write')
    await expect(rows.filter({ hasText: 'laptop claude code' })).toContainText('3 hours ago')
    await shot(page, 'agents-list')
})

test('create: validation, the secret once, snippets filled, gone on reload; revoke', async ({ page }) => {
    const api = await fakeWorkspaceApi(page, { mcp: true })
    await page.goto('/agents')

    await page.getByRole('button', { name: 'New token' }).click()
    const form = page.getByTestId('agents-create')

    // Client-side: a name is required.
    await form.getByRole('button', { name: 'Create token' }).click()
    await expect(form).toContainText('Give the token a name.')
    expect(api.calls).not.toContain('AccessTokenService/CreateAccessToken')

    // Server-side: a FieldViolation lands on its field.
    await form.getByLabel('Name').fill('taken')
    await form.getByRole('button', { name: 'Create token' }).click()
    await expect(form).toContainText('pick another name')

    await form.getByLabel('Name').fill('ci agent')
    await form.getByText('Read and operate', { exact: true }).click()
    await form.getByRole('button', { name: '30 days' }).click()
    await shot(page, 'agents-create')
    await form.getByRole('button', { name: 'Create token' }).click()

    const reveal = page.getByTestId('agents-secret')
    await expect(reveal).toBeVisible()
    await expect(reveal).toContainText("You won't see this token again")
    await expect(page.getByTestId('agents-secret-value')).toHaveText(NEW_SECRET)
    const sent = api.bodies['AccessTokenService/CreateAccessToken']!.at(-1)!
    expect(sent).toEqual({ name: 'ci agent', scopes: ['workspace:read', 'workspace:write'], expiresInDays: 30 })

    // Every client's snippet now carries the secret.
    const snippet = page.getByTestId('agents-snippet')
    await expect(snippet).toContainText(`Bearer ${NEW_SECRET}`)
    await page.getByRole('button', { name: 'Cursor' }).click()
    await expect(snippet).toContainText(`"Authorization": "Bearer ${NEW_SECRET}"`)
    await page.getByRole('button', { name: 'Any MCP client' }).click()
    await expect(snippet).toContainText(`Authorization: Bearer ${NEW_SECRET}`)
    await page.getByRole('button', { name: 'Claude Code' }).click()

    const rows = page.getByTestId('agents-token-row')
    await expect(rows).toHaveCount(4)
    await expect(rows.first()).toContainText('ci agent')
    await page.evaluate(() => document.querySelector('main')?.scrollTo(0, 0))
    await shot(page, 'agents-reveal')

    // The secret lives in the page only: a reload shows the placeholder again.
    await page.reload()
    await expect(page.getByTestId('agents-token-row')).toHaveCount(4)
    await expect(page.getByTestId('agents-secret')).toHaveCount(0)
    await expect(page.getByTestId('agents-snippet')).toContainText('Bearer <your-access-token>')
    await expect(page.getByText(NEW_SECRET)).toHaveCount(0)

    // Revoke goes through the app's confirm dialog.
    const row = page.getByTestId('agents-token-row').filter({ hasText: 'ci agent' })
    await row.getByRole('button', { name: 'Revoke' }).click()
    await page.getByRole('button', { name: 'Revoke token' }).click()
    await expect(page.getByText('Access token revoked.')).toBeVisible()
    expect(api.bodies['AccessTokenService/RevokeAccessToken']!.at(-1)).toEqual({ id: 'tok-4' })
    await expect(page.getByTestId('agents-token-row').filter({ hasText: 'ci agent' })).toHaveAttribute('data-state', 'revoked')
})

test('a box too old to advertise MCP is probed: off', async ({ page }) => {
    const api = await fakeWorkspaceApi(page, { bootstrapMcp: 'omit' })
    await page.goto('/agents')
    await expect(page.getByTestId('agents-disabled')).toBeVisible()
    await expect(page.getByText('Could not load access tokens.')).toHaveCount(0)
    expect(api.calls).toContain('AccessTokenService/ListAccessTokens')
})

test('a box too old to advertise MCP is probed: on, endpoint from the API base', async ({ page }) => {
    await fakeWorkspaceApi(page, { mcp: true, bootstrapMcp: 'omit' })
    await page.goto('/agents')
    await expect(page.getByTestId('agents-disabled')).toHaveCount(0)
    await expect(page.getByTestId('agents-endpoint')).toHaveText(ENDPOINT)
})

test('the advertised MCP endpoint is the one the snippets use', async ({ page }) => {
    const advertised = 'https://data.example.test/mcp'
    await fakeWorkspaceApi(page, { mcp: true, mcpUrl: advertised })
    await page.goto('/agents')
    await expect(page.getByTestId('agents-endpoint')).toHaveText(advertised)
    await expect(page.getByTestId('agents-snippet')).toContainText(`claude mcp add --transport http fairtier ${advertised}`)
})
