/**
 * The Workflows page against a faked workspace API (./fixtures/workspaceApi):
 * list, deep link into a failed run, the editor's step builder and warnings,
 * server field errors, Run now. Hermetic like the smoke suite — the API is
 * answered at the network layer and the session is seeded in localStorage.
 *
 * Set FT_E2E_SCREENSHOTS=<dir> to also write full-page screenshots there.
 */

import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { BACKFILL, NIGHTLY, fakeWorkspaceApi } from './fixtures/workspaceApi'

const SHOTS = process.env.FT_E2E_SCREENSHOTS

async function shot(page: Page, name: string) {
    // The page scrolls inside <main>, so fullPage would capture nothing more;
    // the tall viewport is what fits the detail and the editor.
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) })
}

test.use({ viewport: { width: 1360, height: SHOTS ? 1500 : 900 } })

test('the list reads at a glance: chain, schedule, enabled, last run', async ({ page }) => {
    await fakeWorkspaceApi(page)
    await page.goto('/workflows')

    const rows = page.getByTestId('workflow-row')
    await expect(rows).toHaveCount(3)

    const nightly = rows.filter({ hasText: 'nightly_orders' })
    await expect(nightly.getByTestId('workflow-chain')).toHaveText('orders → customers → stg_orders → marts')
    await expect(nightly).toContainText('Failed')
    // The row says where it broke, with the error's first line on hover.
    const failed = nightly.getByTestId('workflow-failed-step')
    await expect(failed).toHaveText('Step 3 · stg_orders')
    await expect(failed).toHaveAttribute('title', /^Database Error in model stg_orders/)
    // Only a failed last run gets one.
    await expect(rows.getByTestId('workflow-failed-step')).toHaveCount(1)
    await expect(nightly).toContainText('Daily at 05:00')
    await expect(nightly.getByRole('switch')).toHaveAttribute('aria-checked', 'true')

    const backfill = rows.filter({ hasText: 'adhoc_backfill' })
    await expect(backfill).toContainText('Manual only')
    await expect(backfill).toContainText('Never run')
    await expect(backfill.getByRole('switch')).toHaveAttribute('aria-checked', 'false')

    // The sidebar entry is there and active.
    await expect(page.getByRole('link', { name: 'Workflows' })).toBeVisible()
    await shot(page, 'workflows-list')
})

test('?workflow= opens the detail on the failed run, with the failing step and why', async ({ page }) => {
    await fakeWorkspaceApi(page)
    await page.goto(`/workflows?workflow=${NIGHTLY}`)

    const detail = page.getByTestId('workflow-detail')
    await expect(detail).toBeVisible()

    // Collapsed row already names the step and the error's first line.
    const newest = detail.getByTestId('workflow-run').first()
    await expect(newest).toContainText('Failed at step 3 · stg_orders')
    await expect(newest).toContainText('Database Error in model stg_orders')

    // …and the newest failed run opens on its timeline.
    const steps = newest.getByTestId('workflow-step-run')
    await expect(steps).toHaveCount(4)
    await expect(steps.nth(2)).toContainText('Failed')
    await expect(steps.nth(2)).toContainText('order_total')
    await expect(steps.nth(3)).toContainText('Skipped')
    await expect(steps.nth(2).getByRole('link', { name: 'stg_orders' })).toHaveAttribute(
        'href',
        /\/transformations\?transformation=/,
    )
    await shot(page, 'workflows-detail')
    if (SHOTS) {
        await page.emulateMedia({ colorScheme: 'dark' })
        await page.reload()
        await expect(detail.getByTestId('workflow-step-run')).toHaveCount(4)
        await shot(page, 'workflows-detail-dark')
        await page.emulateMedia({ colorScheme: 'light' })
    }

    // Paging: 15 runs, 10 per page.
    await expect(detail.getByTestId('workflow-run')).toHaveCount(10)
    await detail.getByRole('button', { name: 'Load older runs' }).click()
    await expect(detail.getByTestId('workflow-run')).toHaveCount(15)
    await expect(detail.getByRole('button', { name: 'Load older runs' })).toHaveCount(0)
})

test('the editor builds a step list and warns about double runs', async ({ page }) => {
    const api = await fakeWorkspaceApi(page)
    await page.goto('/workflows')
    await page.getByRole('button', { name: 'New workflow' }).click()

    const editor = page.getByTestId('workflow-editor')
    await editor.getByRole('textbox').first().fill('orders_daily')
    await editor.getByPlaceholder('Empty = manual runs only').fill('0 7 * * *')

    const picker = editor.getByRole('combobox', { name: 'Add a step…' })
    for (const name of ['stg_orders', 'orders']) {
        await picker.click()
        await page.getByRole('option', { name, exact: true }).click()
    }
    const stepRows = editor.getByTestId('workflow-step')
    await expect(stepRows).toHaveCount(2)

    // orders has its own schedule; stg_orders is chained after orders.
    await expect(stepRows.nth(1)).toContainText('also runs on its own schedule “0 6 * * *”')
    await expect(stepRows.nth(0)).toContainText('also set to run after pipeline “orders” (step 2 here)')

    // A target already used is offered disabled.
    await picker.click()
    await expect(page.getByRole('option', { name: /^orders/ })).toHaveAttribute('aria-disabled', 'true')
    await page.keyboard.press('Escape')

    // Reorder: orders first.
    await stepRows.nth(1).getByRole('button', { name: 'Move up' }).click()
    await expect(stepRows.nth(0)).toContainText('orders')
    await expect(stepRows.nth(1)).toContainText('step 1 here')
    await shot(page, 'workflows-editor')

    // Created paused: on by default, switched off here.
    const enabled = editor.getByRole('switch', { name: 'Enabled' })
    await expect(enabled).toHaveAttribute('aria-checked', 'true')
    await enabled.click()

    await editor.getByRole('button', { name: 'Create workflow' }).click()
    const created = page.getByTestId('workflow-row').filter({ hasText: 'orders_daily' })
    await expect(created).toBeVisible()
    await expect(created.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    const sent = api.bodies['WorkflowService/CreateWorkflow']!.at(-1)!
    expect(sent).toMatchObject({
        name: 'orders_daily',
        schedule: '0 7 * * *',
        enabled: false,
        steps: [{ kind: 'pipeline' }, { kind: 'transformation' }],
    })
})

test('server field errors land on their fields', async ({ page }) => {
    await fakeWorkspaceApi(page)
    await page.goto('/workflows')
    await page.getByRole('button', { name: 'New workflow' }).click()
    const editor = page.getByTestId('workflow-editor')
    const picker = editor.getByRole('combobox', { name: 'Add a step…' })
    await picker.click()
    await page.getByRole('option', { name: 'customers', exact: true }).click()

    // Duplicate name → AlreadyExists → under the name field.
    await editor.getByRole('textbox').first().fill('nightly_orders')
    await editor.getByRole('button', { name: 'Create workflow' }).click()
    await expect(editor).toContainText('a workflow named "nightly_orders" already exists')

    // A FieldViolation on steps[0].ref_id → under that step.
    await editor.getByRole('textbox').first().fill('invalid')
    await editor.getByRole('button', { name: 'Create workflow' }).click()
    await expect(editor.getByTestId('workflow-step').first()).toContainText('pipeline not found')
})

test('Run now queues a run and shows it pending', async ({ page }) => {
    const api = await fakeWorkspaceApi(page)
    await page.goto('/workflows')
    const row = page.getByTestId('workflow-row').filter({ hasText: 'adhoc_backfill' })
    await row.getByTestId('workflow-run-now').click()
    await expect(row).toContainText('Pending')
    expect(api.bodies['WorkflowService/TriggerWorkflow']!.at(-1)).toEqual({ id: BACKFILL })
})

test('the empty state explains workflows and offers to create one', async ({ page }) => {
    await fakeWorkspaceApi(page, { empty: true })
    await page.goto('/workflows')
    const empty = page.getByTestId('workflows-empty')
    await expect(empty).toContainText('A workflow runs your pipelines and transformations in a fixed order')
    await expect(empty.getByRole('button', { name: 'Create workflow' })).toBeVisible()
    await shot(page, 'workflows-empty')
})
