import { expect, test } from '@playwright/test'
import type { AppState } from '../src/types'

function parentState(playerName: string): AppState {
  return {
    players: [
      {
        id: 'player-1',
        name: playerName,
        present: true,
        notes: '',
        preferredPositions: [],
        dislikedPositions: [],
      },
      {
        id: 'player-2',
        name: 'Teammate',
        present: true,
        notes: '',
        preferredPositions: [],
        dislikedPositions: [],
      },
    ],
    games: [],
    currentLineup: [
      {
        playerId: 'player-1',
        playerName,
        batOrder: 1,
        assignments: ['P', '1B', 'Sit', 'CF'],
      },
      {
        playerId: 'player-2',
        playerName: 'Teammate',
        batOrder: 2,
        assignments: ['P', '2B', 'RF', 'Sit'],
      },
    ],
    gameDayLineup: [],
    gameDayLocked: false,
    gameDayLogInnings: 4,
    lineupDrafts: [],
    gameDate: '2026-07-15',
    innings: 4,
    fieldingSpots: 10,
  }
}

test('view-only lineup refreshes when the page regains focus', async ({ page }) => {
  let revision = '2026-07-15T16:00:00.000Z'
  let state = parentState('Old Lineup')
  let stateRequests = 0

  await page.route('**/api/teams**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ teams: [{ id: 'refresh-team', name: 'Refresh Team', listed: true }] }),
    })
  })
  await page.route('**/api/state?team=refresh-team', async (route) => {
    stateRequests += 1
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state, updatedAt: revision }),
    })
  })

  await page.goto('/t/refresh-team/Refresh-Team', { waitUntil: 'networkidle' })
  await expect(page.getByText('Old Lineup')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Inning 1 at a glance' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Inning 1 field positions' })).toContainText('Old')
  await expect(page.locator('.field-player.position-p')).toHaveCount(1)
  await expect(page.locator('.field-player.position-p')).toContainText('Old / Teammate')
  await page.getByRole('button', { name: 'Next inning' }).click()
  await expect(page.getByRole('heading', { name: 'Inning 2 at a glance' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Inning 2 field positions' })).toContainText('Old')

  state = parentState('Updated Lineup')
  revision = '2026-07-15T16:01:00.000Z'
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))

  await expect(page.getByText('Updated Lineup')).toBeVisible()
  expect(stateRequests).toBeGreaterThanOrEqual(2)
})
