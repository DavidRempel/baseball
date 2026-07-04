import { describe, expect, it } from 'vitest'
import { fixLineupInning, generateLineup, positionScore } from './lineup'
import type { LineupRow, Player } from '../types'
import { emptyPositionCounts } from './totals'

function player(id: string, name = id): Player {
  return { id, name, present: true, notes: '', preferredPositions: [], dislikedPositions: [] }
}

function row(id: string, batOrder: number, assignments: LineupRow['assignments']): LineupRow {
  return { playerId: id, playerName: id, batOrder, assignments }
}

describe('lineup fixing', () => {
  const players = ['a', 'b', 'c', 'd'].map((id) => player(id))

  it('fills a broken inning with the expected sitter count and unique fielding positions', () => {
    const fixed = fixLineupInning(
      [
        row('a', 1, ['', 'P', '1B']),
        row('b', 2, ['', 'SS', '2B']),
        row('c', 3, ['', 'RF', 'CF']),
        row('d', 4, ['', 'Sit', 'LF']),
      ],
      players,
      [],
      3,
      3,
      0,
    )

    const inning = fixed.map((item) => item.assignments[0])
    expect(inning.filter((assignment) => assignment === 'Sit')).toHaveLength(1)
    expect(new Set(inning.filter((assignment) => assignment !== 'Sit'))).toHaveProperty('size', 3)
  })

  it('keeps forced sitters out for the fixed inning', () => {
    const fixed = fixLineupInning(
      [
        row('a', 1, ['P', 'P', '1B']),
        row('b', 2, ['C', 'SS', '2B']),
        row('c', 3, ['RF', 'RF', 'CF']),
        row('d', 4, ['LF', 'LF', 'LF']),
      ],
      players,
      [],
      3,
      3,
      1,
      { forcedSitterIds: new Set(['b']) },
    )

    expect(fixed.find((item) => item.playerId === 'b')?.assignments[1]).toBe('Sit')
    expect(fixed.map((item) => item.assignments[1]).filter((assignment) => assignment === 'Sit')).toHaveLength(1)
  })

  it('penalizes disliked positions more than neutral positions', () => {
    const avoidPitcher: Player = { ...player('a'), dislikedPositions: ['P'] }
    const totals = new Map([[avoidPitcher.id, { sits: 0, first: 0, last: 0, batSlots: {}, positions: emptyPositionCounts() }]])
    const gameCounts = new Map([[avoidPitcher.id, { sits: 0, infield: 0, outfield: 0, positions: emptyPositionCounts() }]])
    const playersById = new Map([[avoidPitcher.id, avoidPitcher]])

    expect(positionScore(avoidPitcher.id, 'P', totals, gameCounts, playersById, false))
      .toBeGreaterThan(positionScore(avoidPitcher.id, 'C', totals, gameCounts, playersById, false))
  })

  it('balances sits across a generated lineup cycle', () => {
    const lineup = generateLineup(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => player(id)), [], 3, 4)
    const sitCounts = lineup.map((item) => item.assignments.filter((assignment) => assignment === 'Sit').length)
    expect(sitCounts.reduce((sum, count) => sum + count, 0)).toBe(6)
    expect(sitCounts).toEqual([1, 1, 1, 1, 1, 1])
  })

  it('assigns unique fielding positions within each generated inning', () => {
    const lineup = generateLineup(['a', 'b', 'c', 'd'].map((id) => player(id)), [], 4, 4)

    Array.from({ length: 4 }, (_, inning) => inning).forEach((inning) => {
      const fieldingAssignments = lineup.map((item) => item.assignments[inning]).filter((assignment) => assignment !== 'Sit' && assignment !== '')
      expect(new Set(fieldingAssignments).size).toBe(fieldingAssignments.length)
    })
  })
})
