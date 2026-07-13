import { describe, expect, it } from 'vitest'
import { applyAssignmentEdit, getPendingLineupChanges, lineupWithChanges } from './changes'
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

describe('assignment edits', () => {
  it('swaps fielding positions when assigning a duplicate position', () => {
    const lineup = [row('a', ['P']), row('b', ['Sit']), row('c', ['SS'])]

    const result = applyAssignmentEdit(lineup, 2, 0, 'P')

    expect(result?.lineup.map((item) => item.assignments[0])).toEqual(['SS', 'Sit', 'P'])
    expect(result?.changedCells).toEqual([
      { playerId: 'c', inning: 0 },
      { playerId: 'a', inning: 0 },
    ])
  })

  it('swaps a sitter into the open fielding spot when assigning Sit', () => {
    const lineup = [row('a', ['P']), row('b', ['Sit']), row('c', ['SS'])]

    const result = applyAssignmentEdit(lineup, 0, 0, 'Sit')

    expect(result?.lineup.map((item) => item.assignments[0])).toEqual(['Sit', 'P', 'SS'])
    expect(result?.changedCells).toEqual([
      { playerId: 'a', inning: 0 },
      { playerId: 'b', inning: 0 },
    ])
  })
})
