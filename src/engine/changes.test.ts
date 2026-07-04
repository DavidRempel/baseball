import { describe, expect, it } from 'vitest'
import { getPendingLineupChanges, lineupWithChanges } from './changes'
import type { LineupRow } from '../types'

function row(id: string, assignments: LineupRow['assignments']): LineupRow {
  return { playerId: id, playerName: id, batOrder: 1, assignments }
}

describe('pending lineup changes', () => {
  it('diffs changed cells and applies the accepted changes back to a lineup', () => {
    const before = [row('a', ['P', 'C']), row('b', ['SS', '2B'])]
    const after = [row('a', ['P', 'Sit']), row('b', ['SS', 'RF'])]

    const changes = getPendingLineupChanges(before, after, 2, 'current', 'test')
    const applied = lineupWithChanges(before, changes)

    expect(changes.map((change) => [change.playerId, change.inning, change.oldValue, change.newValue])).toEqual([
      ['a', 1, 'C', 'Sit'],
      ['b', 1, '2B', 'RF'],
    ])
    expect(applied).toEqual(after)
  })
})
