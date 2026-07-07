import { expect, test } from '@playwright/test'

const players = ['Alex', 'Blake', 'Casey', 'Devon', 'Elliot', 'Finn', 'Gray', 'Harper', 'Indy', 'Jules', 'Kai']

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

  await page.getByRole('button', { name: 'Draft Lineup' }).click()
  await page.getByRole('button', { name: 'Generate Lineup' }).click()
  await expect(page.getByText('Alex').first()).toBeVisible()

  const beforeReorder = await page.locator('[data-lineup-row-id]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-lineup-row-id')))
  await page.locator('button[title="Drag to reorder"]').first().dragTo(page.locator('[data-lineup-row-id]').nth(1))
  await page.waitForTimeout(250)
  const afterReorder = await page.locator('[data-lineup-row-id]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-lineup-row-id')))
  expect(afterReorder[0]).toBe(beforeReorder[1])

  await page.getByRole('button', { name: 'Save to Gameday' }).click()
  await page.getByRole('button', { name: 'Gameday', exact: true }).click()
  await expect(page.getByText('Alex').first()).toBeVisible()
  await page.getByRole('button', { name: 'Clear Gameday' }).click()
  await page.getByRole('button', { name: 'Confirm Clear' }).click()
  await expect(page.getByText('No Gameday lineup saved yet.')).toBeVisible()

  await page.getByRole('button', { name: 'Draft Lineup' }).click()
  await page.getByRole('button', { name: 'Save to Gameday' }).click()
  await page.getByRole('button', { name: 'Gameday', exact: true }).click()
  await expect(page.getByText('Alex').first()).toBeVisible()
  await page.getByRole('button', { name: 'Log Game' }).click()

  await page.getByRole('button', { name: 'Roster' }).click()
  await expect(page.getByRole('heading', { name: 'Roster' })).toBeVisible()
  await page.getByRole('button', { name: 'Summary' }).click()
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible()
  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
  await page.getByRole('button', { name: 'Locked' }).click()
  await page.locator('input.logged-game-date').fill('2026-07-03')
  await expect(page.locator('.full-history-row').filter({ hasText: '2026-07-03' }).first()).toBeVisible()

  expect(browserErrors).toEqual([])
})
