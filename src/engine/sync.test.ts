import { describe, expect, it } from 'vitest'
import { getRosterLineupDiff, syncLineupToRoster } from './sync'
import type { LineupRow, Player } from '../types'

function player(id: string, name: string, present = true): Player {
  return { id, name, present, notes: '', preferredPositions: [] }
}

function row(id: string, name: string, batOrder: number, assignments: LineupRow['assignments']): LineupRow {
  return { playerId: id, playerName: name, batOrder, assignments }
}

describe('roster lineup sync', () => {
  it('reports added, removed, and renamed players', () => {
    const diff = getRosterLineupDiff(
      [row('a', 'Old A', 1, ['P']), row('b', 'B', 2, ['C'])],
      [player('a', 'A'), player('c', 'C'), player('b', 'B', false)],
    )

    expect(diff.added.map((item) => item.id)).toEqual(['c'])
    expect(diff.removed.map((item) => item.playerId)).toEqual(['b'])
    expect(diff.renamed.map((item) => item.playerId)).toEqual(['a'])
  })

  it('removes absent players, renames kept players, and appends additions', () => {
    const synced = syncLineupToRoster(
      [row('a', 'Old A', 1, ['P', 'C']), row('b', 'B', 2, ['SS', '2B'])],
      [player('a', 'A'), player('c', 'C'), player('b', 'B', false)],
      [],
      2,
      2,
    )

    expect(synced.map((item) => item.playerId)).toEqual(['a', 'c'])
    expect(synced[0].playerName).toBe('A')
    expect(synced[1].batOrder).toBe(2)
  })
})
