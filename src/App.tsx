import {
  ClipboardList,
  Copy,
  Download,
  Edit3,
  GripVertical,
  History,
  List,
  ListPlus,
  Lock,
  Printer,
  RotateCcw,
  Save,
  Share2,
  Shuffle,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent, DragEvent } from 'react'
import './App.css'

const STORAGE_KEY = 'baseball-lineup-v1'
const TEAM_LIST_KEY = 'baseball-team-list-v1'
const TEAM_TOKEN_KEY = 'baseball-team-tokens-v1'
const DEFAULT_TEAM_ID = 'default'
const FIELDING_POSITIONS = ['C', 'P', '1B', '2B', '3B', 'SS', 'RF', 'CF', 'LF', 'Rover'] as const
const POSITIONS = [...FIELDING_POSITIONS, 'Sit'] as const
const MIN_INNINGS = 1
const MAX_INNINGS = 5
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
  gameDayLocked: boolean
  gameDayLogInnings: number
  gameDate: string
  innings: number
  fieldingSpots: number
}

type SyncStatus = 'loading' | 'saving' | 'synced' | 'local' | 'error'

type TeamSummary = {
  id: string
  name: string
  updatedAt?: string
}

type TeamTokenMap = Record<string, string>

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

function getInitialTeamId() {
  const match = window.location.pathname.match(/^\/t\/([^/]+)/)
  return match ? decodeURIComponent(match[1]) : DEFAULT_TEAM_ID
}

function getStoredTeams(): TeamSummary[] {
  const fallback = [{ id: DEFAULT_TEAM_ID, name: 'Arlen' }]
  const saved = localStorage.getItem(TEAM_LIST_KEY)
  if (!saved) return fallback
  try {
    const parsed = JSON.parse(saved) as TeamSummary[]
    const teams = parsed.some((team) => team.id === DEFAULT_TEAM_ID)
      ? parsed
      : [...fallback, ...parsed]
    return teams.filter((team, index, all) => all.findIndex((item) => item.id === team.id) === index)
  } catch {
    return fallback
  }
}

function saveStoredTeams(teams: TeamSummary[]) {
  localStorage.setItem(TEAM_LIST_KEY, JSON.stringify(teams))
}

function getStoredTokens(): TeamTokenMap {
  const saved = localStorage.getItem(TEAM_TOKEN_KEY)
  if (!saved) return {}
  try {
    return JSON.parse(saved) as TeamTokenMap
  } catch {
    return {}
  }
}

function saveStoredTokens(tokens: TeamTokenMap) {
  localStorage.setItem(TEAM_TOKEN_KEY, JSON.stringify(tokens))
}

function getTeamStorageKey(teamId: string) {
  return teamId === DEFAULT_TEAM_ID ? STORAGE_KEY : `${STORAGE_KEY}-${teamId}`
}

function getEditTokenFromUrl() {
  return new URLSearchParams(window.location.search).get('edit')?.trim() || ''
}

function getTeamUrl(teamId: string, editToken?: string) {
  const url = new URL(window.location.href)
  url.pathname = teamId === DEFAULT_TEAM_ID ? '/' : `/t/${encodeURIComponent(teamId)}`
  url.search = ''
  if (editToken) url.searchParams.set('edit', editToken)
  return url.toString()
}

function createInitialState(): AppState {
  return {
    players: defaultPlayers,
    games: [],
    currentLineup: [],
    gameDayLineup: [],
    gameDayLocked: true,
    gameDayLogInnings: 4,
    gameDate: today(),
    innings: 4,
    fieldingSpots: 10,
  }
}

function createEmptyTeamState(): AppState {
  return {
    ...createInitialState(),
    players: [],
  }
}

function loadState(teamId = getInitialTeamId()): AppState {
  const saved = localStorage.getItem(getTeamStorageKey(teamId))
  if (!saved) return createInitialState()
  try {
    return { ...createInitialState(), ...JSON.parse(saved) }
  } catch {
    return createInitialState()
  }
}

function normalizeState(value: Partial<AppState> | null | undefined): AppState {
  return { ...createInitialState(), ...value }
}

function normalizeInnings(value: number) {
  return Math.max(MIN_INNINGS, Math.min(MAX_INNINGS, value))
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

function getFieldingPositions(fieldingSpots: number) {
  const ordered = fieldingSpots < FIELDING_POSITIONS.length
    ? FIELDING_POSITIONS.filter((position) => position !== 'Rover')
    : FIELDING_POSITIONS.slice()
  return ordered.slice(0, Math.min(fieldingSpots, ordered.length))
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
    const positions = rotate(getFieldingPositions(fieldingSpots), inning).slice(0, fielders.length)
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

  const positions = rotate(getFieldingPositions(fieldingSpots), inning).slice(0, next.length - expectedSits)
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

function warningSeverity(warning: string) {
  return warning.includes('same position') ||
    warning.includes('duplicate') ||
    warning.includes('blank') ||
    warning.includes('missing') ||
    warning.includes('fielding count')
    ? 'hard'
    : 'minor'
}

function worstWarningSeverity(warnings: string[]) {
  return warnings.some((warning) => warningSeverity(warning) === 'hard') ? 'hard' : 'minor'
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

function getLineupDeltas(row: LineupRow, lineup: LineupRow[], innings: number) {
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

function exportCsv(games: GameLog[]) {
  const maxInnings = Math.max(MIN_INNINGS, ...games.map((game) => game.innings), 4)
  const header = [
    'Date',
    'Player',
    'Bat Order',
    ...Array.from({ length: maxInnings }, (_, index) => `Inning ${index + 1}`),
    'Sit Count',
    'Notes',
  ]
  const rows = games.flatMap((game) =>
    game.lineup.map((row) => [
      game.date,
      row.playerName,
      String(row.batOrder),
      ...Array.from({ length: maxInnings }, (_, inning) => row.assignments[inning] ?? ''),
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
  const inningIndexes = Array.from({ length: MAX_INNINGS }, (_, index) => headerIndex(headers, [`inning ${index + 1}`, `inn ${index + 1}`]))

  if (dateIndex < 0 || playerIndex < 0 || batIndex < 0 || inningIndexes[0] < 0) {
    throw new Error('CSV needs Date, Player, Bat Order, and at least Inning 1 columns.')
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
    const innings = normalizeInnings(Math.max(
      1,
      ...orderedLineup.flatMap((row) => row.assignments.map((assignment, index) => (assignment ? index + 1 : 0))),
    ))
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

function formatLineupText(lineup: LineupRow[], date: string, innings: number) {
  if (!lineup.length) return ''
  const headers = ['Bat', 'Player', ...Array.from({ length: innings }, (_, index) => `Inning ${index + 1}`)]
  const rows = lineup.map((row) => [
    String(row.batOrder),
    row.playerName,
    ...Array.from({ length: innings }, (_, inning) => row.assignments[inning] || '-'),
  ])
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)))
  const formatRow = (row: string[]) => row.map((cell, index) => cell.padEnd(widths[index])).join('  ')
  return [`Baseball lineup - ${date}`, '', formatRow(headers), formatRow(widths.map((width) => '-'.repeat(width))), ...rows.map(formatRow)].join('\n')
}

function lineupGridStyle(innings: number, showHistoryPanel: boolean): CSSProperties {
  return {
    gridTemplateColumns: showHistoryPanel
      ? `52px 52px 140px repeat(${innings}, 82px) 150px 34px 34px 38px repeat(10, 34px)`
      : `52px 52px 150px repeat(${innings}, 106px) 184px`,
  }
}

function fullHistoryGridStyle(innings: number): CSSProperties {
  return {
    gridTemplateColumns: `112px 56px 52px 140px repeat(${innings}, 82px) 54px 260px`,
  }
}

function getChangedCells(before: LineupRow[], after: LineupRow[], innings: number, mode: 'current' | 'gameday') {
  const beforeByPlayer = new Map(before.map((row) => [row.playerId, row]))
  const changed = new Set<string>()
  after.forEach((row) => {
    const previous = beforeByPlayer.get(row.playerId)
    for (let inning = 0; inning < innings; inning += 1) {
      if ((previous?.assignments[inning] ?? '') !== (row.assignments[inning] ?? '')) {
        changed.add(`${mode}:${row.playerId}:${inning}`)
      }
    }
  })
  return changed
}

function App() {
  const [teamId, setTeamId] = useState(() => getInitialTeamId())
  const [teams, setTeams] = useState<TeamSummary[]>(() => getStoredTeams())
  const [editTokens, setEditTokens] = useState<TeamTokenMap>(() => {
    const tokens = getStoredTokens()
    const tokenFromUrl = getEditTokenFromUrl()
    const initialTeamId = getInitialTeamId()
    if (tokenFromUrl && initialTeamId !== DEFAULT_TEAM_ID) {
      tokens[initialTeamId] = tokenFromUrl
      saveStoredTokens(tokens)
      window.history.replaceState({}, '', getTeamUrl(initialTeamId))
    }
    return tokens
  })
  const [state, setState] = useState<AppState>(() => loadState(teamId))
  const [tab, setTab] = useState<'lineup' | 'gameday' | 'roster' | 'history' | 'fullHistory'>('lineup')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading')
  const [syncMessage, setSyncMessage] = useState('Loading shared history...')
  const [draggedRowIndex, setDraggedRowIndex] = useState<number | null>(null)
  const [dragOverRowIndex, setDragOverRowIndex] = useState<number | null>(null)
  const [changedCells, setChangedCells] = useState<Set<string>>(() => new Set())
  const [undoState, setUndoState] = useState<AppState | null>(null)
  const [historyLocked, setHistoryLocked] = useState(true)
  const [printMode, setPrintMode] = useState<'current' | 'gameday' | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const historyInput = useRef<HTMLInputElement>(null)
  const stateRef = useRef(state)
  const remoteReady = useRef(false)
  const currentTeam = teams.find((team) => team.id === teamId) ?? { id: teamId, name: teamId === DEFAULT_TEAM_ID ? 'Arlen' : 'Shared team' }
  const currentEditToken = editTokens[teamId] ?? ''
  const canEdit = teamId === DEFAULT_TEAM_ID || Boolean(currentEditToken)

  const totals = useMemo(() => getTotals(state.players, state.games), [state.players, state.games])
  const sortedPlayers = useMemo(
    () => state.players.slice().sort((a, b) => {
      if (!a.name.trim()) return 1
      if (!b.name.trim()) return -1
      return a.name.localeCompare(b.name)
    }),
    [state.players],
  )
  const presentCount = state.players.filter((player) => player.present && player.name.trim()).length
  const sitPerInning = Math.max(0, presentCount - state.fieldingSpots)

  const saveSharedState = useCallback(async (next: AppState) => {
    const response = await fetch(`/api/state?team=${encodeURIComponent(teamId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-edit-token': currentEditToken },
      body: JSON.stringify(next),
    })
    if (!response.ok) throw new Error(`Save failed (${response.status})`)
    return response.json() as Promise<{ ok: true; updatedAt: string }>
  }, [teamId, currentEditToken])

  useEffect(() => {
    let cancelled = false

    async function loadSharedState() {
      const localState = loadState(teamId)
      stateRef.current = localState
      setState(localState)
      setUndoState(null)
      remoteReady.current = false
      setSyncStatus('loading')
      setSyncMessage('Loading shared history...')

      try {
        const response = await fetch(`/api/state?team=${encodeURIComponent(teamId)}`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`Shared history unavailable (${response.status})`)

        const payload = await response.json() as { state: AppState | null; updatedAt: string | null }
        if (cancelled) return

        if (payload.state) {
          const next = normalizeState(payload.state)
          stateRef.current = next
          setState(next)
          localStorage.setItem(getTeamStorageKey(teamId), JSON.stringify(next))
          setSyncStatus('synced')
          setSyncMessage(payload.updatedAt ? `Shared history synced ${new Date(payload.updatedAt).toLocaleString()}` : 'Shared history synced')
        } else if (canEdit) {
          remoteReady.current = true
          await saveSharedState(stateRef.current)
          if (cancelled) return
          setSyncStatus('synced')
          setSyncMessage('Shared history initialized')
        } else {
          setSyncStatus('local')
          setSyncMessage('View-only link; ask the coach for the private edit link to save changes')
        }

        remoteReady.current = true
      } catch {
        if (cancelled) return
        remoteReady.current = false
        setSyncStatus('local')
        setSyncMessage('Using this browser only; shared history is not connected yet')
      }
    }

    loadSharedState()
    return () => {
      cancelled = true
    }
  }, [teamId, canEdit, saveSharedState])

  useEffect(() => {
    const ids = teams.map((team) => team.id)
    if (!ids.includes(teamId)) ids.push(teamId)

    fetch(`/api/teams?ids=${encodeURIComponent(ids.join(','))}`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Teams unavailable')
        return response.json() as Promise<{ teams: TeamSummary[] }>
      })
      .then((payload) => {
        const remoteTeams = payload.teams
        const merged = [...teams]
        remoteTeams.forEach((remoteTeam) => {
          const index = merged.findIndex((team) => team.id === remoteTeam.id)
          if (index >= 0) merged[index] = { ...merged[index], ...remoteTeam }
          else merged.push(remoteTeam)
        })
        if (merged.length !== teams.length || merged.some((team, index) => team.name !== teams[index]?.name)) {
          rememberTeams(merged)
        }
      })
      .catch(() => undefined)
  }, [teamId, teams])

  function rememberTeams(nextTeams: TeamSummary[]) {
    const deduped = nextTeams.filter((team, index, all) => all.findIndex((item) => item.id === team.id) === index)
    setTeams(deduped)
    saveStoredTeams(deduped)
  }

  function rememberToken(nextTeamId: string, token: string) {
    const nextTokens = { ...editTokens, [nextTeamId]: token }
    setEditTokens(nextTokens)
    saveStoredTokens(nextTokens)
  }

  function switchTeam(nextTeamId: string) {
    setTeamId(nextTeamId)
    window.history.pushState({}, '', getTeamUrl(nextTeamId))
  }

  async function createTeam() {
    const name = window.prompt('Team name?', 'Julian')
    if (!name?.trim()) return

    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), state: createEmptyTeamState() }),
      })
      if (!response.ok) throw new Error(`Team creation failed (${response.status})`)

      const payload = await response.json() as { team: TeamSummary; editToken: string }
      rememberTeams([...teams, payload.team])
      rememberToken(payload.team.id, payload.editToken)
      setTeamId(payload.team.id)
      window.history.pushState({}, '', getTeamUrl(payload.team.id))
      setSyncStatus('synced')
      setSyncMessage(`${payload.team.name} created`)
    } catch {
      setSyncStatus('error')
      setSyncMessage('Could not create shared team')
    }
  }

  async function renameTeam() {
    if (!canEdit) return
    const name = window.prompt('Team name?', currentTeam.name)
    if (!name?.trim() || name.trim() === currentTeam.name) return

    const nextTeam = { ...currentTeam, name: name.trim() }
    rememberTeams(teams.map((team) => (team.id === teamId ? nextTeam : team)))

    if (teamId === DEFAULT_TEAM_ID) return

    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-edit-token': currentEditToken },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!response.ok) throw new Error(`Rename failed (${response.status})`)
    } catch {
      setSyncStatus('error')
      setSyncMessage('Team renamed locally; shared rename failed')
    }
  }

  async function copyEditLink() {
    if (!canEdit) return
    const link = getTeamUrl(teamId, currentEditToken)
    try {
      await navigator.clipboard.writeText(link)
      setSyncStatus('synced')
      setSyncMessage('Private edit link copied')
    } catch {
      window.prompt('Private edit link', link)
    }
  }

  useEffect(() => {
    if (!printMode) return
    const timer = window.setTimeout(() => {
      window.print()
      setPrintMode(null)
    }, 50)
    return () => window.clearTimeout(timer)
  }, [printMode])

  function commit(next: AppState, options: { undo?: boolean } = {}) {
    if (options.undo) {
      setUndoState(stateRef.current)
    }
    stateRef.current = next
    setState(next)
    localStorage.setItem(getTeamStorageKey(teamId), JSON.stringify(next))
    if (!canEdit) {
      setSyncStatus('local')
      setSyncMessage('View-only link; changes are not saved to shared history')
      return
    }
    if (!remoteReady.current) return

    setSyncStatus('saving')
    setSyncMessage('Saving shared history...')
    saveSharedState(next)
      .then((result) => {
        setSyncStatus('synced')
        setSyncMessage(`Shared history saved ${new Date(result.updatedAt).toLocaleTimeString()}`)
      })
      .catch(() => {
        setSyncStatus('error')
        setSyncMessage('Saved on this browser only; shared save failed')
      })
  }

  function undoLastLineupChange() {
    if (!undoState) return
    const previous = undoState
    setUndoState(null)
    commit(previous)
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
    const next = generateLineup(state.players, state.games, state.innings, state.fieldingSpots)
    setChangedCells(new Set())
    commit({ ...state, currentLineup: next }, { undo: true })
    setTab('lineup')
  }

  function setLineup(nextLineup: LineupRow[], mode: 'current' | 'gameday' = 'current', options: { undo?: boolean } = { undo: true }) {
    const normalized = nextLineup.map((row, index) => ({ ...row, batOrder: index + 1 }))
    commit(mode === 'gameday' ? { ...state, gameDayLineup: normalized } : { ...state, currentLineup: normalized }, options)
  }

  function commitLineupChange(before: LineupRow[], after: LineupRow[], mode: 'current' | 'gameday', nextState: AppState) {
    setChangedCells(getChangedCells(before, after, state.innings, mode))
    commit(nextState, { undo: true })
  }

  function clearChangedCell(key: string) {
    setChangedCells((current) => {
      if (!current.has(key)) return current
      const next = new Set(current)
      next.delete(key)
      return next
    })
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

    commitLineupChange(source, next, mode, mode === 'gameday' ? { ...state, gameDayLineup: next } : { ...state, currentLineup: next })
  }

  function updateHistoryAssignment(gameId: string, playerId: string, inning: number, value: Position) {
    commit({
      ...state,
      games: state.games.map((game) => {
        if (game.id !== gameId) return game
        const nextLineup = game.lineup.map((row) => {
          if (row.playerId !== playerId) return row
          const assignments = Array.from({ length: Math.max(game.innings, inning + 1) }, (_, index) => row.assignments[index] ?? '')
          assignments[inning] = value
          return { ...row, assignments }
        })
        const highestUsedInning = Math.max(
          MIN_INNINGS,
          ...nextLineup.flatMap((row) => row.assignments.map((assignment, index) => (assignment ? index + 1 : 0))),
        )
        return { ...game, innings: normalizeInnings(highestUsedInning), lineup: nextLineup }
      }),
    })
  }

  function reorderRow(fromIndex: number, toIndex: number, mode: 'current' | 'gameday' = 'current') {
    const source = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= source.length || toIndex >= source.length) return
    const next = source.slice()
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    setLineup(next, mode)
  }

  function startRowDrag(event: DragEvent<HTMLButtonElement>, rowIndex: number) {
    setDraggedRowIndex(rowIndex)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(rowIndex))
  }

  function dropRow(event: DragEvent<HTMLDivElement>, rowIndex: number, mode: 'current' | 'gameday' = 'current') {
    event.preventDefault()
    const fromIndex = draggedRowIndex ?? Number(event.dataTransfer.getData('text/plain'))
    setDraggedRowIndex(null)
    setDragOverRowIndex(null)
    reorderRow(fromIndex, rowIndex, mode)
  }

  function removeLineupPlayer(playerId: string, mode: 'current' | 'gameday' = 'current') {
    const source = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    const withoutPlayer = source
      .filter((row) => row.playerId !== playerId)
      .map((row, index) => ({ ...row, batOrder: index + 1 }))
    const rebalanced = Array.from({ length: state.innings }, (_, inning) => inning).reduce(
      (lineup, inning) => fixLineupInning(lineup, state.players, state.games, state.innings, state.fieldingSpots, inning),
      withoutPlayer,
    )
    const nextState = {
      ...state,
      players: state.players.map((player) => (player.id === playerId ? { ...player, present: false } : player)),
      ...(mode === 'gameday' ? { gameDayLineup: rebalanced } : { currentLineup: rebalanced }),
    }
    commitLineupChange(source, rebalanced, mode, nextState)
  }

  function addLineupPlayer(playerId: string, mode: 'current' | 'gameday' = 'current') {
    const source = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    const player = state.players.find((item) => item.id === playerId)
    if (!player || source.some((row) => row.playerId === playerId)) return

    const withPlayer = [
      ...source,
      {
        playerId,
        playerName: player.name,
        batOrder: source.length + 1,
        assignments: Array.from({ length: state.innings }, () => '' as Position),
      },
    ]
    const rebalanced = Array.from({ length: state.innings }, (_, inning) => inning).reduce(
      (lineup, inning) => fixLineupInning(lineup, state.players, state.games, state.innings, state.fieldingSpots, inning),
      withPlayer,
    )
    const nextState = {
      ...state,
      players: state.players.map((item) => (item.id === playerId ? { ...item, present: true } : item)),
      ...(mode === 'gameday' ? { gameDayLineup: rebalanced } : { currentLineup: rebalanced }),
    }
    commitLineupChange(source, rebalanced, mode, nextState)
  }

  function fixInning(inning: number, mode: 'current' | 'gameday' = 'current') {
    const source = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    const fixed = fixLineupInning(source, state.players, state.games, state.innings, state.fieldingSpots, inning)
    commitLineupChange(source, fixed, mode, mode === 'gameday' ? { ...state, gameDayLineup: fixed } : { ...state, currentLineup: fixed })
  }

  function fixPlayerRepeats(mode: 'current' | 'gameday' = 'current') {
    const source = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    const next = Array.from({ length: state.innings }, (_, inning) => inning).reduce(
      (lineup, inning) => fixLineupInning(lineup, state.players, state.games, state.innings, state.fieldingSpots, inning),
      source,
    )
    commitLineupChange(source, next, mode, mode === 'gameday' ? { ...state, gameDayLineup: next } : { ...state, currentLineup: next })
  }

  function logGame(mode: 'current' | 'gameday' = 'current') {
    const lineup = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    if (!lineup.length) return
    const loggedInnings = mode === 'gameday' ? Math.min(state.gameDayLogInnings, state.innings) : state.innings
    const game: GameLog = {
      id: makeId(),
      date: state.gameDate,
      innings: loggedInnings,
      fieldingSpots: state.fieldingSpots,
      lineup: lineup.map((row) => ({ ...row, assignments: row.assignments.slice(0, loggedInnings) })),
    }
    commit({
      ...state,
      games: [...state.games, game],
      currentLineup: mode === 'current' ? [] : state.currentLineup,
      gameDayLineup: mode === 'gameday' ? [] : state.gameDayLineup,
      gameDate: today(),
    })
    setTab('history')
  }

  function clearHistory() {
    if (!state.games.length) return
    const confirmed = window.confirm('Clear all logged game history for everyone? This keeps the roster, but removes all past games from the shared history.')
    if (!confirmed) return
    commit({
      ...state,
      games: [],
    })
  }

  function saveToGameDay() {
    commit({
      ...state,
      gameDayLineup: state.currentLineup.map((row) => ({ ...row, assignments: row.assignments.slice() })),
      gameDayLocked: true,
      gameDayLogInnings: state.innings,
    }, { undo: true })
    setTab('gameday')
  }

  function setGameDayLocked(locked: boolean) {
    commit({ ...state, gameDayLocked: locked })
  }

  function setGameDayLogInnings(innings: number) {
    commit({ ...state, gameDayLogInnings: Math.max(MIN_INNINGS, Math.min(state.innings, innings)) })
  }

  function scratchGameDayPlayer(playerId: string) {
    removeLineupPlayer(playerId, 'gameday')
  }

  async function shareLineup(mode: 'current' | 'gameday' = 'current') {
    const lineup = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    if (!lineup.length) return
    const text = formatLineupText(lineup, state.gameDate, state.innings)
    const title = `Baseball lineup - ${state.gameDate}`
    try {
      if (navigator.share) {
        await navigator.share({ title, text })
      } else {
        await navigator.clipboard.writeText(text)
        window.alert('Lineup copied to clipboard.')
      }
    } catch {
      // Cancelled shares are fine; keep the app quiet.
    }
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
    const locked = isGameDay && state.gameDayLocked
    const lineupPlayerIds = new Set(lineup.map((row) => row.playerId))
    const absentPlayers = state.players
      .filter((player) => player.name.trim() && !player.present && !lineupPlayerIds.has(player.id))
      .sort((a, b) => a.name.localeCompare(b.name))
    const inningWarnings = getInningWarnings(lineup, state.innings, state.fieldingSpots)
    const inningFixes = getInningFixes(lineup, state.innings, state.fieldingSpots)
    const hasPlayerRepeats = hasRepeatedPositions(lineup, state.innings)
    const CountCell = ({ value, delta = 0 }: { value: number; delta?: number }) => (
      <span className={delta > 0 ? 'projected-count' : ''}>{value + delta}</span>
    )
    return (
      <section className="workspace">
        {!isGameDay && lineup.length > 0 && (
          <div className="candidate-strip">
            <button type="button" onClick={generateCandidates}>
              <RotateCcw size={16} /> More
            </button>
            <button type="button" onClick={undoLastLineupChange} disabled={!undoState}>
              <Undo2 size={16} /> Undo
            </button>
            <button type="button" onClick={() => setPrintMode('current')}>
              <Printer size={16} /> Print
            </button>
            <button type="button" onClick={() => shareLineup('current')}>
              <Share2 size={16} /> Share
            </button>
          </div>
        )}

        {isGameDay && lineup.length > 0 && (
          <div className="candidate-strip">
            <button type="button" onClick={() => setGameDayLocked(!state.gameDayLocked)}>
              {locked ? <Lock size={16} /> : <Unlock size={16} />}
              {locked ? 'Locked' : 'Editing'}
            </button>
            <label className="compact-field">
              Log innings
              <select value={Math.min(state.gameDayLogInnings, state.innings)} onChange={(event) => setGameDayLogInnings(Number(event.target.value))}>
                {Array.from({ length: state.innings }, (_, index) => index + 1).map((inning) => (
                  <option key={inning} value={inning}>{inning}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={undoLastLineupChange} disabled={!undoState || locked}>
              <Undo2 size={16} /> Undo
            </button>
            <button type="button" onClick={() => setPrintMode('gameday')}>
              <Printer size={16} /> Print
            </button>
            <button type="button" onClick={() => shareLineup('gameday')}>
              <Share2 size={16} /> Share
            </button>
          </div>
        )}

        {lineup.length === 0 ? (
          <div className="empty-state">
            <Shuffle size={32} />
            <h2>{isGameDay ? 'No Gameday lineup saved yet.' : 'Generate a lineup to start.'}</h2>
          </div>
        ) : (
          <>
            {(inningWarnings.length > 0 || hasPlayerRepeats) && !locked && (
              <div className="inning-warnings">
                {inningWarnings.map((warning) => (
                  <span className={`warning-${warningSeverity(warning)}`} key={warning}>{warning}</span>
                ))}
                {hasPlayerRepeats && <span className="warning-hard">One or more players repeat the same position</span>}
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
            <div className="lineup-table">
                <div className="lineup-row heading" style={lineupGridStyle(state.innings, showHistoryPanel)}>
                  <span>Drag</span>
                  <span>Bat</span>
                  <span>Player</span>
                  {Array.from({ length: state.innings }, (_, index) => (
                    <span key={index}>Inning {index + 1}</span>
                  ))}
                  <span>Warn</span>
                  {showHistoryPanel && (
                    <>
                      <span>Sit</span>
                      <span>1st</span>
                      <span>Last</span>
                      {FIELDING_POSITIONS.map((position) => (
                        <span key={position}>{position}</span>
                      ))}
                    </>
                  )}
                </div>
                {lineup.map((row, rowIndex) => {
                  const warnings = getWarnings(row, state.innings)
                  const player = state.players.find((item) => item.id === row.playerId)
                  const summary = player ? summarizePlayer(player, state.games) : undefined
                  const deltas = getLineupDeltas(row, lineup, state.innings)
                  return (
                      <div
                      className={`lineup-row ${draggedRowIndex === rowIndex ? 'dragging' : ''} ${dragOverRowIndex === rowIndex && draggedRowIndex !== rowIndex ? 'drop-target' : ''}`}
                      style={lineupGridStyle(state.innings, showHistoryPanel)}
                      key={row.playerId}
                      onDragOver={(event) => {
                        if (!locked) {
                          event.preventDefault()
                          setDragOverRowIndex(rowIndex)
                        }
                      }}
                      onDrop={(event) => {
                        if (!locked) dropRow(event, rowIndex, mode)
                      }}
                      onDragLeave={() => {
                        if (dragOverRowIndex === rowIndex) setDragOverRowIndex(null)
                      }}
                    >
                      <span className="drag-cell">
                        <button
                          type="button"
                          className="drag-handle"
                          draggable={!locked}
                          disabled={locked}
                          onDragStart={(event) => startRowDrag(event, rowIndex)}
                          onDragEnd={() => setDraggedRowIndex(null)}
                          title="Drag to reorder"
                        >
                          <GripVertical size={16} />
                        </button>
                      </span>
                      <strong>{row.batOrder}</strong>
                      <span className="player-cell">
                        {!locked && (
                          <label className="play-toggle" title="Uncheck if this player is absent">
                            <input
                              type="checkbox"
                              checked={player?.present ?? true}
                              onChange={(event) => {
                                if (!event.target.checked) {
                                  if (isGameDay) scratchGameDayPlayer(row.playerId)
                                  else removeLineupPlayer(row.playerId)
                                }
                              }}
                            />
                          </label>
                        )}
                        {row.playerName}
                      </span>
                      {Array.from({ length: state.innings }, (_, inning) => {
                        const cellKey = `${mode}:${row.playerId}:${inning}`
                        return (
                          <select
                            key={inning}
                            className={changedCells.has(cellKey) ? 'changed-cell' : ''}
                            value={row.assignments[inning] ?? ''}
                            disabled={locked}
                            onMouseEnter={() => clearChangedCell(cellKey)}
                            onFocus={() => clearChangedCell(cellKey)}
                            onChange={(event) => updateAssignment(rowIndex, inning, event.target.value as Position, mode)}
                          >
                            <option value=""></option>
                            {POSITIONS.map((position) => (
                              <option key={position} value={position}>
                                {position}
                              </option>
                            ))}
                          </select>
                        )
                      })}
                      {warnings.length ? (
                        <button className={`warning warning-${worstWarningSeverity(warnings)} warning-fix`} type="button" disabled={locked} title="Fix this player's warnings" onClick={() => fixPlayerRepeats(mode)}>
                          {warnings.join('; ')}
                        </button>
                      ) : (
                        <span className="quiet" title="ok">ok</span>
                      )}
                      {showHistoryPanel && (
                        <>
                          <CountCell value={summary?.sits ?? 0} delta={deltas.sits} />
                          <CountCell value={summary?.first ?? 0} delta={deltas.first} />
                          <CountCell value={summary?.last ?? 0} delta={deltas.last} />
                          {FIELDING_POSITIONS.map((position) => (
                            <CountCell key={position} value={summary?.positions[position] ?? 0} delta={deltas.positions[position]} />
                          ))}
                        </>
                      )}
                    </div>
                  )
                })}
                {absentPlayers.length > 0 && (
                  <div className="lineup-section-label">Not present</div>
                )}
                {absentPlayers.map((player) => {
                  const summary = summarizePlayer(player, state.games)
                  return (
                    <div className="lineup-row absent-row" style={lineupGridStyle(state.innings, showHistoryPanel)} key={`absent-${player.id}`}>
                      <span></span>
                      <strong>Out</strong>
                      <span className="player-cell">
                        {!locked && (
                          <label className="play-toggle" title="Check if this player arrived">
                            <input type="checkbox" checked={false} onChange={(event) => {
                              if (event.target.checked) addLineupPlayer(player.id, mode)
                            }} />
                          </label>
                        )}
                        {player.name}
                      </span>
                      {Array.from({ length: state.innings }, (_, inning) => (
                        <span className="quiet" key={inning}>-</span>
                      ))}
                      <span className="quiet">absent</span>
                      {showHistoryPanel && (
                        <>
                          <span>{summary.sits}</span>
                          <span>{summary.first}</span>
                          <span>{summary.last}</span>
                          {FIELDING_POSITIONS.map((position) => (
                            <span key={position}>{summary.positions[position]}</span>
                          ))}
                        </>
                      )}
                    </div>
                  )
                })}
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
                <button type="button" onClick={() => setPrintMode(mode)}>
                  <Printer size={18} /> Print
                </button>
                <button type="button" onClick={() => shareLineup(mode)}>
                  <Share2 size={18} /> Share
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

  function renderPrintCard() {
    if (!printMode) return null
    const lineup = printMode === 'gameday' ? state.gameDayLineup : state.currentLineup
    if (!lineup.length) return null
    return (
      <section className="print-card" aria-hidden="true">
        <header>
          <h1>Baseball lineup</h1>
          <p>{state.gameDate} · {state.innings} innings · {state.fieldingSpots} fielders</p>
        </header>
        <table>
          <thead>
            <tr>
              <th>Bat</th>
              <th>Player</th>
              {Array.from({ length: state.innings }, (_, inning) => (
                <th key={inning}>Inning {inning + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineup.map((row) => (
              <tr key={row.playerId}>
                <td>{row.batOrder}</td>
                <td>{row.playerName}</td>
                {Array.from({ length: state.innings }, (_, inning) => (
                  <td key={inning}>{row.assignments[inning] || ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    )
  }

  return (
    <main>
      {renderPrintCard()}
      <header className="app-header">
        <div>
          <p className="eyebrow">Baseball lineup planner</p>
          <h1>Lineups, rotations, and history</h1>
        </div>
        <div className="header-actions">
          <label className="team-picker">
            Team
            <select value={teamId} onChange={(event) => switchTeam(event.target.value)}>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={createTeam} title="Create team">
            <ListPlus size={18} />
          </button>
          <button type="button" onClick={renameTeam} disabled={!canEdit} title="Rename team">
            <Edit3 size={18} />
          </button>
          <button type="button" onClick={copyEditLink} disabled={!canEdit} title="Copy private edit link">
            <Copy size={18} />
          </button>
          <span className={`sync-status ${syncStatus}`} title={syncMessage}>
            {syncMessage}
          </span>
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
          <select value={state.innings} onChange={(event) => {
            const innings = normalizeInnings(Number(event.target.value))
            commit({ ...state, innings, gameDayLogInnings: Math.min(state.gameDayLogInnings, innings), currentLineup: [] })
          }}>
            {Array.from({ length: MAX_INNINGS }, (_, index) => index + 1).map((inning) => (
              <option key={inning} value={inning}>{inning}</option>
            ))}
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
          <ClipboardList size={18} /> Draft Lineup
        </button>
        <button type="button" className={tab === 'gameday' ? 'active' : ''} onClick={() => setTab('gameday')}>
          <Save size={18} /> Gameday
        </button>
        <button type="button" className={tab === 'roster' ? 'active' : ''} onClick={() => setTab('roster')}>
          <Users size={18} /> Roster
        </button>
        <button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          <History size={18} /> Summary
        </button>
        <button type="button" className={tab === 'fullHistory' ? 'active' : ''} onClick={() => setTab('fullHistory')}>
          <List size={18} /> History
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
            {sortedPlayers.map((player) => {
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
            <h2>Summary</h2>
            <div className="history-actions">
              <button type="button" onClick={() => historyInput.current?.click()}>
                <Upload size={18} /> Import CSV
              </button>
              <button type="button" onClick={() => downloadFile(`baseball-history-${today()}.csv`, exportCsv(state.games), 'text/csv')}>
                <Download size={18} /> CSV
              </button>
              <button className="danger" type="button" onClick={clearHistory} disabled={state.games.length === 0}>
                <Trash2 size={18} /> Clear History
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
            {sortedPlayers.map((player) => {
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

      {tab === 'fullHistory' && (
        <section className="workspace">
          <div className="section-title">
            <h2>History</h2>
            <div className="history-actions">
              <button type="button" onClick={() => setHistoryLocked(!historyLocked)}>
                {historyLocked ? <Lock size={16} /> : <Unlock size={16} />}
                {historyLocked ? 'Locked' : 'Editing'}
              </button>
              <button type="button" onClick={() => downloadFile(`baseball-history-${today()}.csv`, exportCsv(state.games), 'text/csv')} disabled={state.games.length === 0}>
                <Download size={18} /> CSV
              </button>
              <button className="danger" type="button" onClick={clearHistory} disabled={state.games.length === 0}>
                <Trash2 size={18} /> Clear History
              </button>
            </div>
          </div>
          {state.games.length === 0 ? (
            <div className="empty-state">
              <History size={32} />
              <h2>No games logged yet.</h2>
            </div>
          ) : (
            <div className="full-history-table">
              {(() => {
                const maxHistoryInnings = Math.max(MIN_INNINGS, state.innings, ...state.games.map((game) => game.innings))
                return (
              <>
              <div className="full-history-row heading" style={fullHistoryGridStyle(maxHistoryInnings)}>
                <span>Date</span>
                <span>Game</span>
                <span>Bat</span>
                <span>Player</span>
                {Array.from({ length: maxHistoryInnings }, (_, inning) => (
                  <span key={inning}>Inning {inning + 1}</span>
                ))}
                <span>Sits</span>
                <span>Warnings</span>
              </div>
              {state.games.map((game, gameIndex) =>
                game.lineup.map((row) => {
                  const warnings = getWarnings(row, game.innings)
                  return (
                    <div className="full-history-row" style={fullHistoryGridStyle(maxHistoryInnings)} key={`${game.id}-${row.playerId}`}>
                      <span>{game.date}</span>
                      <span>{gameIndex + 1}</span>
                      <strong>{row.batOrder}</strong>
                      <span>{row.playerName}</span>
                      {Array.from({ length: maxHistoryInnings }, (_, inning) => (
                        <select
                          className="history-position-select"
                          disabled={historyLocked}
                          key={inning}
                          value={row.assignments[inning] ?? ''}
                          onChange={(event) => updateHistoryAssignment(game.id, row.playerId, inning, event.target.value as Position)}
                        >
                          <option value=""></option>
                          {POSITIONS.map((position) => (
                            <option key={position} value={position}>{position}</option>
                          ))}
                        </select>
                      ))}
                      <span>{row.assignments.filter((value) => value === 'Sit').length}</span>
                      <span className={warnings.length ? `warning warning-${worstWarningSeverity(warnings)}` : 'quiet'} title={warnings.join('; ') || 'ok'}>{warnings.join('; ') || 'ok'}</span>
                    </div>
                  )
                }),
              )}
              </>
                )
              })()}
            </div>
          )}
        </section>
      )}
    </main>
  )
}

export default App
