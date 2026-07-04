import type { GameLog, LineupRow, Player, Position } from '../types'
import { fixLineupInning } from './lineup'

export function getRosterLineupDiff(lineup: LineupRow[], players: Player[]) {
  const lineupIds = new Set(lineup.map((row) => row.playerId))
  const playersById = new Map(players.map((player) => [player.id, player]))
  const added = players.filter((player) => player.present && player.name.trim() && !lineupIds.has(player.id))
  const removed = lineup.filter((row) => {
    const player = playersById.get(row.playerId)
    return !player || !player.present || !player.name.trim()
  })
  const renamed = lineup.filter((row) => {
    const player = playersById.get(row.playerId)
    return player?.name.trim() && row.playerName !== player.name.trim()
  })
  return { added, removed, renamed }
}

export function rebalanceLineup(
  lineup: LineupRow[],
  players: Player[],
  games: GameLog[],
  innings: number,
  fieldingSpots: number,
) {
  return Array.from({ length: innings }, (_, inning) => inning).reduce(
    (nextLineup, inning) => fixLineupInning(nextLineup, players, games, innings, fieldingSpots, inning),
    lineup,
  )
}

export function syncLineupToRoster(
  lineup: LineupRow[],
  players: Player[],
  games: GameLog[],
  innings: number,
  fieldingSpots: number,
) {
  const playersById = new Map(players.map((player) => [player.id, player]))
  const existing = lineup
    .filter((row) => {
      const player = playersById.get(row.playerId)
      return player?.present && player.name.trim()
    })
    .map((row) => {
      const player = playersById.get(row.playerId)!
      return {
        ...row,
        playerName: player.name.trim(),
        assignments: Array.from({ length: innings }, (_, inning) => row.assignments[inning] ?? ''),
      }
    })

  const existingIds = new Set(existing.map((row) => row.playerId))
  const added = players
    .filter((player) => player.present && player.name.trim() && !existingIds.has(player.id))
    .map((player, index) => ({
      playerId: player.id,
      playerName: player.name.trim(),
      batOrder: existing.length + index + 1,
      assignments: Array.from({ length: innings }, () => '' as Position),
    }))

  return rebalanceLineup(
    existing.concat(added).map((row, index) => ({ ...row, batOrder: index + 1 })),
    players,
    games,
    innings,
    fieldingSpots,
  )
}


