import { MAX_INNINGS, MIN_INNINGS, POSITIONS } from '../types'
import type { GameLog, LineupRow, Player, Position } from '../types'
import { getWarnings } from '../engine/totals'
import { isFieldingPosition } from '../engine/lineup'
import { isPlaceholderPlayer, makeId, normalizeInnings } from './storage'

export const HISTORY_IMPORT_SAMPLE = `Date,Player,Bat,1,2,3,4
2026-06-01,Arlen,1,P,1B,Sit,CF
2026-06-01,Sam,2,SS,2B,P,Sit
2026-06-08,Arlen,3,1B,P,SS,Sit
2026-06-08,Sam,1,2B,Sit,CF,P`

export function exportCsv(games: GameLog[]) {
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

export function parseCsv(text: string) {
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

export function headerIndex(headers: string[], names: string[]) {
  const normalized = headers.map((header) => header.trim().toLowerCase())
  return names.map((name) => normalized.indexOf(name.toLowerCase())).find((index) => index !== -1) ?? -1
}

export function tableRowsToCsv(rows: string[][]) {
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n')
}

export function normalizeHistoryImportText(text: string) {
  const trimmed = text.trim()
  const firstLine = trimmed.split(/\r?\n/).find((line) => line.trim()) ?? ''
  if (!firstLine.includes('\t')) return text
  return tableRowsToCsv(trimmed.split(/\r?\n/).map((line) => line.split('\t')))
}

export function normalizePosition(value: string): Position {
  const trimmed = value.trim()
  const match = POSITIONS.find((position) => position.toLowerCase() === trimmed.toLowerCase())
  return match ?? ''
}

export function buildGamesFromCsv(text: string, players: Player[]) {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('No CSV rows found.')

  const headers = rows[0]
  const dateIndex = headerIndex(headers, ['date', 'game date'])
  const playerIndex = headerIndex(headers, ['player', 'name'])
  const batIndex = headerIndex(headers, ['bat order', 'batting order', 'order', 'bat #', 'bat'])
  const inningIndexes = Array.from({ length: MAX_INNINGS }, (_, index) => headerIndex(headers, [
    `inning ${index + 1}`,
    `inn ${index + 1}`,
    `${index + 1}`,
    `i${index + 1}`,
  ]))

  if (dateIndex < 0 || playerIndex < 0 || batIndex < 0 || inningIndexes[0] < 0) {
    throw new Error('CSV needs Date, Player, Bat Order, and at least Inning 1 columns.')
  }

  const nextPlayers = players.filter((player) => !isPlaceholderPlayer(player))
  const playerMap = new Map(nextPlayers.map((player) => [player.name.trim().toLowerCase(), player]))
  const grouped = new Map<string, LineupRow[]>()
  const rowErrors: string[] = []

  rows.slice(1).forEach((csvRow, index) => {
    const rowNumber = index + 2
    const date = csvRow[dateIndex]?.trim()
    const playerName = csvRow[playerIndex]?.trim()
    if (!date || !playerName) {
      rowErrors.push(`row ${rowNumber}: missing ${!date ? 'date' : 'player'}`)
      return
    }

    let player = playerMap.get(playerName.toLowerCase())
    if (!player) {
      player = { id: makeId(), name: playerName, present: true, notes: '', preferredPositions: [] }
      playerMap.set(playerName.toLowerCase(), player)
      nextPlayers.push(player)
    }

    const assignments = inningIndexes.map((inningIndex) => (inningIndex >= 0 ? normalizePosition(csvRow[inningIndex] ?? '') : ''))
    inningIndexes.forEach((inningIndex, inning) => {
      const raw = inningIndex >= 0 ? (csvRow[inningIndex] ?? '').trim() : ''
      if (raw && !assignments[inning]) {
        rowErrors.push(`row ${rowNumber}: inning ${inning + 1} has unknown position "${raw}"`)
      }
    })
    const batOrder = Number(csvRow[batIndex])
    if (csvRow[batIndex]?.trim() && (!Number.isFinite(batOrder) || batOrder < 1)) {
      rowErrors.push(`row ${rowNumber}: bat order must be a positive number`)
    }
    const row: LineupRow = {
      playerId: player.id,
      playerName: player.name,
      batOrder: batOrder || (grouped.get(date)?.length ?? 0) + 1,
      assignments,
    }

    grouped.set(date, [...(grouped.get(date) ?? []), row])
  })

  if (rowErrors.length) {
    throw new Error(`CSV import needs fixes: ${rowErrors.slice(0, 5).join('; ')}${rowErrors.length > 5 ? `; ${rowErrors.length - 5} more` : ''}.`)
  }

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



export function parseSitInnings(value: string, innings: number) {
  return new Set(value
    .split(/[,\s]+/)
    .map((part) => Number(part.trim()))
    .filter((inning) => Number.isInteger(inning) && inning >= 1 && inning <= innings)
    .map((inning) => inning - 1))
}
