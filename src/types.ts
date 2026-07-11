export const FIELDING_POSITIONS = ['C', 'P', '1B', '2B', '3B', 'SS', 'RF', 'CF', 'LF', 'Rover'] as const
export const POSITIONS = [...FIELDING_POSITIONS, 'Sit'] as const
export const MIN_INNINGS = 1
export const MAX_INNINGS = 5
export const INFIELD = new Set(['C', 'P', '1B', '2B', '3B', 'SS'])
export const OUTFIELD = new Set(['RF', 'CF', 'LF', 'Rover'])

export type FieldingPosition = (typeof FIELDING_POSITIONS)[number]
export type Position = (typeof POSITIONS)[number] | ''

export type Player = {
  id: string
  name: string
  present: boolean
  notes: string
  preferredPositions: FieldingPosition[]
  dislikedPositions: FieldingPosition[]
}

export type LineupRow = {
  playerId: string
  playerName: string
  batOrder: number
  assignments: Position[]
}

export type GameLog = {
  id: string
  date: string
  innings: number
  fieldingSpots: number
  lineup: LineupRow[]
}

export type LineupDraft = {
  id: string
  name: string
  createdAt: string
  fieldingSpots: number
  innings: number
  lineup: LineupRow[]
}

export type AppState = {
  players: Player[]
  games: GameLog[]
  currentLineup: LineupRow[]
  gameDayLineup: LineupRow[]
  gameDayLocked: boolean
  gameDayLogInnings: number
  lineupDrafts: LineupDraft[]
  gameDate: string
  innings: number
  fieldingSpots: number
}

export type SyncStatus = 'loading' | 'saving' | 'synced' | 'local' | 'queued' | 'conflict' | 'error'

export type TeamSummary = {
  id: string
  logoDataUrl?: string
  name: string
  updatedAt?: string
}

export type TeamTokenMap = Record<string, string>

export type PlayerTotals = {
  sits: number
  first: number
  last: number
  batSlots: Record<number, number>
  positions: Record<FieldingPosition, number>
}

export type GameCounts = {
  sits: number
  infield: number
  outfield: number
  positions: Record<FieldingPosition, number>
}

export type ToastState = {
  actionLabel?: string
  id: number
  message: string
  onAction?: () => void
}

export type PastGameRow = {
  playerId: string
  played: boolean
  batOrder: number
  assignments: Position[]
  sitInnings: string
}

export type LineupMode = 'current' | 'gameday'

export type PendingChange = {
  id: string
  mode: LineupMode
  playerId: string
  playerName: string
  inning: number
  oldValue: Position
  newValue: Position
  reason: string
}
