import { expect, test } from '@playwright/test'

const players = ['Alex', 'Blake', 'Casey', 'Devon', 'Elliot', 'Finn', 'Gray', 'Harper', 'Indy', 'Jules', 'Kai']

async function expectPlayerVisible(page: import('@playwright/test').Page, name: string) {
  const viewport = page.viewportSize()
  if (viewport && viewport.width <= 700) {
    await expect(page.locator('.mobile-lineup-row').filter({ hasText: name }).first()).toBeVisible()
    return
  }
  await expect(page.locator('[data-lineup-row-id]').filter({ hasText: name }).first()).toBeVisible()
}

test('roster to lineup smoke flow', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('dialog', (dialog) => dialog.accept())

  await page.goto('/t/smoke/Smoke?edit=local-smoke', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'FieldStar' })).toBeVisible()

  await page.getByRole('button', { name: /Add Player|Add$/ }).first().click()
  for (let index = 0; index < players.length; index += 1) {
    await page.locator('input[placeholder="Player"]').nth(index).fill(players[index])
    if (index < players.length - 1) await page.getByRole('button', { name: /^Add$/ }).click()
  }
  await page.locator('select[title="Avoid 1"]').first().selectOption('P')

  await page.getByRole('button', { name: 'Lineup' }).click()
  await page.getByRole('button', { name: 'Generate Lineup' }).click()
  await expectPlayerVisible(page, 'Alex')

  const viewport = page.viewportSize()
  if (!viewport || viewport.width > 700) {
    const beforeReorder = await page.locator('[data-lineup-row-id]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-lineup-row-id')))
    await page.locator('button[title="Drag to reorder"]').first().dragTo(page.locator('[data-lineup-row-id]').nth(1))
    await page.waitForTimeout(250)
    const afterReorder = await page.locator('[data-lineup-row-id]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-lineup-row-id')))
    expect(afterReorder[0]).toBe(beforeReorder[1])
  } else {
    await expect(page.locator('.mobile-inning-stepper strong')).toHaveText('Inning 1')
    await page.locator('.mobile-lineup-row select').first().selectOption('P')
    await page.getByRole('button', { name: 'Next inning' }).click()
    await expect(page.locator('.mobile-inning-stepper strong')).toHaveText('Inning 2')
  }

  await page.getByRole('button', { name: /^Generate$/ }).click()
  await expect(page.locator('.candidate-strip').getByRole('button', { name: /Locked|Editing/ })).toHaveCount(0)
  await page.getByRole('button', { name: /Snapshots/ }).click()
  await expect(page.getByRole('button', { name: 'Clear snapshots' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Snapshot 1', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Snapshot 1', exact: true }).click()
  await expectPlayerVisible(page, 'Alex')
  await page.getByRole('button', { name: 'Remove final inning' }).click()
  await expect(page.getByText('Inning 4')).not.toBeVisible()
  await page.getByRole('button', { name: 'Add inning' }).click()
  await expect(page.getByText('Inning 4').first()).toBeVisible()
  await page.getByRole('button', { name: 'Log Game' }).click()
  await page.getByRole('button', { name: 'Confirm Log' }).click()

  await page.getByRole('button', { name: 'Roster' }).click()
  await expect(page.getByRole('heading', { name: 'Roster' })).toBeVisible()
  await expect(page.locator('.roster-list').getByText('Games').first()).toBeVisible()
  await expect(page.locator('.roster-list').getByText('Present')).toHaveCount(0)
  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
  await page.getByRole('button', { name: 'Show all' }).click()
  await page.getByRole('button', { name: 'Locked' }).click()
  await page.locator('input.logged-game-date').fill('2026-07-03')
  await expect(page.locator('.full-history-row').filter({ hasText: '2026-07-03' }).first()).toBeVisible()

  expect(browserErrors).toEqual([])
})
