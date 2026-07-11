import { MAX_INNINGS, MIN_INNINGS } from '../types'
import type { AppState, LineupRow, PastGameRow, Player, Position, SyncStatus, TeamSummary, TeamTokenMap } from '../types'
import { createBlankLineup, isFieldingPosition } from '../engine/lineup'

const STORAGE_KEY = 'baseball-lineup-v1'
const TEAM_LIST_KEY = 'baseball-team-list-v1'
const TEAM_TOKEN_KEY = 'baseball-team-tokens-v1'
const ADMIN_TOKEN_KEY = 'baseball-admin-token-v1'
const LAST_EDIT_TEAM_KEY = 'baseball-last-edit-team-v1'
export const HOME_TEAM_ID = ''
export const DEFAULT_TEAM_ID = 'default'
const defaultPlayers: Player[] = []

export function makeId(fallback = `id-${Date.now()}-${Math.random().toString(16).slice(2)}`) {
  return globalThis.crypto?.randomUUID?.() ?? fallback
}

export function today() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'team'
}

export function getInitialTeamId() {
  const match = window.location.pathname.match(/^\/t\/([^/]+)/)
  if (match) return decodeURIComponent(match[1])

  const lastTeamId = getStoredLastEditTeamId()
  const storedTokens = getStoredTokens()
  return lastTeamId && storedTokens[lastTeamId] ? lastTeamId : HOME_TEAM_ID
}

export function getStoredTeams(): TeamSummary[] {
  const saved = localStorage.getItem(TEAM_LIST_KEY)
  if (!saved) return []
  try {
    const parsed = JSON.parse(saved) as TeamSummary[]
    return parsed
      .filter((team) => team.id !== DEFAULT_TEAM_ID)
      .filter((team, index, all) => all.findIndex((item) => item.id === team.id) === index)
  } catch {
    return []
  }
}

export function saveStoredTeams(teams: TeamSummary[]) {
  localStorage.setItem(TEAM_LIST_KEY, JSON.stringify(teams))
}

export function getStoredTokens(): TeamTokenMap {
  const saved = localStorage.getItem(TEAM_TOKEN_KEY)
  if (!saved) return {}
  try {
    return JSON.parse(saved) as TeamTokenMap
  } catch {
    return {}
  }
}

export function saveStoredTokens(tokens: TeamTokenMap) {
  localStorage.setItem(TEAM_TOKEN_KEY, JSON.stringify(tokens))
}

export function getStoredLastEditTeamId() {
  return localStorage.getItem(LAST_EDIT_TEAM_KEY) ?? ''
}

export function saveStoredLastEditTeamId(teamId: string) {
  localStorage.setItem(LAST_EDIT_TEAM_KEY, teamId)
}

export function getStoredAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) ?? ''
}

export function getAdminTokenFromUrl() {
  return new URLSearchParams(window.location.search).get('admin')?.trim() || ''
}

export function saveStoredAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token)
}

export function removeUrlParam(param: string) {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(param)) return
  url.searchParams.delete(param)
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

export function getTeamStorageKey(teamId: string) {
  if (teamId === HOME_TEAM_ID) return `${STORAGE_KEY}-home`
  return teamId === DEFAULT_TEAM_ID ? STORAGE_KEY : `${STORAGE_KEY}-${teamId}`
}

export function getEditTokenFromUrl() {
  return new URLSearchParams(window.location.search).get('edit')?.trim() || ''
}

export function getTeamUrl(teamId: string, editToken?: string, teamName?: string) {
  const url = new URL(window.location.href)
  if (teamId === HOME_TEAM_ID) {
    url.pathname = '/'
    url.search = ''
    return url.toString()
  }
  const teamSlug = teamName?.trim() ? `/${slugify(teamName)}` : ''
  url.pathname = `/t/${encodeURIComponent(teamId)}${teamSlug}`
  url.search = ''
  if (editToken) url.searchParams.set('edit', editToken)
  return url.toString()
}

export function createInitialState(): AppState {
  const innings = 4
  return {
    players: defaultPlayers,
    games: [],
    currentLineup: createBlankLineup(defaultPlayers, innings),
    gameDayLineup: [],
    gameDayLocked: false,
    gameDayLogInnings: innings,
    lineupDrafts: [],
    gameDate: today(),
    innings,
    fieldingSpots: 10,
  }
}

export function createEmptyTeamState(): AppState {
  return createInitialState()
}

export function loadState(teamId = getInitialTeamId()): AppState {
  const saved = localStorage.getItem(getTeamStorageKey(teamId))
  if (!saved) return createInitialState()
  try {
    return normalizeState(JSON.parse(saved))
  } catch {
    return createInitialState()
  }
}

export function normalizePlayer(player: Partial<Player>): Player {
  return {
    id: player.id ?? makeId(),
    name: player.name ?? '',
    present: player.present ?? true,
    notes: player.notes ?? '',
    preferredPositions: (player.preferredPositions ?? []).filter(isFieldingPosition).slice(0, 3),
    dislikedPositions: (player.dislikedPositions ?? []).filter(isFieldingPosition).slice(0, 3),
  }
}

export function normalizeState(value: Partial<AppState> | null | undefined): AppState {
  const initial = createInitialState()
  const players = (value?.players ?? initial.players).map(normalizePlayer)
  const innings = normalizeInnings(value?.innings ?? initial.innings)
  const currentLineup = value?.currentLineup?.length
    ? value.currentLineup
    : value?.gameDayLineup?.length
      ? value.gameDayLineup
      : createBlankLineup(players, innings)
  return {
    ...initial,
    ...value,
    innings,
    players,
    gameDate: today(),
    currentLineup,
    gameDayLocked: value?.gameDayLocked ?? false,
    lineupDrafts: (value?.lineupDrafts ?? []).map((draft, index) => ({
      id: draft.id ?? makeId(),
      name: draft.name?.trim() || `Draft ${index + 1}`,
      createdAt: draft.createdAt ?? new Date().toISOString(),
      fieldingSpots: draft.fieldingSpots ?? value?.fieldingSpots ?? initial.fieldingSpots,
      innings: normalizeInnings(draft.innings ?? innings),
      lineup: draft.lineup ?? [],
    })),
  }
}

export function normalizeInnings(value: number) {
  return Math.max(MIN_INNINGS, Math.min(MAX_INNINGS, value))
}

export function isPlaceholderPlayer(player: Player) {
  return /^Player \d+$/.test(player.name.trim())
}

export function isPlaceholderLineup(lineup: LineupRow[]) {
  return lineup.every((row) => /^Player \d+$/.test(row.playerName.trim()))
}

export function getDuplicatePlayerIds(players: Player[]) {
  const names = new Map<string, string[]>()
  players.forEach((player) => {
    const name = player.name.trim().toLowerCase()
    if (!name || isPlaceholderPlayer(player)) return
    names.set(name, [...(names.get(name) ?? []), player.id])
  })
  return new Set(Array.from(names.values()).filter((ids) => ids.length > 1).flat())
}

export function getSyncLabel(status: SyncStatus) {
  if (status === 'loading') return 'Loading'
  if (status === 'saving') return 'Saving'
  if (status === 'synced') return 'Saved'
  if (status === 'local') return 'Local only'
  if (status === 'queued') return 'Queued'
  if (status === 'conflict') return 'Conflict'
  return 'Save issue'
}

export function createPastGameRows(players: Player[], innings: number): PastGameRow[] {
  return players
    .filter((player) => player.name.trim() && !isPlaceholderPlayer(player))
    .map((player, index) => ({
      playerId: player.id,
      played: player.present,
      batOrder: index + 1,
      assignments: Array.from({ length: innings }, () => '' as Position),
      sitInnings: '',
    }))
}

export function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function formatLineupText(lineup: LineupRow[], date: string, innings: number) {
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
