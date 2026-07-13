import type { LineupMode, LineupRow, PendingChange, Position } from '../types'
import { isFieldingPosition } from './positions'

export function getLineupChangeKey(mode: LineupMode, playerId: string, inning: number) {
  return `${mode}:${playerId}:${inning}`
}

export function getPendingLineupChanges(before: LineupRow[], after: LineupRow[], innings: number, mode: LineupMode, reason: string): PendingChange[] {
  const beforeByPlayer = new Map(before.map((row) => [row.playerId, row]))
  const changes: PendingChange[] = []

  after.forEach((row) => {
    const previous = beforeByPlayer.get(row.playerId)
    if (!previous) return

    for (let inning = 0; inning < innings; inning += 1) {
      const oldValue = previous.assignments[inning] ?? ''
      const newValue = row.assignments[inning] ?? ''
      if (oldValue !== newValue) {
        changes.push({
          id: getLineupChangeKey(mode, row.playerId, inning),
          mode,
          playerId: row.playerId,
          playerName: row.playerName,
          inning,
          oldValue,
          newValue,
          reason,
        })
      }
    }
  })

  return changes
}

export function applyAssignmentEdit(lineup: LineupRow[], rowIndex: number, inning: number, value: Position) {
  const next = lineup.map((row) => ({ ...row, assignments: row.assignments.slice() }))
  const edited = next[rowIndex]
  const oldValue = edited?.assignments[inning] ?? ''
  if (!edited || oldValue === value) return null

  const changedCells = [{ playerId: edited.playerId, inning }]
  edited.assignments[inning] = value

  if (isFieldingPosition(value)) {
    const currentHolderIndex = next.findIndex((row, index) => index !== rowIndex && row.assignments[inning] === value)
    if (currentHolderIndex >= 0) {
      next[currentHolderIndex].assignments[inning] = oldValue
      changedCells.push({ playerId: next[currentHolderIndex].playerId, inning })
    }
  } else if (value === 'Sit' && isFieldingPosition(oldValue)) {
    const sitterIndex = next.findIndex((row, index) => index !== rowIndex && row.assignments[inning] === 'Sit')
    if (sitterIndex >= 0) {
      next[sitterIndex].assignments[inning] = oldValue
      changedCells.push({ playerId: next[sitterIndex].playerId, inning })
    }
  }

  return { lineup: next, changedCells }
}

export function lineupWithChanges(lineup: LineupRow[], changes: PendingChange[]) {
  if (changes.length === 0) return lineup
  const changesByCell = new Map(changes.map((change) => [change.id, change]))
  return lineup.map((row) => ({
    ...row,
    assignments: row.assignments.map((assignment, inning) => {
      const change = changesByCell.get(getLineupChangeKey(changes[0].mode, row.playerId, inning))
      return change ? change.newValue : assignment
    }),
  }))
}
