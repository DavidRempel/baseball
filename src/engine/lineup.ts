import { INFIELD, OUTFIELD } from '../types'
import type { FieldingPosition, GameCounts, GameLog, LineupRow, Player, PlayerTotals, Position } from '../types'
import { getAssignableFieldingPositions, isFieldingPosition } from './positions'
import { getTotals, emptyPositionCounts } from './totals'

export { isFieldingPosition } from './positions'

export function createBlankLineup(players: Player[], innings: number): LineupRow[] {
  return players
    .filter((player) => player.present && player.name.trim())
    .map((player, index) => ({
      playerId: player.id,
      playerName: player.name,
      batOrder: index + 1,
      assignments: Array.from({ length: innings }, () => '' as Position),
    }))
}

export function shuffle<T>(items: T[]) {
  const arr = items.slice()
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function rotate<T>(items: T[], by: number) {
  const offset = ((by % items.length) + items.length) % items.length
  return items.slice(offset).concat(items.slice(0, offset))
}

export function battingScore(players: Player[], totals: Map<string, PlayerTotals>) {
  const firstCounts = players.map((player) => totals.get(player.id)?.first ?? 0)
  const lastCounts = players.map((player) => totals.get(player.id)?.last ?? 0)
  const minFirst = Math.min(...firstCounts)
  const minLast = Math.min(...lastCounts)
  let score = Math.random()

  players.forEach((player, index) => {
    score += ((totals.get(player.id)?.batSlots[index + 1] ?? 0) * 6)
  })

  const first = totals.get(players[0].id)
  const last = totals.get(players[players.length - 1].id)
  score += (((first?.first ?? 0) - minFirst) * 50) + ((first?.first ?? 0) * 10)
  score += (((last?.last ?? 0) - minLast) * 50) + ((last?.last ?? 0) * 10)
  return score
}

export function chooseBattingOrder(players: Player[], totals: Map<string, PlayerTotals>) {
  if (players.length === 0) return []
  let best = players.slice()
  let bestScore = Number.POSITIVE_INFINITY
  for (let i = 0; i < 500; i += 1) {
    const candidate = shuffle(players)
    const score = battingScore(candidate, totals)
    if (score < bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best
}

export function generateLineup(players: Player[], games: GameLog[], innings: number, fieldingSpots: number): LineupRow[] {
  const present = players.filter((player) => player.present && player.name.trim())
  const totals = getTotals(players, games)
  const battingOrder = chooseBattingOrder(present, totals)
  const playersById = new Map(players.map((player) => [player.id, player]))
  const sitPerInning = Math.max(0, present.length - fieldingSpots)
  const gameCounts = new Map<string, GameCounts>()

  battingOrder.forEach((player) => {
    gameCounts.set(player.id, {
      sits: 0,
      infield: 0,
      outfield: 0,
      positions: emptyPositionCounts(),
    })
  })

  const rows: LineupRow[] = battingOrder.map((player, index) => ({
    playerId: player.id,
    playerName: player.name,
    batOrder: index + 1,
    assignments: Array.from({ length: innings }, () => ''),
  }))

  for (let inning = 0; inning < innings; inning += 1) {
    const sitters = chooseSitters(battingOrder, totals, gameCounts, sitPerInning)
    sitters.forEach((player) => {
      rows.find((row) => row.playerId === player.id)!.assignments[inning] = 'Sit'
      gameCounts.get(player.id)!.sits += 1
    })

    const fielders = battingOrder.filter((player) => !sitters.some((sitter) => sitter.id === player.id))
    const positions = rotate(getAssignableFieldingPositions(fieldingSpots, fielders.length), inning).slice(0, fielders.length)
    const remaining = fielders.slice()

    positions.forEach((position) => {
      const noRepeatChoices = remaining.filter((player) => (gameCounts.get(player.id)?.positions[position] ?? 0) === 0)
      const choices = noRepeatChoices.length > 0 ? noRepeatChoices : remaining
      choices.sort((a, b) => positionScore(a.id, position, totals, gameCounts, playersById) - positionScore(b.id, position, totals, gameCounts, playersById))
      const player = choices[0]
      if (!player) return
      remaining.splice(remaining.findIndex((candidate) => candidate.id === player.id), 1)
      rows.find((row) => row.playerId === player.id)!.assignments[inning] = position
      const counts = gameCounts.get(player.id)!
      counts.positions[position] += 1
      if (INFIELD.has(position)) counts.infield += 1
      if (OUTFIELD.has(position)) counts.outfield += 1
    })
  }

  return rows
}

export function chooseSitters(
  players: Player[],
  totals: Map<string, PlayerTotals>,
  gameCounts: Map<string, { sits: number }>,
  sitPerInning: number,
) {
  if (sitPerInning <= 0) return []
  const lowestCurrentSit = Math.min(...players.map((player) => gameCounts.get(player.id)?.sits ?? 0))
  const currentCycle = players
    .filter((player) => (gameCounts.get(player.id)?.sits ?? 0) === lowestCurrentSit)
    .sort((a, b) => (totals.get(a.id)?.sits ?? 0) - (totals.get(b.id)?.sits ?? 0) || Math.random() - 0.5)

  if (currentCycle.length >= sitPerInning) return currentCycle.slice(0, sitPerInning)

  const selected = currentCycle.slice()
  const rest = players
    .filter((player) => !selected.some((selectedPlayer) => selectedPlayer.id === player.id))
    .sort((a, b) => {
      return (
        ((gameCounts.get(a.id)?.sits ?? 0) - (gameCounts.get(b.id)?.sits ?? 0)) ||
        ((totals.get(a.id)?.sits ?? 0) - (totals.get(b.id)?.sits ?? 0)) ||
        Math.random() - 0.5
      )
    })
  return selected.concat(rest.slice(0, sitPerInning - selected.length))
}

export function positionScore(
  playerId: string,
  position: FieldingPosition,
  totals: Map<string, PlayerTotals>,
  gameCounts: Map<string, GameCounts>,
  playersById: Map<string, Player>,
  randomize = true,
) {
  const seasonCount = totals.get(playerId)?.positions[position] ?? 0
  const game = gameCounts.get(playerId)!
  let score = randomize ? Math.random() : 0
  score += seasonCount * 18
  score += game.positions[position] * 100
  if (seasonCount === 0 && game.positions[position] === 0) score -= 20
  if (INFIELD.has(position)) {
    if (game.outfield > 0 && game.infield === 0) score -= 8
    if (game.infield > 0 && game.outfield === 0) score += 12
  }
  if (OUTFIELD.has(position)) {
    if (game.infield > 0 && game.outfield === 0) score -= 8
    if (game.outfield > 0 && game.infield === 0) score += 12
  }
  const player = playersById.get(playerId)
  const preferenceIndex = player?.preferredPositions.indexOf(position) ?? -1
  if (preferenceIndex >= 0) score -= [3, 2, 1][preferenceIndex] ?? 0
  const dislikedIndex = player?.dislikedPositions.indexOf(position) ?? -1
  if (dislikedIndex >= 0 && player) {
    const eligiblePlayers = [...playersById.values()].filter((candidate) => candidate.present && candidate.name.trim())
    const avoiderCount = eligiblePlayers.filter((candidate) => candidate.dislikedPositions.includes(position)).length
    const avoidanceShare = avoiderCount / Math.max(1, eligiblePlayers.length)
    const rosterRarity = Math.max(0.25, 1.2 - avoidanceShare)
    const personalFocus = [0, 1.15, 1, 0.85][player.dislikedPositions.length] ?? 0.85
    score += ([60, 42, 28][dislikedIndex] ?? 0) * rosterRarity * personalFocus
  }
  return score
}

export function getGameCountsForLineup(lineup: LineupRow[], innings: number, excludeInning?: number) {
  const gameCounts = new Map<string, GameCounts>()
  lineup.forEach((row) => {
    const counts: GameCounts = {
      sits: 0,
      infield: 0,
      outfield: 0,
      positions: emptyPositionCounts(),
    }

    row.assignments.slice(0, innings).forEach((assignment, inning) => {
      if (inning === excludeInning) return
      if (assignment === 'Sit') counts.sits += 1
      if (isFieldingPosition(assignment)) {
        counts.positions[assignment] += 1
        if (INFIELD.has(assignment)) counts.infield += 1
        if (OUTFIELD.has(assignment)) counts.outfield += 1
      }
    })

    gameCounts.set(row.playerId, counts)
  })
  return gameCounts
}

export function fixLineupInning(
  lineup: LineupRow[],
  players: Player[],
  games: GameLog[],
  innings: number,
  fieldingSpots: number,
  inning: number,
  options: { forcedSitterIds?: Set<string> } = {},
) {
  const forcedSitterIds = options.forcedSitterIds ?? new Set<string>()
  const totals = getTotals(players, games)
  const playersById = new Map(players.map((player) => [player.id, player]))
  const next = lineup.map((row) => ({ ...row, assignments: row.assignments.slice() }))
  const gameCounts = getGameCountsForLineup(next, innings, inning)
  const expectedSits = Math.max(forcedSitterIds.size, next.length - fieldingSpots)
  const forcedSitters = next.filter((row) => forcedSitterIds.has(row.playerId))
  const extraSitters = next
    .filter((row) => !forcedSitterIds.has(row.playerId))
    .sort((a, b) => {
      const currentA = a.assignments[inning] === 'Sit' ? -25 : 0
      const currentB = b.assignments[inning] === 'Sit' ? -25 : 0
      return (
        ((gameCounts.get(a.playerId)?.sits ?? 0) - (gameCounts.get(b.playerId)?.sits ?? 0)) * 100 ||
        ((totals.get(a.playerId)?.sits ?? 0) - (totals.get(b.playerId)?.sits ?? 0)) * 10 ||
        currentA - currentB ||
        a.batOrder - b.batOrder
      )
    })
    .slice(0, Math.max(0, expectedSits - forcedSitters.length))
  const sitterIds = new Set(forcedSitters.concat(extraSitters).map((row) => row.playerId))

  next.forEach((row) => {
    row.assignments[inning] = sitterIds.has(row.playerId) ? 'Sit' : ''
  })

  const positions = rotate(getAssignableFieldingPositions(fieldingSpots, next.length - sitterIds.size), inning).slice(0, next.length - sitterIds.size)
  const remaining = next.filter((row) => !sitterIds.has(row.playerId))

  positions.forEach((position) => {
    const noRepeatChoices = remaining.filter((row) => (gameCounts.get(row.playerId)?.positions[position] ?? 0) === 0)
    const choices = noRepeatChoices.length > 0 ? noRepeatChoices : remaining
    choices.sort((a, b) => {
      const keepA = lineup.find((row) => row.playerId === a.playerId)?.assignments[inning] === position ? -35 : 0
      const keepB = lineup.find((row) => row.playerId === b.playerId)?.assignments[inning] === position ? -35 : 0
      return (
        positionScore(a.playerId, position, totals, gameCounts, playersById, false) + keepA -
        (positionScore(b.playerId, position, totals, gameCounts, playersById, false) + keepB) ||
        a.batOrder - b.batOrder
      )
    })

    const row = choices[0]
    if (!row) return
    row.assignments[inning] = position
    remaining.splice(remaining.findIndex((candidate) => candidate.playerId === row.playerId), 1)

    const counts = gameCounts.get(row.playerId)!
    counts.positions[position] += 1
    if (INFIELD.has(position)) counts.infield += 1
    if (OUTFIELD.has(position)) counts.outfield += 1
  })

  return next
}
