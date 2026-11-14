/**
 * Deep links into a run history (?pipeline= / ?transformation=) must work when
 * the page is already open: following a notification there is a query change
 * on the same route, so the view is reused and onMounted does not run again.
 */

import { test, expect } from '@playwright/test'
import { PIPELINES, TRANSFORMATIONS, fakeWorkspaceApi } from './fixtures/workspaceApi'

const [orders, customers] = PIPELINES as [{ id: string }, { id: string }]
const [stgOrders, marts] = TRANSFORMATIONS as [{ id: string }, { id: string }]

const note = (id: string, title: string, link: string) => ({
    id,
    type: 'pipeline_run',
    title,
    body: '',
    link,
    read: false,
    createdAt: new Date().toISOString(),
})

test('a notification for another pipeline opens it while /pipelines is open', async ({ page }) => {
    await fakeWorkspaceApi(page, {
        notifications: [note('n1', 'customers failed', `/pipelines?pipeline=${customers.id}`)],
    })
    await page.goto(`/pipelines?pipeline=${orders.id}`)
    const open = page.getByTestId('pipeline-runs')
    await expect(open).toHaveAttribute('data-pipeline-id', orders.id)

    await page.getByRole('button', { name: 'Notifications' }).click()
    await page.getByRole('button', { name: /customers failed/ }).click()

    await expect(page).toHaveURL(new RegExp(`pipeline=${customers.id}`))
    await expect(open).toHaveAttribute('data-pipeline-id', customers.id)
})

test('a notification for another transformation opens it while /transformations is open', async ({ page }) => {
    await fakeWorkspaceApi(page, {
        notifications: [note('n1', 'marts failed', `/transformations?transformation=${marts.id}`)],
    })
    await page.goto(`/transformations?transformation=${stgOrders.id}`)
    const open = page.getByTestId('transformation-runs')
    await expect(open).toHaveAttribute('data-transformation-id', stgOrders.id)

    await page.getByRole('button', { name: 'Notifications' }).click()
    await page.getByRole('button', { name: /marts failed/ }).click()

    await expect(open).toHaveAttribute('data-transformation-id', marts.id)
})

test('collapsing a row drops it from the URL, so the same link opens it again', async ({ page }) => {
    await fakeWorkspaceApi(page, {
        notifications: [note('n1', 'orders failed', `/pipelines?pipeline=${orders.id}`)],
    })
    await page.goto(`/pipelines?pipeline=${orders.id}`)
    await expect(page.getByTestId('pipeline-runs')).toHaveCount(1)

    // Row click toggles it shut; the query follows.
    await page.locator(`[data-pipeline-id="${orders.id}"]`).waitFor()
    await page.getByText('orders', { exact: true }).first().click()
    await expect(page.getByTestId('pipeline-runs')).toHaveCount(0)
    await expect(page).not.toHaveURL(/pipeline=/)

    await page.getByRole('button', { name: 'Notifications' }).click()
    await page.getByRole('button', { name: /orders failed/ }).click()
    await expect(page.getByTestId('pipeline-runs')).toHaveAttribute('data-pipeline-id', orders.id)
})
