import {
  ClipboardList,
  Download,
  History,
  ListPlus,
  RotateCcw,
  Save,
  Shuffle,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import './App.css'

const STORAGE_KEY = 'baseball-lineup-v1'
const FIELDING_POSITIONS = ['C', 'P', '1B', '2B', '3B', 'SS', 'RF', 'CF', 'LF', 'Rover'] as const
const POSITIONS = [...FIELDING_POSITIONS, 'Sit'] as const
const INFIELD = new Set(['C', 'P', '1B', '2B', '3B', 'SS'])
const OUTFIELD = new Set(['RF', 'CF', 'LF', 'Rover'])

type FieldingPosition = (typeof FIELDING_POSITIONS)[number]
type Position = (typeof POSITIONS)[number] | ''

type Player = {
  id: string
  name: string
  present: boolean
  notes: string
}

type LineupRow = {
  playerId: string
  playerName: string
  batOrder: number
  assignments: Position[]
}

type GameLog = {
  id: string
  date: string
  innings: number
  fieldingSpots: number
  lineup: LineupRow[]
}

type AppState = {
  players: Player[]
  games: GameLog[]
  currentLineup: LineupRow[]
  gameDayLineup: LineupRow[]
  gameDate: string
  innings: number
  fieldingSpots: number
}

type PlayerTotals = {
  sits: number
  first: number
  last: number
  batSlots: Record<number, number>
  positions: Record<FieldingPosition, number>
}

type GameCounts = {
  sits: number
  infield: number
  outfield: number
  positions: Record<FieldingPosition, number>
}

const defaultPlayers: Player[] = [
  'Michael',
  'Leo',
  'Arlen',
  'Griffin',
  'Troy',
  'Anderson',
  'Flynn',
  'Nathan',
  'Logan',
  'Clare',
  'Oliver',
  'Lucas',
  'Olle',
  'Kieran',
].map((name, index) => ({
  id: makeId(`p-${index + 1}`),
  name,
  present: true,
  notes: '',
}))

function makeId(fallback = `id-${Date.now()}-${Math.random().toString(16).slice(2)}`) {
  return globalThis.crypto?.randomUUID?.() ?? fallback
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function createInitialState(): AppState {
  return {
    players: defaultPlayers,
    games: [],
    currentLineup: [],
    gameDayLineup: [],
    gameDate: today(),
    innings: 3,
    fieldingSpots: 10,
  }
}

function loadState(): AppState {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) return createInitialState()
  try {
    return { ...createInitialState(), ...JSON.parse(saved) }
  } catch {
    return createInitialState()
  }
}

function emptyPositionCounts() {
  return FIELDING_POSITIONS.reduce(
    (acc, pos) => ({ ...acc, [pos]: 0 }),
    {} as Record<FieldingPosition, number>,
  )
}

function getTotals(players: Player[], games: GameLog[]) {
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

function isFieldingPosition(value: Position): value is FieldingPosition {
  return FIELDING_POSITIONS.includes(value as FieldingPosition)
}

function shuffle<T>(items: T[]) {
  const arr = items.slice()
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function rotate<T>(items: T[], by: number) {
  const offset = ((by % items.length) + items.length) % items.length
  return items.slice(offset).concat(items.slice(0, offset))
}

function battingScore(players: Player[], totals: Map<string, PlayerTotals>) {
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

function chooseBattingOrder(players: Player[], totals: Map<string, PlayerTotals>) {
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

function generateLineup(players: Player[], games: GameLog[], innings: number, fieldingSpots: number): LineupRow[] {
  const present = players.filter((player) => player.present && player.name.trim())
  const totals = getTotals(players, games)
  const battingOrder = chooseBattingOrder(present, totals)
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
    const positions = rotate(FIELDING_POSITIONS.slice(), inning).slice(0, Math.min(fielders.length, fieldingSpots, FIELDING_POSITIONS.length))
    const remaining = fielders.slice()

    positions.forEach((position) => {
      const noRepeatChoices = remaining.filter((player) => (gameCounts.get(player.id)?.positions[position] ?? 0) === 0)
      const choices = noRepeatChoices.length > 0 ? noRepeatChoices : remaining
      choices.sort((a, b) => positionScore(a.id, position, totals, gameCounts) - positionScore(b.id, position, totals, gameCounts))
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

function chooseSitters(
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

function positionScore(
  playerId: string,
  position: FieldingPosition,
  totals: Map<string, PlayerTotals>,
  gameCounts: Map<string, GameCounts>,
  randomize = true,
) {
  const seasonCount = totals.get(playerId)?.positions[position] ?? 0
  const game = gameCounts.get(playerId)!
  let score = randomize ? Math.random() : 0
  score += seasonCount * 8
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
  return score
}

function getGameCountsForLineup(lineup: LineupRow[], innings: number, excludeInning?: number) {
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

function fixLineupInning(
  lineup: LineupRow[],
  players: Player[],
  games: GameLog[],
  innings: number,
  fieldingSpots: number,
  inning: number,
) {
  const totals = getTotals(players, games)
  const next = lineup.map((row) => ({ ...row, assignments: row.assignments.slice() }))
  const gameCounts = getGameCountsForLineup(next, innings, inning)
  const expectedSits = Math.max(0, next.length - fieldingSpots)

  const sitters = next
    .slice()
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
    .slice(0, expectedSits)

  const sitterIds = new Set(sitters.map((row) => row.playerId))
  next.forEach((row) => {
    row.assignments[inning] = sitterIds.has(row.playerId) ? 'Sit' : ''
  })

  const positions = rotate(FIELDING_POSITIONS.slice(), inning).slice(0, Math.min(next.length - expectedSits, fieldingSpots, FIELDING_POSITIONS.length))
  const remaining = next.filter((row) => !sitterIds.has(row.playerId))

  positions.forEach((position) => {
    const noRepeatChoices = remaining.filter((row) => (gameCounts.get(row.playerId)?.positions[position] ?? 0) === 0)
    const choices = noRepeatChoices.length > 0 ? noRepeatChoices : remaining
    choices.sort((a, b) => {
      const keepA = lineup.find((row) => row.playerId === a.playerId)?.assignments[inning] === position ? -35 : 0
      const keepB = lineup.find((row) => row.playerId === b.playerId)?.assignments[inning] === position ? -35 : 0
      return (
        positionScore(a.playerId, position, totals, gameCounts, false) + keepA -
        (positionScore(b.playerId, position, totals, gameCounts, false) + keepB) ||
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

function repeatsPosition(row: LineupRow, innings: number) {
  const seen = new Set<FieldingPosition>()
  return row.assignments.slice(0, innings).some((value) => {
    if (!isFieldingPosition(value)) return false
    if (seen.has(value)) return true
    seen.add(value)
    return false
  })
}

function getWarnings(row: LineupRow, innings: number) {
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

function hasRepeatedPositions(lineup: LineupRow[], innings: number) {
  return lineup.some((row) => repeatsPosition(row, innings))
}

function getInningWarnings(lineup: LineupRow[], innings: number, fieldingSpots: number) {
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

function getInningFixes(lineup: LineupRow[], innings: number, fieldingSpots: number) {
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

function summarizePlayer(player: Player, games: GameLog[]) {
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

function exportCsv(games: GameLog[]) {
  const header = ['Date', 'Player', 'Bat Order', 'Inning 1', 'Inning 2', 'Inning 3', 'Inning 4', 'Sit Count', 'Notes']
  const rows = games.flatMap((game) =>
    game.lineup.map((row) => [
      game.date,
      row.playerName,
      String(row.batOrder),
      row.assignments[0] ?? '',
      row.assignments[1] ?? '',
      row.assignments[2] ?? '',
      row.assignments[3] ?? '',
      String(row.assignments.filter((value) => value === 'Sit').length),
      getWarnings(row, game.innings).join('; '),
    ]),
  )
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n')
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"' && quoted && next === '"') {
      cell += '"'
      i += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1
      row.push(cell)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

function headerIndex(headers: string[], names: string[]) {
  const normalized = headers.map((header) => header.trim().toLowerCase())
  return names.map((name) => normalized.indexOf(name.toLowerCase())).find((index) => index !== -1) ?? -1
}

function normalizePosition(value: string): Position {
  const trimmed = value.trim()
  const match = POSITIONS.find((position) => position.toLowerCase() === trimmed.toLowerCase())
  return match ?? ''
}

function buildGamesFromCsv(text: string, players: Player[]) {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('No CSV rows found.')

  const headers = rows[0]
  const dateIndex = headerIndex(headers, ['date', 'game date'])
  const playerIndex = headerIndex(headers, ['player', 'name'])
  const batIndex = headerIndex(headers, ['bat order', 'bat #', 'bat'])
  const inningIndexes = [
    headerIndex(headers, ['inning 1', 'inn 1']),
    headerIndex(headers, ['inning 2', 'inn 2']),
    headerIndex(headers, ['inning 3', 'inn 3']),
    headerIndex(headers, ['inning 4', 'inn 4']),
  ]

  if (dateIndex < 0 || playerIndex < 0 || batIndex < 0 || inningIndexes.slice(0, 3).some((index) => index < 0)) {
    throw new Error('CSV needs Date, Player, Bat Order, and Inning 1-3 columns.')
  }

  const playerMap = new Map(players.map((player) => [player.name.trim().toLowerCase(), player]))
  const nextPlayers = players.slice()
  const grouped = new Map<string, LineupRow[]>()

  rows.slice(1).forEach((csvRow) => {
    const date = csvRow[dateIndex]?.trim()
    const playerName = csvRow[playerIndex]?.trim()
    if (!date || !playerName) return

    let player = playerMap.get(playerName.toLowerCase())
    if (!player) {
      player = { id: makeId(), name: playerName, present: true, notes: '' }
      playerMap.set(playerName.toLowerCase(), player)
      nextPlayers.push(player)
    }

    const assignments = inningIndexes.map((index) => (index >= 0 ? normalizePosition(csvRow[index] ?? '') : ''))
    const row: LineupRow = {
      playerId: player.id,
      playerName: player.name,
      batOrder: Number(csvRow[batIndex]) || (grouped.get(date)?.length ?? 0) + 1,
      assignments,
    }

    grouped.set(date, [...(grouped.get(date) ?? []), row])
  })

  const games = Array.from(grouped.entries()).map(([date, lineup]) => {
    const orderedLineup = lineup.slice().sort((a, b) => a.batOrder - b.batOrder)
    const innings = orderedLineup.some((row) => row.assignments[3]) ? 4 : 3
    const maxFielders = Math.max(
      ...Array.from({ length: innings }, (_, inning) => orderedLineup.filter((row) => isFieldingPosition(row.assignments[inning] ?? '')).length),
      0,
    )

    return {
      id: makeId(),
      date,
      innings,
      fieldingSpots: Math.max(6, Math.min(10, maxFielders || 10)),
      lineup: orderedLineup.map((row, index) => ({ ...row, batOrder: index + 1 })),
    }
  })

  if (!games.length) throw new Error('No game history found in CSV.')
  return { players: nextPlayers, games }
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function App() {
  const [state, setState] = useState<AppState>(() => loadState())
  const [tab, setTab] = useState<'lineup' | 'gameday' | 'roster' | 'history'>('lineup')
  const [candidates, setCandidates] = useState<LineupRow[][]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const historyInput = useRef<HTMLInputElement>(null)

  const totals = useMemo(() => getTotals(state.players, state.games), [state.players, state.games])
  const presentCount = state.players.filter((player) => player.present && player.name.trim()).length
  const sitPerInning = Math.max(0, presentCount - state.fieldingSpots)

  function commit(next: AppState) {
    setState(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  function updatePlayer(id: string, patch: Partial<Player>) {
    commit({
      ...state,
      players: state.players.map((player) => (player.id === id ? { ...player, ...patch } : player)),
    })
  }

  function deleteUnusedPlayer(id: string) {
    const hasHistory = state.games.some((game) => game.lineup.some((row) => row.playerId === id))
    if (hasHistory) return
    commit({
      ...state,
      players: state.players.filter((player) => player.id !== id),
      currentLineup: state.currentLineup.filter((row) => row.playerId !== id),
      gameDayLineup: state.gameDayLineup.filter((row) => row.playerId !== id),
    })
  }

  function addPlayer() {
    commit({
      ...state,
      players: [...state.players, { id: makeId(), name: '', present: true, notes: '' }],
    })
    setTab('roster')
  }

  function generateCandidates() {
    const next = Array.from({ length: 5 }, () => generateLineup(state.players, state.games, state.innings, state.fieldingSpots))
    setCandidates(next)
    commit({ ...state, currentLineup: next[0] ?? [] })
    setTab('lineup')
  }

  function setLineup(nextLineup: LineupRow[], mode: 'current' | 'gameday' = 'current') {
    const normalized = nextLineup.map((row, index) => ({ ...row, batOrder: index + 1 }))
    commit(mode === 'gameday' ? { ...state, gameDayLineup: normalized } : { ...state, currentLineup: normalized })
  }

  function updateAssignment(rowIndex: number, inning: number, value: Position, mode: 'current' | 'gameday' = 'current') {
    const source = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    const next = source.map((row) => ({ ...row, assignments: row.assignments.slice() }))
    const oldValue = next[rowIndex]?.assignments[inning] ?? ''
    if (!next[rowIndex] || oldValue === value) return

    next[rowIndex].assignments[inning] = value

    if (isFieldingPosition(value)) {
      const currentHolderIndex = next.findIndex((row, index) => index !== rowIndex && row.assignments[inning] === value)
      if (currentHolderIndex >= 0) {
        next[currentHolderIndex].assignments[inning] = oldValue
      }
    }

    setLineup(next, mode)
  }

  function moveRow(index: number, direction: -1 | 1, mode: 'current' | 'gameday' = 'current') {
    const source = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= source.length) return
    const next = source.slice()
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    setLineup(next, mode)
  }

  function fixInning(inning: number, mode: 'current' | 'gameday' = 'current') {
    const source = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    setLineup(fixLineupInning(source, state.players, state.games, state.innings, state.fieldingSpots, inning), mode)
  }

  function fixPlayerRepeats(mode: 'current' | 'gameday' = 'current') {
    const source = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    const next = Array.from({ length: state.innings }, (_, inning) => inning).reduce(
      (lineup, inning) => fixLineupInning(lineup, state.players, state.games, state.innings, state.fieldingSpots, inning),
      source,
    )
    setLineup(next, mode)
  }

  function logGame(mode: 'current' | 'gameday' = 'current') {
    const lineup = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    if (!lineup.length) return
    const game: GameLog = {
      id: makeId(),
      date: state.gameDate,
      innings: state.innings,
      fieldingSpots: state.fieldingSpots,
      lineup,
    }
    commit({
      ...state,
      games: [...state.games, game],
      currentLineup: mode === 'current' ? [] : state.currentLineup,
      gameDayLineup: mode === 'gameday' ? [] : state.gameDayLineup,
      gameDate: today(),
    })
    setCandidates([])
    setTab('history')
  }

  function saveToGameDay() {
    commit({
      ...state,
      gameDayLineup: state.currentLineup.map((row) => ({ ...row, assignments: row.assignments.slice() })),
    })
    setTab('gameday')
  }

  function exportBackup() {
    downloadFile(`baseball-lineup-backup-${today()}.json`, JSON.stringify(state, null, 2), 'application/json')
  }

  function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result)) as AppState
        commit({ ...createInitialState(), ...imported })
      } catch {
        window.alert('Could not read that backup file.')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  function importHistory(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = buildGamesFromCsv(String(reader.result), state.players)
        commit({ ...state, players: imported.players, games: [...state.games, ...imported.games] })
        window.alert(`Imported ${imported.games.length} game${imported.games.length === 1 ? '' : 's'} into history.`)
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Could not import that history CSV.')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  function renderLineup(showHistoryPanel: boolean, mode: 'current' | 'gameday' = 'current') {
    const lineup = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    const isGameDay = mode === 'gameday'
    const inningWarnings = getInningWarnings(lineup, state.innings, state.fieldingSpots)
    const inningFixes = getInningFixes(lineup, state.innings, state.fieldingSpots)
    const hasPlayerRepeats = hasRepeatedPositions(lineup, state.innings)
    return (
      <section className="workspace">
        {!isGameDay && (
          <div className="candidate-strip">
            {candidates.map((candidate, index) => (
              <button
                type="button"
                key={index}
                className={state.currentLineup === candidate ? 'selected' : ''}
                onClick={() => commit({ ...state, currentLineup: candidate })}
              >
                Option {index + 1}
              </button>
            ))}
            {candidates.length > 0 && (
              <button type="button" onClick={generateCandidates}>
                <RotateCcw size={16} /> More
              </button>
            )}
          </div>
        )}

        {lineup.length === 0 ? (
          <div className="empty-state">
            <Shuffle size={32} />
            <h2>{isGameDay ? 'No Gameday lineup saved yet.' : 'Generate a lineup to start.'}</h2>
          </div>
        ) : (
          <>
            {(inningWarnings.length > 0 || hasPlayerRepeats) && (
              <div className="inning-warnings">
                {inningWarnings.map((warning) => (
                  <span key={warning}>{warning}</span>
                ))}
                {hasPlayerRepeats && <span>One or more players repeat the same position</span>}
                {inningFixes.map((fix) => (
                  <button type="button" key={fix.inning} onClick={() => fixInning(fix.inning, mode)}>
                    {fix.label}
                  </button>
                ))}
                {hasPlayerRepeats && (
                  <button type="button" onClick={() => fixPlayerRepeats(mode)}>
                    Fix repeated positions
                  </button>
                )}
              </div>
            )}
            <div className={showHistoryPanel ? 'lineup-split' : ''}>
              <div className="lineup-table">
                <div className={`lineup-row heading innings-${state.innings}`}>
                  <span>Move</span>
                  <span>Bat</span>
                  <span>Player</span>
                  {Array.from({ length: state.innings }, (_, index) => (
                    <span key={index}>Inning {index + 1}</span>
                  ))}
                  <span>Warn</span>
                </div>
                {lineup.map((row, rowIndex) => {
                  const warnings = getWarnings(row, state.innings)
                  return (
                    <div className={`lineup-row innings-${state.innings}`} key={row.playerId}>
                      <span className="move-buttons">
                        <button type="button" onClick={() => moveRow(rowIndex, -1, mode)} disabled={rowIndex === 0} title="Move up">
                          ↑
                        </button>
                        <button type="button" onClick={() => moveRow(rowIndex, 1, mode)} disabled={rowIndex === lineup.length - 1} title="Move down">
                          ↓
                        </button>
                      </span>
                      <strong>{row.batOrder}</strong>
                      <span>{row.playerName}</span>
                      {Array.from({ length: state.innings }, (_, inning) => (
                        <select key={inning} value={row.assignments[inning] ?? ''} onChange={(event) => updateAssignment(rowIndex, inning, event.target.value as Position, mode)}>
                          <option value=""></option>
                          {POSITIONS.map((position) => (
                            <option key={position} value={position}>
                              {position}
                            </option>
                          ))}
                        </select>
                      ))}
                      <span className={warnings.length ? 'warning' : 'quiet'} title={warnings.join('; ') || 'ok'}>{warnings.join('; ') || 'ok'}</span>
                    </div>
                  )
                })}
              </div>

              {showHistoryPanel && (
                <aside className="lineup-history-panel">
                  <div className="compact-history-header">
                    <span>Player</span>
                    <span>Sit</span>
                    <span>1st</span>
                    <span>Last</span>
                    {FIELDING_POSITIONS.map((position) => (
                      <span key={position}>{position}</span>
                    ))}
                  </div>
                  {lineup.map((row) => {
                    const player = state.players.find((item) => item.id === row.playerId)
                    const summary = player ? summarizePlayer(player, state.games) : undefined
                    return (
                      <div className="compact-history-row" key={row.playerId}>
                        <strong>{row.playerName}</strong>
                        <span>{summary?.sits ?? 0}</span>
                        <span>{summary?.first ?? 0}</span>
                        <span>{summary?.last ?? 0}</span>
                        {FIELDING_POSITIONS.map((position) => (
                          <span key={position}>{summary?.positions[position] ?? 0}</span>
                        ))}
                      </div>
                    )
                  })}
                </aside>
              )}
            </div>
            <div className="bottom-actions">
                {!isGameDay && (
                  <button type="button" onClick={saveToGameDay}>
                    <ClipboardList size={18} /> Save to Gameday
                  </button>
                )}
                <button type="button" onClick={() => downloadFile(`baseball-log-${today()}.csv`, exportCsv([{ id: isGameDay ? 'gameday' : 'current', date: state.gameDate, innings: state.innings, fieldingSpots: state.fieldingSpots, lineup }]), 'text/csv')}>
                  <Download size={18} /> Export CSV
                </button>
                <button className="primary" type="button" onClick={() => logGame(mode)}>
                  <Save size={18} /> Log Game
                </button>
            </div>
          </>
        )}
      </section>
    )
  }

  return (
    <main>
      <header className="app-header">
        <div>
          <p className="eyebrow">Baseball lineup planner</p>
          <h1>Lineups, rotations, and history</h1>
        </div>
        <div className="header-actions">
          <button type="button" onClick={exportBackup} title="Download JSON backup">
            <Download size={18} />
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} title="Import JSON backup">
            <Upload size={18} />
          </button>
          <input ref={fileInput} className="hidden" type="file" accept="application/json" onChange={importBackup} />
        </div>
      </header>

      <section className="toolbar">
        <label>
          Date
          <input value={state.gameDate} type="date" onChange={(event) => commit({ ...state, gameDate: event.target.value })} />
        </label>
        <label>
          Innings
          <select value={state.innings} onChange={(event) => commit({ ...state, innings: Number(event.target.value), currentLineup: [] })}>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
        <label>
          Fielders
          <input
            min={6}
            max={10}
            type="number"
            value={state.fieldingSpots}
            onChange={(event) => commit({ ...state, fieldingSpots: Number(event.target.value), currentLineup: [] })}
          />
        </label>
        <div className="metrics">
          <span>{presentCount} present</span>
          <span>{sitPerInning} sits / inning</span>
          <span>{state.games.length} logged</span>
        </div>
        <button className="primary" type="button" onClick={generateCandidates}>
          <Shuffle size={18} /> Generate
        </button>
      </section>

      <nav className="tabs" aria-label="Views">
        <button type="button" className={tab === 'lineup' ? 'active' : ''} onClick={() => setTab('lineup')}>
          <ClipboardList size={18} /> Lineup
        </button>
        <button type="button" className={tab === 'gameday' ? 'active' : ''} onClick={() => setTab('gameday')}>
          <Save size={18} /> Gameday
        </button>
        <button type="button" className={tab === 'roster' ? 'active' : ''} onClick={() => setTab('roster')}>
          <Users size={18} /> Roster
        </button>
        <button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          <History size={18} /> History
        </button>
      </nav>

      {tab === 'lineup' && renderLineup(true)}
      {tab === 'gameday' && renderLineup(true, 'gameday')}

      {tab === 'roster' && (
        <section className="workspace">
          <div className="section-title">
            <h2>Roster</h2>
            <button type="button" onClick={addPlayer}>
              <ListPlus size={18} /> Add
            </button>
          </div>
          <div className="roster-list">
            {state.players.map((player) => {
              const playerTotals = totals.get(player.id)
              return (
                <div className="roster-row" key={player.id}>
                  <label className="toggle">
                    <input type="checkbox" checked={player.present} onChange={(event) => updatePlayer(player.id, { present: event.target.checked })} />
                    Present
                  </label>
                  <input value={player.name} placeholder="Player" onChange={(event) => updatePlayer(player.id, { name: event.target.value })} />
                  <input value={player.notes} placeholder="Notes" onChange={(event) => updatePlayer(player.id, { notes: event.target.value })} />
                  <span>{playerTotals?.sits ?? 0} sits</span>
                  <button
                    type="button"
                    onClick={() => deleteUnusedPlayer(player.id)}
                    disabled={state.games.some((game) => game.lineup.some((row) => row.playerId === player.id))}
                    title="Remove unused player"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {tab === 'history' && (
        <section className="workspace">
          <div className="section-title">
            <h2>Player history</h2>
            <div className="history-actions">
              <button type="button" onClick={() => historyInput.current?.click()}>
                <Upload size={18} /> Import CSV
              </button>
              <button type="button" onClick={() => downloadFile(`baseball-history-${today()}.csv`, exportCsv(state.games), 'text/csv')}>
                <Download size={18} /> CSV
              </button>
              <input ref={historyInput} className="hidden" type="file" accept=".csv,text/csv" onChange={importHistory} />
            </div>
          </div>
          <div className="history-table">
            <div className="history-row heading">
              <span>Player</span>
              <span>Games</span>
              <span>Sits</span>
              <span>First</span>
              <span>Last</span>
              <span>Avg Bat</span>
              <span>Variety</span>
              {FIELDING_POSITIONS.map((position) => (
                <span key={position}>{position}</span>
              ))}
            </div>
            {state.players.map((player) => {
              const summary = summarizePlayer(player, state.games)
              return (
                <div className="history-row" key={player.id}>
                  <strong>{player.name}</strong>
                  <span>{summary.games}</span>
                  <span>{summary.sits}</span>
                  <span>{summary.first}</span>
                  <span>{summary.last}</span>
                  <span>{summary.avgBat ? summary.avgBat.toFixed(1) : ''}</span>
                  <span>{summary.positionVariety}</span>
                  {FIELDING_POSITIONS.map((position) => (
                    <span key={position}>{summary.positions[position]}</span>
                  ))}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </main>
  )
}

export default App
