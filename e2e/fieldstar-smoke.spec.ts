import { expect, test } from '@playwright/test'

const players = ['Alex', 'Blake', 'Casey', 'Devon', 'Elliot', 'Finn', 'Gray', 'Harper', 'Indy', 'Jules', 'Kai']

test('roster to lineup smoke flow', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })

  await page.goto('/t/smoke/Smoke?edit=local-smoke', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: 'FieldStar' })).toBeVisible()

  await page.getByRole('button', { name: /Add Player|Add$/ }).first().click()
  for (let index = 0; index < players.length; index += 1) {
    await page.locator('input[placeholder="Player"]').nth(index).fill(players[index])
    if (index < players.length - 1) await page.getByRole('button', { name: /^Add$/ }).click()
  }

  await page.getByRole('button', { name: 'Draft Lineup' }).click()
  await page.getByRole('button', { name: 'Generate Lineup' }).click()
  await expect(page.getByText('Alex').first()).toBeVisible()

  await page.locator('button[title="Move down"]').first().click()
  await page.waitForTimeout(250)

  await page.getByRole('button', { name: 'Save to Gameday' }).click()
  await page.getByRole('button', { name: 'Gameday' }).click()
  await expect(page.getByText('Alex').first()).toBeVisible()

  await page.getByRole('button', { name: 'Roster' }).click()
  await expect(page.getByRole('heading', { name: 'Roster' })).toBeVisible()
  await page.getByRole('button', { name: 'Summary' }).click()
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible()
  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()

  expect(browserErrors).toEqual([])
})
