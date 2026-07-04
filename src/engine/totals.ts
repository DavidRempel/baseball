import { FIELDING_POSITIONS, INFIELD, OUTFIELD } from '../types'
import type { FieldingPosition, GameLog, LineupRow, Player, PlayerTotals, Position } from '../types'
import { isFieldingPosition } from './lineup'

export function emptyPositionCounts() {
  return FIELDING_POSITIONS.reduce(
    (acc, pos) => ({ ...acc, [pos]: 0 }),
    {} as Record<FieldingPosition, number>,
  )
}

export function getTotals(players: Player[], games: GameLog[]) {
  const totals = new Map<string, PlayerTotals>()
  players.forEach((player) => {
    totals.set(player.id, {
      sits: 0,
      first: 0,
      last: 0,
      batSlots: {},
      positions: emptyPositionCounts(),
    })
  })

  games.forEach((game) => {
    const lastOrder = Math.max(...game.lineup.map((row) => row.batOrder), 0)
    game.lineup.forEach((row) => {
      const total = totals.get(row.playerId)
      if (!total) return
      total.sits += row.assignments.filter((value) => value === 'Sit').length
      total.batSlots[row.batOrder] = (total.batSlots[row.batOrder] ?? 0) + 1
      if (row.batOrder === 1) total.first += 1
      if (row.batOrder === lastOrder) total.last += 1
      row.assignments.forEach((value) => {
        if (isFieldingPosition(value)) total.positions[value] += 1
      })
    })
  })

  return totals
}

export function repeatsPosition(row: LineupRow, innings: number) {
  const seen = new Set<FieldingPosition>()
  return row.assignments.slice(0, innings).some((value) => {
    if (!isFieldingPosition(value)) return false
    if (seen.has(value)) return true
    seen.add(value)
    return false
  })
}

export function getWarnings(row: LineupRow, innings: number) {
  const activeAssignments = row.assignments.slice(0, innings)
  const sits = activeAssignments.filter((value) => value === 'Sit').length
  const infield = activeAssignments.filter((value) => INFIELD.has(value)).length
  const outfield = activeAssignments.filter((value) => OUTFIELD.has(value)).length
  const fielded = infield + outfield
  const warnings: string[] = []
  if (sits > 1) warnings.push('sat more than once')
  if (fielded >= 2 && (infield === 0 || outfield === 0)) warnings.push('needs IF/OF rotation')
  if (repeatsPosition(row, innings)) warnings.push('same position twice')
  if (activeAssignments.some((value) => value === '')) warnings.push('blank inning')
  return warnings
}

export function warningSeverity(warning: string) {
  return warning.includes('same position') ||
    warning.includes('duplicate') ||
    warning.includes('blank') ||
    warning.includes('missing') ||
    warning.includes('fielding count')
    ? 'hard'
    : 'minor'
}

export function worstWarningSeverity(warnings: string[]) {
  return warnings.some((warning) => warningSeverity(warning) === 'hard') ? 'hard' : 'minor'
}

export function hasRepeatedPositions(lineup: LineupRow[], innings: number) {
  return lineup.some((row) => repeatsPosition(row, innings))
}

export function isBlankLineup(lineup: LineupRow[], innings: number) {
  return lineup.every((row) => row.assignments.slice(0, innings).every((assignment) => assignment === ''))
}

export function getInningWarnings(lineup: LineupRow[], innings: number, fieldingSpots: number) {
  const expectedSits = Math.max(0, lineup.length - fieldingSpots)
  const warnings: string[] = []

  for (let inning = 0; inning < innings; inning += 1) {
    const label = `Inning ${inning + 1}`
    const assignments = lineup.map((row) => row.assignments[inning] ?? '')
    const sits = assignments.filter((value) => value === 'Sit').length
    const blanks = assignments.filter((value) => value === '').length
    const fielders = assignments.filter(isFieldingPosition).length
    const duplicatePositions = FIELDING_POSITIONS.filter((position) => assignments.filter((value) => value === position).length > 1)
    const missingPositions = fieldingSpots >= FIELDING_POSITIONS.length
      ? FIELDING_POSITIONS.filter((position) => !assignments.includes(position))
      : []

    if (sits !== expectedSits) warnings.push(`${label}: ${sits} sits; expected ${expectedSits}`)
    if (fielders !== Math.min(fieldingSpots, lineup.length - sits - blanks)) warnings.push(`${label}: check fielding count`)
    if (duplicatePositions.length) warnings.push(`${label}: duplicate ${duplicatePositions.join(', ')}`)
    if (missingPositions.length) warnings.push(`${label}: missing ${missingPositions.join(', ')}`)
    if (blanks) warnings.push(`${label}: ${blanks} blank`)
  }

  return warnings
}

export function getInningFixes(lineup: LineupRow[], innings: number, fieldingSpots: number) {
  const expectedSits = Math.max(0, lineup.length - fieldingSpots)
  const fixes: { inning: number; label: string }[] = []

  for (let inning = 0; inning < innings; inning += 1) {
    const assignments = lineup.map((row) => row.assignments[inning] ?? '')
    const sits = assignments.filter((value) => value === 'Sit').length
    const blanks = assignments.filter((value) => value === '').length
    const duplicatePositions = FIELDING_POSITIONS.filter((position) => assignments.filter((value) => value === position).length > 1)
    const missingPositions = fieldingSpots >= FIELDING_POSITIONS.length
      ? FIELDING_POSITIONS.filter((position) => !assignments.includes(position))
      : []

    if ((sits > expectedSits && missingPositions.length > 0) || duplicatePositions.length > 0 || blanks > 0) {
      fixes.push({ inning, label: `Fix inning ${inning + 1}` })
    }
  }

  return fixes
}

export function summarizePlayer(player: Player, games: GameLog[]) {
  const totals = getTotals([player], games).get(player.id) ?? {
    sits: 0,
    first: 0,
    last: 0,
    batSlots: {},
    positions: emptyPositionCounts(),
  }
  const playedGames = games.filter((game) => game.lineup.some((row) => row.playerId === player.id))
  const batOrders = playedGames.flatMap((game) => game.lineup.filter((row) => row.playerId === player.id).map((row) => row.batOrder))
  const avgBat = batOrders.length ? batOrders.reduce((sum, value) => sum + value, 0) / batOrders.length : 0
  const positionVariety = FIELDING_POSITIONS.filter((position) => totals.positions[position] > 0).length
  return { ...totals, games: playedGames.length, avgBat, positionVariety }
}

export function getLastGameAssignment(playerId: string, games: GameLog[]) {
  const lastGame = games.at(-1)
  return lastGame?.lineup.find((row) => row.playerId === playerId)?.assignments ?? []
}

export function explainAssignment(player: Player | undefined, row: LineupRow, assignment: Position, games: GameLog[], lineup: LineupRow[], innings: number) {
  if (!player) return ''
  const summary = summarizePlayer(player, games)
  const deltas = getLineupDeltas(row, lineup, innings)
  const notes: string[] = []

  if (!assignment) notes.push('Blank assignment')
  if (assignment === 'Sit') {
    notes.push(`${summary.sits} season sit${summary.sits === 1 ? '' : 's'} before this game`)
    if (getLastGameAssignment(player.id, games).includes('Sit')) notes.push('sat last logged game')
  }
  if (isFieldingPosition(assignment)) {
    const positionCount = summary.positions[assignment]
    notes.push(`${positionCount} season ${assignment} inning${positionCount === 1 ? '' : 's'} before this game`)
    if (player.preferredPositions.includes(assignment)) notes.push(`preferred position #${player.preferredPositions.indexOf(assignment) + 1}`)
    if (deltas.positions[assignment] > 1) notes.push(`would repeat ${assignment} in this lineup`)
    if (INFIELD.has(assignment)) notes.push(`${summary.positions.C + summary.positions.P + summary.positions['1B'] + summary.positions['2B'] + summary.positions['3B'] + summary.positions.SS} prior IF innings`)
    if (OUTFIELD.has(assignment)) notes.push(`${summary.positions.RF + summary.positions.CF + summary.positions.LF + summary.positions.Rover} prior OF innings`)
  }
  if (row.batOrder === 1) notes.push(`batted first ${summary.first} time${summary.first === 1 ? '' : 's'}`)
  if (row.batOrder === lineup.length) notes.push(`batted last ${summary.last} time${summary.last === 1 ? '' : 's'}`)

  return notes.join(' | ')
}

export function getLineupDeltas(row: LineupRow, lineup: LineupRow[], innings: number) {
  const positions = emptyPositionCounts()
  let sits = 0
  row.assignments.slice(0, innings).forEach((assignment) => {
    if (assignment === 'Sit') sits += 1
    if (isFieldingPosition(assignment)) positions[assignment] += 1
  })
  return {
    sits,
    first: row.batOrder === 1 ? 1 : 0,
    last: row.batOrder === lineup.length ? 1 : 0,
    positions,
  }
}


