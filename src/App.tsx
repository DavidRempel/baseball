import {
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardList,
  Copy,
  Download,
  Edit3,
  Eraser,
  Eye,
  GripVertical,
  History,
  List,
  ListPlus,
  Lock,
  Printer,
  Save,
  Share2,
  Shuffle,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent, DragEvent } from 'react'
import './App.css'
import './styles/reorder.css'
import { PrintCard } from './components/PrintCard'
import { RosterTab } from './components/RosterTab'
import { SummaryTab } from './components/SummaryTab'
import { TeamHome } from './components/TeamHome'
import { useFlipListAnimation } from './hooks/useFlipListAnimation'
import { useSharedTeamState } from './hooks/useSharedTeamState'
import { useToast } from './hooks/useToast'
import { HISTORY_IMPORT_SAMPLE, buildGamesFromCsv, exportCsv, normalizeHistoryImportText, parseSitInnings } from './io/csv'
import { createBlankLineup, fixLineupInning, fixLineupInningWithForcedSits, generateLineup, isFieldingPosition } from './engine/lineup'
import { explainAssignment, getInningFixes, getInningWarnings, getLineupDeltas, getTotals, getWarnings, hasRepeatedPositions, isBlankLineup, summarizePlayer, warningSeverity, worstWarningSeverity } from './engine/totals'
import { getRosterLineupDiff, syncLineupToRoster } from './engine/sync'
import { getChangedCells, getLineupChangeKey, getPendingLineupChanges, lineupWithChanges } from './engine/changes'
import { DEFAULT_TEAM_ID, createEmptyTeamState, createInitialState, createPastGameRows, downloadFile, formatLineupText, getAdminTokenFromUrl, getEditTokenFromUrl, getInitialTeamId, getStoredAdminToken, getStoredTeams, getStoredTokens, getTeamUrl, getDuplicatePlayerIds, getSyncLabel, isPlaceholderLineup, isPlaceholderPlayer, loadState, makeId, normalizeInnings, removeUrlParam, saveStoredAdminToken, saveStoredLastEditTeamId, saveStoredTeams, saveStoredTokens, slugify, today } from './io/storage'
import { FIELDING_POSITIONS, MAX_INNINGS, MIN_INNINGS, POSITIONS } from './types'
import type { AppState, FieldingPosition, GameLog, LineupCandidate, LineupMode, LineupRow, PastGameRow, PendingChange, Player, Position, TeamSummary, TeamTokenMap } from './types'

function lineupGridStyle(innings: number, showHistoryPanel: boolean): CSSProperties {
  return {
    gridTemplateColumns: showHistoryPanel
      ? `102px 52px 140px repeat(${innings}, 122px) 150px 34px 34px 38px repeat(10, 34px)`
      : `102px 52px 150px repeat(${innings}, 136px) 184px`,
  }
}

function fullHistoryGridStyle(innings: number): CSSProperties {
  return {
    gridTemplateColumns: `112px 56px 52px 140px repeat(${innings}, 82px) 54px 260px`,
  }
}

function pastGameGridStyle(innings: number, quickMode: boolean): CSSProperties {
  return {
    gridTemplateColumns: quickMode
      ? '62px 58px minmax(160px, 1fr) 220px'
      : `62px 58px 160px repeat(${innings}, 88px)`,
  }
}

function App() {
  const [teamId, setTeamId] = useState(() => getInitialTeamId())
  const [teams, setTeams] = useState<TeamSummary[]>(() => getStoredTeams())
  const [adminToken] = useState(() => {
    const tokenFromUrl = getAdminTokenFromUrl()
    if (tokenFromUrl) {
      saveStoredAdminToken(tokenFromUrl)
      removeUrlParam('admin')
      return tokenFromUrl
    }
    return getStoredAdminToken()
  })
  const [editTokens, setEditTokens] = useState<TeamTokenMap>(() => {
    const tokens = getStoredTokens()
    const tokenFromUrl = getEditTokenFromUrl()
    const initialTeamId = getInitialTeamId()
    if (tokenFromUrl && initialTeamId !== DEFAULT_TEAM_ID) {
      tokens[initialTeamId] = tokenFromUrl
      saveStoredTokens(tokens)
      saveStoredLastEditTeamId(initialTeamId)
      removeUrlParam('edit')
    }
    return tokens
  })
  const [tab, setTab] = useState<'lineup' | 'gameday' | 'roster' | 'history' | 'fullHistory'>('lineup')
  const [draggedRowIndex, setDraggedRowIndex] = useState<number | null>(null)
  const [dragOverRowIndex, setDragOverRowIndex] = useState<number | null>(null)
  const [changedCells, setChangedCells] = useState<Set<string>>(() => new Set())
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [lineupCandidates, setLineupCandidates] = useState<LineupCandidate[]>([])
  const { toast, showToast } = useToast()
  const [scratchFromInning, setScratchFromInning] = useState(1)
  const [historyLocked, setHistoryLocked] = useState(true)
  const [confirmClearHistory, setConfirmClearHistory] = useState(false)
  const [bulkHistoryOpen, setBulkHistoryOpen] = useState(false)
  const [bulkHistoryText, setBulkHistoryText] = useState('')
  const [pastGameOpen, setPastGameOpen] = useState(false)
  const [pastGameDate, setPastGameDate] = useState(today())
  const [pastGameInnings, setPastGameInnings] = useState(4)
  const [pastGameQuickMode, setPastGameQuickMode] = useState(true)
  const [pastGameRows, setPastGameRows] = useState<PastGameRow[]>(() => createPastGameRows(loadState(teamId).players, 4))
  const [printMode, setPrintMode] = useState<'current' | 'gameday' | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const historyInput = useRef<HTMLInputElement>(null)
  const currentTeam = teams.find((team) => team.id === teamId) ?? { id: teamId, name: teamId ? 'Shared team' : 'Choose a team' }
  const currentEditToken = editTokens[teamId] ?? ''
  const canEdit = Boolean(teamId && currentEditToken)
  const readOnly = !canEdit
  const canCreateTeams = Boolean(adminToken)
  const canCopyViewLink = Boolean(teamId)
  const handleTeamLoaded = useCallback(() => {
    setPendingChanges([])
    setLineupCandidates([])
  }, [])
  const { commit, setSyncMessage, setSyncStatus, setUndoStack, state, syncMessage, syncStatus, undoStack } = useSharedTeamState({
    teamId,
    currentEditToken,
    canEdit,
    onTeamLoaded: handleTeamLoaded,
  })
  const bulkHistoryPreview = useMemo(() => {
    const trimmed = bulkHistoryText.trim()
    if (!trimmed) return null
    try {
      return { imported: buildGamesFromCsv(normalizeHistoryImportText(trimmed), state.players), error: '' }
    } catch (error) {
      return { imported: null, error: error instanceof Error ? error.message : 'Could not read that pasted history.' }
    }
  }, [bulkHistoryText, state.players])
  const existingPlayerNames = useMemo(() => new Set(state.players
    .filter((player) => !isPlaceholderPlayer(player))
    .map((player) => player.name.trim().toLowerCase())
    .filter(Boolean)), [state.players])
  const bulkHistoryNewPlayers = useMemo(() => {
    if (!bulkHistoryPreview?.imported) return []
    return bulkHistoryPreview.imported.players
      .filter((player) => !existingPlayerNames.has(player.name.trim().toLowerCase()))
      .map((player) => player.name)
  }, [bulkHistoryPreview, existingPlayerNames])

  const totals = useMemo(() => getTotals(state.players, state.games), [state.players, state.games])
  const rosterPlayers = useMemo(
    () => state.players.filter((player) => player.name.trim() && !isPlaceholderPlayer(player)),
    [state.players],
  )
  const sortedPlayers = useMemo(
    () => state.players.slice().sort((a, b) => {
      if (!a.name.trim()) return 1
      if (!b.name.trim()) return -1
      return a.name.localeCompare(b.name)
    }),
    [state.players],
  )
  const duplicatePlayerIds = useMemo(() => getDuplicatePlayerIds(state.players), [state.players])
  const blankPlayerCount = state.players.filter((player) => !player.name.trim()).length
  const presentCount = state.players.filter((player) => player.present && player.name.trim()).length
  const sitPerInning = Math.max(0, presentCount - state.fieldingSpots)
  const effectiveTab = teamId && rosterPlayers.length === 0 && (tab === 'lineup' || tab === 'gameday') ? 'roster' : tab
  const currentLineupDiff = useMemo(
    () => getRosterLineupDiff(state.currentLineup, state.players),
    [state.currentLineup, state.players],
  )
  const gameDayLineupDiff = useMemo(
    () => getRosterLineupDiff(state.gameDayLineup, state.players),
    [state.gameDayLineup, state.players],
  )
  const currentLineupOrder = useMemo(() => state.currentLineup.map((row) => row.playerId), [state.currentLineup])
  const gameDayLineupOrder = useMemo(() => state.gameDayLineup.map((row) => row.playerId), [state.gameDayLineup])
  useFlipListAnimation(currentLineupOrder, 'current')
  useFlipListAnimation(gameDayLineupOrder, 'gameday')

  useEffect(() => {
    fetch('/api/teams', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Teams unavailable')
        return response.json() as Promise<{ teams: TeamSummary[] }>
      })
      .then((payload) => {
        const remoteTeams = payload.teams.filter((team) => team.id !== DEFAULT_TEAM_ID)
        const merged = remoteTeams.slice()
        if (merged.length !== teams.length || merged.some((team, index) => team.name !== teams[index]?.name)) {
          rememberTeams(merged)
        }
      })
      .catch(() => undefined)
  }, [teams])

  useEffect(() => {
    if (!teamId || window.location.pathname !== '/') return
    const team = teams.find((item) => item.id === teamId)
    if (!team) return
    window.history.replaceState({}, '', getTeamUrl(teamId, undefined, team.name))
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
    const nextTeam = teams.find((team) => team.id === nextTeamId)
    if (nextTeamId && editTokens[nextTeamId]) saveStoredLastEditTeamId(nextTeamId)
    setTeamId(nextTeamId)
    window.history.pushState({}, '', getTeamUrl(nextTeamId, undefined, nextTeam?.name))
  }

  async function createTeam() {
    if (!canCreateTeams) return
    const name = window.prompt('Team name?', 'Julian')
    if (!name?.trim()) return

    try {
      const response = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify({ name: name.trim(), state: createEmptyTeamState() }),
      })
      if (!response.ok) throw new Error(`Team creation failed (${response.status})`)

      const payload = await response.json() as { team: TeamSummary; editToken: string }
      rememberTeams([...teams, payload.team])
      rememberToken(payload.team.id, payload.editToken)
      saveStoredLastEditTeamId(payload.team.id)
      setTeamId(payload.team.id)
      window.history.pushState({}, '', getTeamUrl(payload.team.id, undefined, payload.team.name))
      setSyncStatus('synced')
      setSyncMessage(`${payload.team.name} created`)
      showToast(`${payload.team.name} created`)
    } catch {
      setSyncStatus('error')
      setSyncMessage('Could not create shared team; admin token may be missing or invalid')
    }
  }

  async function renameTeam() {
    if (!canEdit) return
    const name = window.prompt('Team name?', currentTeam.name)
    if (!name?.trim() || name.trim() === currentTeam.name) return

    const nextTeam = { ...currentTeam, name: name.trim() }
    rememberTeams(teams.map((team) => (team.id === teamId ? nextTeam : team)))
    window.history.replaceState({}, '', getTeamUrl(teamId, undefined, nextTeam.name))

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
    const link = getTeamUrl(teamId, currentEditToken, currentTeam.name)
    try {
      await navigator.clipboard.writeText(link)
      setSyncStatus('synced')
      setSyncMessage('Private edit link copied')
      showToast('Private edit link copied')
    } catch {
      window.prompt('Private edit link', link)
    }
  }

  async function copyViewLink() {
    if (!canCopyViewLink) return
    const link = getTeamUrl(teamId, undefined, currentTeam.name)
    try {
      await navigator.clipboard.writeText(link)
      setSyncStatus('synced')
      setSyncMessage('View-only link copied')
      showToast('View-only link copied')
    } catch {
      window.prompt('View-only link', link)
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

  function clearPendingForMode(mode: LineupMode) {
    setPendingChanges((current) => current.filter((change) => change.mode !== mode))
  }

  function clearPendingForCell(mode: LineupMode, playerId: string, inning: number) {
    const key = getLineupChangeKey(mode, playerId, inning)
    setPendingChanges((current) => current.filter((change) => change.id !== key))
  }

  function stageLineupChanges(before: LineupRow[], after: LineupRow[], mode: LineupMode, reason: string) {
    const changes = getPendingLineupChanges(before, after, state.innings, mode, reason)
    setChangedCells(new Set())
    setPendingChanges((current) => current.filter((change) => change.mode !== mode).concat(changes))
    showToast(changes.length ? `${changes.length} suggested change${changes.length === 1 ? '' : 's'} ready to review` : 'No lineup changes suggested')
  }

  function applyPendingChanges(mode: LineupMode, changeIds?: Set<string>) {
    const source = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    const changes = pendingChanges.filter((change) => change.mode === mode && (!changeIds || changeIds.has(change.id)))
    if (changes.length === 0) return
    const next = lineupWithChanges(source, changes)
    setPendingChanges((current) => current.filter((change) => change.mode !== mode || changes.every((accepted) => accepted.id !== change.id)))
    commitLineupChange(source, next, mode, mode === 'gameday' ? { ...state, gameDayLineup: next } : { ...state, currentLineup: next })
    showToast(`Accepted ${changes.length} suggestion${changes.length === 1 ? '' : 's'}`)
  }

  function acceptPendingChange(changeId: string) {
    const change = pendingChanges.find((item) => item.id === changeId)
    if (!change) return
    applyPendingChanges(change.mode, new Set([changeId]))
  }

  function rejectPendingChange(changeId: string) {
    const change = pendingChanges.find((item) => item.id === changeId)
    if (!change) return
    setPendingChanges((current) => current.filter((item) => item.id !== changeId))
    showToast(`Kept ${change.playerName} in inning ${change.inning + 1}`)
  }

  function undoLastChange() {
    const previous = undoStack.at(-1)
    if (!previous) return
    setUndoStack((current) => current.slice(0, -1))
    commit(previous)
    showToast('Undid last change')
  }

  function updatePlayer(id: string, patch: Partial<Player>) {
    commit({
      ...state,
      players: state.players.map((player) => (player.id === id ? { ...player, ...patch } : player)),
    })
  }

  function finishPlayerNameEdit(id: string) {
    const player = state.players.find((item) => item.id === id)
    if (!player) return
    const trimmed = player.name.trim()
    if (!trimmed) {
      if (state.games.some((game) => game.lineup.some((row) => row.playerId === id))) {
        showToast('Player name is required because this player has history')
        return
      }
      deleteUnusedPlayer(id)
      showToast('Blank player removed')
      return
    }
    if (trimmed !== player.name) updatePlayer(id, { name: trimmed })
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
      players: [...state.players, { id: makeId(), name: '', present: true, notes: '', preferredPositions: [] }],
    })
    setTab('roster')
  }

  function updatePlayerPreference(id: string, preferenceIndex: number, value: FieldingPosition | '') {
    const player = state.players.find((item) => item.id === id)
    if (!player) return
    const nextPreferences = player.preferredPositions.slice(0, 3)
    nextPreferences[preferenceIndex] = value as FieldingPosition
    updatePlayer(id, {
      preferredPositions: nextPreferences
        .filter((position): position is FieldingPosition => isFieldingPosition(position))
        .filter((position, index, all) => all.indexOf(position) === index),
    })
  }

  function generateCandidates() {
    if (duplicatePlayerIds.size > 0) {
      setTab('roster')
      showToast('Fix duplicate player names before generating')
      return
    }
    if (presentCount === 0) {
      setTab('roster')
      setSyncStatus('local')
      setSyncMessage('Add players before generating a lineup')
      return
    }
    const candidates = Array.from({ length: 3 }, (_, index) => ({
      id: makeId(),
      label: `Option ${index + 1}`,
      lineup: generateLineup(state.players, state.games, state.innings, state.fieldingSpots),
    }))
    const next = candidates[0].lineup
    setLineupCandidates(candidates)
    setChangedCells(new Set())
    clearPendingForMode('current')
    commit({ ...state, currentLineup: next }, { undo: true })
    setTab('lineup')
    showToast('Generated 3 lineup options')
  }

  function chooseLineupCandidate(candidate: LineupCandidate) {
    clearPendingForMode('current')
    setChangedCells(getChangedCells(state.currentLineup, candidate.lineup, state.innings, 'current'))
    commit({ ...state, currentLineup: candidate.lineup }, { undo: true })
    showToast(`${candidate.label} selected`)
  }

  function emptyCurrentLineup() {
    const next = createBlankLineup(state.players, state.innings)
    setChangedCells(new Set())
    clearPendingForMode('current')
    setLineupCandidates([])
    commit({ ...state, currentLineup: next }, { undo: true })
    setTab('lineup')
  }

  function updateLineupFromRoster(mode: 'current' | 'gameday' = 'current') {
    const source = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    const next = syncLineupToRoster(source, state.players, state.games, state.innings, state.fieldingSpots)
    const sourceById = new Map(source.map((row) => [row.playerId, row]))
    const baseline = next.map((row, index) => {
      const previous = sourceById.get(row.playerId)
      return {
        ...row,
        batOrder: index + 1,
        assignments: Array.from({ length: state.innings }, (_, inning) => previous?.assignments[inning] ?? ''),
      }
    })
    clearPendingForMode(mode)
    commit(mode === 'gameday' ? { ...state, gameDayLineup: baseline } : { ...state, currentLineup: baseline }, { undo: true })
    stageLineupChanges(baseline, next, mode, 'Roster sync')
  }

  function regenerateFromRoster(mode: 'current' | 'gameday' = 'current') {
    const next = generateLineup(state.players, state.games, state.innings, state.fieldingSpots)
    commitLineupChange(
      mode === 'gameday' ? state.gameDayLineup : state.currentLineup,
      next,
      mode,
      mode === 'gameday' ? { ...state, gameDayLineup: next } : { ...state, currentLineup: next },
    )
  }

  function setLineup(nextLineup: LineupRow[], mode: 'current' | 'gameday' = 'current', options: { undo?: boolean } = { undo: true }) {
    const normalized = nextLineup.map((row, index) => ({ ...row, batOrder: index + 1 }))
    clearPendingForMode(mode)
    if (mode === 'current') setLineupCandidates([])
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
    clearPendingForCell(mode, next[rowIndex].playerId, inning)

    if (isFieldingPosition(value)) {
      const currentHolderIndex = next.findIndex((row, index) => index !== rowIndex && row.assignments[inning] === value)
      if (currentHolderIndex >= 0) {
        clearPendingForCell(mode, next[currentHolderIndex].playerId, inning)
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

  function deleteGame(gameId: string) {
    commit({
      ...state,
      games: state.games.filter((game) => game.id !== gameId),
    }, { undo: true })
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
      ...(mode === 'gameday' ? { gameDayLineup: withoutPlayer } : { currentLineup: withoutPlayer }),
    }
    clearPendingForMode(mode)
    commit(nextState, { undo: true })
    stageLineupChanges(withoutPlayer, rebalanced, mode, 'Player removed')
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
      ...(mode === 'gameday' ? { gameDayLineup: withPlayer } : { currentLineup: withPlayer }),
    }
    clearPendingForMode(mode)
    commit(nextState, { undo: true })
    stageLineupChanges(withPlayer, rebalanced, mode, 'Player added')
  }

  function fixInning(inning: number, mode: 'current' | 'gameday' = 'current') {
    const source = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    const fixed = fixLineupInning(source, state.players, state.games, state.innings, state.fieldingSpots, inning)
    stageLineupChanges(source, fixed, mode, `Fix inning ${inning + 1}`)
  }

  function fixPlayerRepeats(mode: 'current' | 'gameday' = 'current') {
    const source = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    const next = Array.from({ length: state.innings }, (_, inning) => inning).reduce(
      (lineup, inning) => fixLineupInning(lineup, state.players, state.games, state.innings, state.fieldingSpots, inning),
      source,
    )
    stageLineupChanges(source, next, mode, 'Fix repeated positions')
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
      currentLineup: mode === 'current' ? createBlankLineup(state.players, state.innings) : state.currentLineup,
      gameDayLineup: mode === 'gameday' ? [] : state.gameDayLineup,
      gameDate: today(),
    })
    setTab('history')
  }

  function clearHistory() {
    if (!state.games.length) return
    if (!confirmClearHistory) {
      setConfirmClearHistory(true)
      showToast('Press Clear History again to confirm')
      return
    }
    setConfirmClearHistory(false)
    commit({
      ...state,
      games: [],
    }, { undo: true })
    showToast('History cleared')
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
    const source = state.gameDayLineup
    const startInning = Math.max(0, Math.min(state.innings - 1, scratchFromInning - 1))
    const forcedSitterIds = new Set([playerId])
    const scratched = Array.from({ length: state.innings - startInning }, (_, index) => startInning + index).reduce(
      (lineup, inning) => fixLineupInningWithForcedSits(lineup, state.players, state.games, state.innings, state.fieldingSpots, inning, forcedSitterIds),
      source,
    )
    const nextState = {
      ...state,
      players: state.players.map((player) => (player.id === playerId ? { ...player, present: false } : player)),
    }
    stageLineupChanges(source, scratched, 'gameday', `Scratch from inning ${startInning + 1}`)
    commit({ ...nextState, gameDayLineup: source }, { undo: true })
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
        showToast('Lineup copied to clipboard')
      }
    } catch {
      // Cancelled shares are fine; keep the app quiet.
    }
  }

  function exportBackup() {
    downloadFile(`lineup-coach-${slugify(currentTeam.name)}-${today()}.json`, JSON.stringify(state, null, 2), 'application/json')
  }

  function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result)) as AppState
        commit({ ...createInitialState(), ...imported })
        showToast('Backup restored')
      } catch {
        showToast('Could not read that backup file')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  function commitImportedHistory(imported: { players: Player[]; games: GameLog[] }) {
    const shouldReplaceLineup = !state.currentLineup.length || isPlaceholderLineup(state.currentLineup)
    commit({
      ...state,
      players: imported.players,
      games: [...state.games, ...imported.games],
      currentLineup: shouldReplaceLineup ? createBlankLineup(imported.players, state.innings) : state.currentLineup,
    }, { undo: true })
  }

  function importHistory(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = buildGamesFromCsv(normalizeHistoryImportText(String(reader.result)), state.players)
        commitImportedHistory(imported)
        showToast(`Imported ${imported.games.length} game${imported.games.length === 1 ? '' : 's'} into history`)
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Could not import that history CSV')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  function importBulkHistory() {
    if (!bulkHistoryPreview?.imported) return
    commitImportedHistory(bulkHistoryPreview.imported)
    showToast(`Imported ${bulkHistoryPreview.imported.games.length} game${bulkHistoryPreview.imported.games.length === 1 ? '' : 's'} into history`)
    setBulkHistoryText('')
    setBulkHistoryOpen(false)
  }

  function resetPastGameForm(innings = state.innings) {
    const normalizedInnings = normalizeInnings(innings)
    setPastGameDate(state.gameDate || today())
    setPastGameInnings(normalizedInnings)
    setPastGameRows(createPastGameRows(state.players, normalizedInnings))
  }

  function togglePastGameForm() {
    const nextOpen = !pastGameOpen
    setPastGameOpen(nextOpen)
    if (nextOpen) {
      resetPastGameForm()
      setBulkHistoryOpen(false)
    }
  }

  function setManualPastGameInnings(innings: number) {
    const normalizedInnings = normalizeInnings(innings)
    setPastGameInnings(normalizedInnings)
    setPastGameRows((rows) => rows.map((row) => ({
      ...row,
      assignments: Array.from({ length: normalizedInnings }, (_, inning) => row.assignments[inning] ?? ''),
    })))
  }

  function updatePastGameRow(playerId: string, patch: Partial<PastGameRow>) {
    setPastGameRows((rows) => rows.map((row) => (row.playerId === playerId ? { ...row, ...patch } : row)))
  }

  function addPastGame() {
    const playersById = new Map(state.players.map((player) => [player.id, player]))
    const playedRows = pastGameRows
      .filter((row) => row.played)
      .map((row) => {
        const player = playersById.get(row.playerId)
        if (!player?.name.trim()) return null
        const sitInnings = parseSitInnings(row.sitInnings, pastGameInnings)
        return {
          playerId: row.playerId,
          playerName: player.name.trim(),
          batOrder: row.batOrder || 999,
          assignments: pastGameQuickMode
            ? Array.from({ length: pastGameInnings }, (_, inning) => (sitInnings.has(inning) ? 'Sit' : '' as Position))
            : Array.from({ length: pastGameInnings }, (_, inning) => row.assignments[inning] ?? ''),
        }
      })
      .filter((row): row is LineupRow => Boolean(row))
      .sort((a, b) => a.batOrder - b.batOrder)
      .map((row, index) => ({ ...row, batOrder: index + 1 }))

    if (!playedRows.length) {
      showToast('Mark at least one player as played')
      return
    }

    const game: GameLog = {
      id: makeId(),
      date: pastGameDate || today(),
      innings: pastGameInnings,
      fieldingSpots: state.fieldingSpots,
      lineup: playedRows,
    }

    commit({
      ...state,
      games: [...state.games, game],
    }, { undo: true })
    setPastGameOpen(false)
    showToast('Past game added')
  }

  function renderLineup(showHistoryPanel: boolean, mode: 'current' | 'gameday' = 'current') {
    const lineup = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    const isGameDay = mode === 'gameday'
    const locked = readOnly || (isGameDay && state.gameDayLocked)
    const rosterDiff = isGameDay ? gameDayLineupDiff : currentLineupDiff
    const isOutOfSync = rosterDiff.added.length > 0 || rosterDiff.removed.length > 0 || rosterDiff.renamed.length > 0
    const lineupPlayerIds = new Set(lineup.map((row) => row.playerId))
    const absentPlayers = state.players
      .filter((player) => player.name.trim() && !player.present && !lineupPlayerIds.has(player.id))
      .sort((a, b) => a.name.localeCompare(b.name))
    const inningWarnings = getInningWarnings(lineup, state.innings, state.fieldingSpots)
    const inningFixes = getInningFixes(lineup, state.innings, state.fieldingSpots)
    const hasPlayerRepeats = hasRepeatedPositions(lineup, state.innings)
    const blankLineup = isBlankLineup(lineup, state.innings)
    const pendingForMode = pendingChanges.filter((change) => change.mode === mode)
    const pendingByCell = new Map(pendingForMode.map((change) => [change.id, change]))
    const CountCell = ({ value, delta = 0 }: { value: number; delta?: number }) => (
      <span className={delta > 0 ? 'projected-count' : ''}>{value + delta}</span>
    )
    return (
      <section className="workspace">
        {!isGameDay && lineup.length > 0 && (
          <div className="candidate-strip">
            <button className="primary" type="button" onClick={generateCandidates} disabled={readOnly}>
              <Shuffle size={16} /> Generate
            </button>
            {lineupCandidates.length > 1 && lineupCandidates.map((candidate, index) => (
              <button
                type="button"
                key={candidate.id}
                className={candidate.lineup.every((row, rowIndex) => row.playerId === lineup[rowIndex]?.playerId && row.assignments.every((assignment, inning) => assignment === lineup[rowIndex]?.assignments[inning])) ? 'selected' : ''}
                onClick={() => chooseLineupCandidate(candidate)}
                disabled={readOnly}
                title={`Use ${candidate.label}`}
              >
                {index + 1}
              </button>
            ))}
            <button className="danger" type="button" onClick={emptyCurrentLineup} disabled={readOnly}>
              <Eraser size={16} /> Clear
            </button>
            <button type="button" onClick={undoLastChange} disabled={undoStack.length === 0 || readOnly}>
              <Undo2 size={16} /> Undo
            </button>
            {pendingForMode.length > 0 && (
              <>
                <button type="button" onClick={() => applyPendingChanges(mode)} disabled={readOnly}>
                  <Check size={16} /> Accept all
                </button>
                <button type="button" onClick={() => setPendingChanges((current) => current.filter((change) => change.mode !== mode))} disabled={readOnly}>
                  <X size={16} /> Revert all
                </button>
              </>
            )}
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
            <button type="button" onClick={() => setGameDayLocked(!state.gameDayLocked)} disabled={readOnly}>
              {locked ? <Lock size={16} /> : <Unlock size={16} />}
              {locked ? 'Locked' : 'Editing'}
            </button>
            <label className="compact-field">
              Log innings
              <select value={Math.min(state.gameDayLogInnings, state.innings)} onChange={(event) => setGameDayLogInnings(Number(event.target.value))} disabled={readOnly}>
                {Array.from({ length: state.innings }, (_, index) => index + 1).map((inning) => (
                  <option key={inning} value={inning}>{inning}</option>
                ))}
              </select>
            </label>
            <label className="compact-field">
              Scratch from
              <select value={Math.min(scratchFromInning, state.innings)} onChange={(event) => setScratchFromInning(Number(event.target.value))} disabled={readOnly}>
                {Array.from({ length: state.innings }, (_, index) => index + 1).map((inning) => (
                  <option key={inning} value={inning}>Inning {inning}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={undoLastChange} disabled={undoStack.length === 0 || locked || readOnly}>
              <Undo2 size={16} /> Undo
            </button>
            {pendingForMode.length > 0 && (
              <>
                <button type="button" onClick={() => applyPendingChanges(mode)} disabled={locked}>
                  <Check size={16} /> Accept all
                </button>
                <button type="button" onClick={() => setPendingChanges((current) => current.filter((change) => change.mode !== mode))} disabled={locked}>
                  <X size={16} /> Revert all
                </button>
              </>
            )}
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
            <h2>{rosterPlayers.length === 0 ? 'Add your players first.' : isGameDay ? 'No Gameday lineup saved yet.' : 'Generate a lineup to start.'}</h2>
            {rosterPlayers.length === 0 ? (
              <button className="primary" type="button" onClick={() => setTab('roster')}>
                <ListPlus size={18} /> Add Players
              </button>
            ) : !isGameDay && (
              <button className="primary" type="button" onClick={generateCandidates} disabled={readOnly}>
                <Shuffle size={18} /> Generate Lineup
              </button>
            )}
          </div>
        ) : (
          <>
            {isOutOfSync && !locked && (
              <div className="roster-sync-banner">
                <span>
                  Roster changed
                  {rosterDiff.added.length > 0 && ` - ${rosterDiff.added.length} added`}
                  {rosterDiff.removed.length > 0 && ` - ${rosterDiff.removed.length} removed`}
                  {rosterDiff.renamed.length > 0 && ` - ${rosterDiff.renamed.length} renamed`}
                </span>
                <button type="button" onClick={() => updateLineupFromRoster(mode)} disabled={readOnly}>
                  Update lineup
                </button>
                <button type="button" onClick={() => regenerateFromRoster(mode)} disabled={readOnly}>
                  Regenerate
                </button>
              </div>
            )}
            {blankLineup && !locked && (
              <div className="inning-warnings gentle-warning">
                <span>Lineup is empty; assign positions manually or generate one.</span>
              </div>
            )}
            {pendingForMode.length > 0 && !locked && (
              <div className="suggestion-banner">
                <span>{pendingForMode.length} suggested change{pendingForMode.length === 1 ? '' : 's'} pending review.</span>
                <button type="button" onClick={() => applyPendingChanges(mode)} disabled={readOnly}>
                  <Check size={16} /> Accept all
                </button>
                <button type="button" onClick={() => setPendingChanges((current) => current.filter((change) => change.mode !== mode))} disabled={readOnly}>
                  <X size={16} /> Revert all
                </button>
              </div>
            )}
            {!blankLineup && (inningWarnings.length > 0 || hasPlayerRepeats) && !locked && (
              <div className="inning-warnings">
                {inningWarnings.map((warning) => (
                  <span className={`warning-${warningSeverity(warning)}`} key={warning}>{warning}</span>
                ))}
                {hasPlayerRepeats && <span className="warning-hard">One or more players repeat the same position</span>}
                {inningFixes.map((fix) => (
                  <button type="button" key={fix.inning} onClick={() => fixInning(fix.inning, mode)} disabled={readOnly}>
                    {fix.label}
                  </button>
                ))}
                {hasPlayerRepeats && (
                  <button type="button" onClick={() => fixPlayerRepeats(mode)} disabled={readOnly}>
                    Fix repeated positions
                  </button>
                )}
              </div>
            )}
            <div className="lineup-table">
                <div className="lineup-row heading" style={lineupGridStyle(state.innings, showHistoryPanel)}>
                  <span>Order</span>
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
                  const displayWarnings = blankLineup ? [] : warnings
                  const player = state.players.find((item) => item.id === row.playerId)
                  const summary = player ? summarizePlayer(player, state.games) : undefined
                  const deltas = getLineupDeltas(row, lineup, state.innings)
                  return (
                      <div
                      className={`lineup-row ${row.assignments.some((_, inning) => pendingByCell.has(getLineupChangeKey(mode, row.playerId, inning))) ? 'has-suggestion' : ''} ${draggedRowIndex === rowIndex ? 'dragging' : ''} ${dragOverRowIndex === rowIndex && draggedRowIndex !== rowIndex ? 'drop-target' : ''}`}
                      style={lineupGridStyle(state.innings, showHistoryPanel)}
                      key={row.playerId}
                      data-lineup-mode={mode}
                      data-lineup-row-id={row.playerId}
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
                          className="row-nudge"
                          disabled={locked || rowIndex === 0}
                          onClick={() => reorderRow(rowIndex, rowIndex - 1, mode)}
                          title="Move up"
                        >
                          <ArrowUp size={14} />
                        </button>
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
                        <button
                          type="button"
                          className="row-nudge"
                          disabled={locked || rowIndex === lineup.length - 1}
                          onClick={() => reorderRow(rowIndex, rowIndex + 1, mode)}
                          title="Move down"
                        >
                          <ArrowDown size={14} />
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
                        const pending = pendingByCell.get(cellKey)
                        return (
                          <span className={pending ? 'suggested-cell' : ''} key={inning}>
                            <select
                              className={changedCells.has(cellKey) ? 'changed-cell' : ''}
                              value={row.assignments[inning] ?? ''}
                              disabled={locked}
                              title={explainAssignment(player, row, row.assignments[inning] ?? '', state.games, lineup, state.innings)}
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
                            {pending && (
                              <span className="suggestion-review" title={`${pending.reason}: ${pending.oldValue || 'blank'} to ${pending.newValue || 'blank'}`}>
                                <span className="suggestion-arrow">{pending.oldValue || '-'} → {pending.newValue || '-'}</span>
                                <button type="button" onClick={() => acceptPendingChange(pending.id)} disabled={locked} title="Accept suggestion">
                                  <Check size={13} />
                                </button>
                                <button type="button" onClick={() => rejectPendingChange(pending.id)} disabled={locked} title="Reject suggestion">
                                  <X size={13} />
                                </button>
                              </span>
                            )}
                          </span>
                        )
                      })}
                      {displayWarnings.length ? (
                        <button className={`warning warning-${worstWarningSeverity(displayWarnings)} warning-fix`} type="button" disabled={locked} title="Fix this player's warnings" onClick={() => fixPlayerRepeats(mode)}>
                          {displayWarnings.join('; ')}
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
                  <button className="primary" type="button" onClick={saveToGameDay} disabled={readOnly}>
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
                <button className="primary" type="button" onClick={() => logGame(mode)} disabled={readOnly}>
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
      <PrintCard printMode={printMode} state={state} />
      <header className="app-header">
        <div className="brand-lockup">
          <img className="brand-mark" src="/fieldstar-mark.png" alt="" />
          <div>
            <h1>FieldStar</h1>
            <p className="eyebrow">Youth Baseball Lineup Tracker</p>
          </div>
        </div>
        <div className="header-actions">
          <span className={`sync-status ${syncStatus}`} title={syncMessage}>
            {getSyncLabel(syncStatus)}
          </span>
          <label className="team-picker">
            Team
            <select value={teamId} onChange={(event) => switchTeam(event.target.value)}>
              <option value="">Choose team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </label>
          {canCreateTeams && (
            <button type="button" onClick={createTeam} title="Create team">
              <ListPlus size={18} />
            </button>
          )}
          <button type="button" onClick={renameTeam} disabled={!canEdit} title="Rename team">
            <Edit3 size={18} />
          </button>
          <div className="team-link-panel" aria-label="Team links">
            <button type="button" onClick={copyViewLink} disabled={!canCopyViewLink} title={canCopyViewLink ? 'Copy view-only team link' : 'Select a team for view-only sharing'}>
              <Eye size={18} /> View Link
            </button>
            <button type="button" onClick={copyEditLink} disabled={!canEdit} title="Copy private edit link">
              <Copy size={18} /> Edit Link
            </button>
          </div>
          <button type="button" onClick={exportBackup} disabled={!teamId} title="Download a full team backup as JSON">
            <Download size={18} /> Backup
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} disabled={!canEdit} title="Restore a full team backup from JSON">
            <Upload size={18} /> Restore
          </button>
          <input ref={fileInput} className="hidden" type="file" accept="application/json" onChange={importBackup} />
        </div>
      </header>

      {!teamId ? (
        <TeamHome canCreateTeams={canCreateTeams} onCreateTeam={createTeam} onSwitchTeam={switchTeam} teams={teams} />
      ) : (
        <>
      <section className="toolbar">
        <label>
          Date
          <input value={state.gameDate} type="date" disabled={readOnly} onChange={(event) => commit({ ...state, gameDate: event.target.value })} />
        </label>
        <label>
          Innings
          <select value={state.innings} disabled={readOnly} onChange={(event) => {
            const innings = normalizeInnings(Number(event.target.value))
            commit({
              ...state,
              innings,
              gameDayLogInnings: Math.min(state.gameDayLogInnings, innings),
              currentLineup: createBlankLineup(state.players, innings),
            })
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
            disabled={readOnly}
            onChange={(event) => commit({ ...state, fieldingSpots: Number(event.target.value) })}
          />
        </label>
        <div className="metrics">
          <span>{presentCount} present</span>
          <span>{sitPerInning} sits / inning</span>
          <span>{state.games.length} logged</span>
        </div>
      </section>

      <nav className="tabs" aria-label="Views">
        <button type="button" className={effectiveTab === 'lineup' ? 'active' : ''} onClick={() => setTab('lineup')}>
          <ClipboardList size={18} /> Draft Lineup
        </button>
        <button type="button" className={effectiveTab === 'gameday' ? 'active' : ''} onClick={() => setTab('gameday')}>
          <Save size={18} /> Gameday
        </button>
        <button type="button" className={effectiveTab === 'roster' ? 'active' : ''} onClick={() => setTab('roster')}>
          <Users size={18} /> Roster
        </button>
        <button type="button" className={effectiveTab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          <History size={18} /> Summary
        </button>
        <button type="button" className={effectiveTab === 'fullHistory' ? 'active' : ''} onClick={() => setTab('fullHistory')}>
          <List size={18} /> History
        </button>
      </nav>

      {effectiveTab === 'lineup' && renderLineup(true)}
      {effectiveTab === 'gameday' && renderLineup(true, 'gameday')}

      {effectiveTab === 'roster' && (
        <RosterTab
          addPlayer={addPlayer}
          blankPlayerCount={blankPlayerCount}
          deleteUnusedPlayer={deleteUnusedPlayer}
          duplicatePlayerIds={duplicatePlayerIds}
          finishPlayerNameEdit={finishPlayerNameEdit}
          readOnly={readOnly}
          sortedPlayers={sortedPlayers}
          state={state}
          totals={totals}
          updatePlayer={updatePlayer}
          updatePlayerPreference={updatePlayerPreference}
        />
      )}

      {effectiveTab === 'history' && <SummaryTab sortedPlayers={sortedPlayers} state={state} />}

      {effectiveTab === 'fullHistory' && (
        <section className="workspace">
          <div className="section-title">
            <h2>History</h2>
            <div className="history-actions">
              <button type="button" onClick={() => setHistoryLocked(!historyLocked)} disabled={readOnly}>
                {historyLocked ? <Lock size={16} /> : <Unlock size={16} />}
                {historyLocked ? 'Locked' : 'Editing'}
              </button>
              <button type="button" onClick={togglePastGameForm} disabled={historyLocked || readOnly}>
                <ListPlus size={18} /> Add Past Game
              </button>
              <button type="button" onClick={() => setBulkHistoryOpen(!bulkHistoryOpen)} disabled={historyLocked || readOnly}>
                <ClipboardList size={18} /> Bulk Add
              </button>
              <button type="button" onClick={() => historyInput.current?.click()} disabled={historyLocked || readOnly}>
                <Upload size={18} /> Import CSV
              </button>
              <button type="button" onClick={() => downloadFile(`baseball-history-${today()}.csv`, exportCsv(state.games), 'text/csv')} disabled={state.games.length === 0}>
                <Download size={18} /> CSV
              </button>
              <button type="button" onClick={() => downloadFile('fieldstar-history-template.csv', HISTORY_IMPORT_SAMPLE, 'text/csv')}>
                <Download size={18} /> Template
              </button>
              <button className="danger" type="button" onClick={clearHistory} disabled={historyLocked || readOnly || state.games.length === 0}>
                <Trash2 size={18} /> {confirmClearHistory ? 'Confirm Clear' : 'Clear History'}
              </button>
            </div>
          </div>
          {pastGameOpen && (
            <div className="past-game-panel">
              <div className="past-game-header">
                <div>
                  <h3>Add past game</h3>
                  <p>Use quick mode when you only remember batting order and who sat.</p>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={pastGameQuickMode} onChange={(event) => setPastGameQuickMode(event.target.checked)} />
                  Quick mode
                </label>
              </div>
              <div className="past-game-controls">
                <label>
                  Date
                  <input type="date" value={pastGameDate} onChange={(event) => setPastGameDate(event.target.value)} />
                </label>
                <label>
                  Innings
                  <select value={pastGameInnings} onChange={(event) => setManualPastGameInnings(Number(event.target.value))}>
                    {Array.from({ length: MAX_INNINGS }, (_, index) => index + 1).map((inning) => (
                      <option key={inning} value={inning}>{inning}</option>
                    ))}
                  </select>
                </label>
              </div>
              {pastGameRows.length === 0 ? (
                <p className="quiet">Add players on the Roster tab before entering past games.</p>
              ) : (
                <div className="past-game-table">
                  <div className={`past-game-row heading ${pastGameQuickMode ? 'quick' : ''}`} style={pastGameGridStyle(pastGameInnings, pastGameQuickMode)}>
                    <span>Played</span>
                    <span>Bat</span>
                    <span>Player</span>
                    {pastGameQuickMode ? (
                      <span>Sit innings</span>
                    ) : (
                      Array.from({ length: pastGameInnings }, (_, inning) => (
                        <span key={inning}>Inning {inning + 1}</span>
                      ))
                    )}
                  </div>
                  {pastGameRows.map((row) => {
                    const player = state.players.find((item) => item.id === row.playerId)
                    return (
                      <div className={`past-game-row ${pastGameQuickMode ? 'quick' : ''}`} style={pastGameGridStyle(pastGameInnings, pastGameQuickMode)} key={row.playerId}>
                        <label className="play-toggle" title="Played in this game">
                          <input type="checkbox" checked={row.played} onChange={(event) => updatePastGameRow(row.playerId, { played: event.target.checked })} />
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={row.batOrder}
                          disabled={!row.played}
                          onChange={(event) => updatePastGameRow(row.playerId, { batOrder: Number(event.target.value) })}
                        />
                        <strong>{player?.name || 'Player'}</strong>
                        {pastGameQuickMode ? (
                          <input
                            value={row.sitInnings}
                            disabled={!row.played}
                            placeholder="e.g. 2, 4"
                            onChange={(event) => updatePastGameRow(row.playerId, { sitInnings: event.target.value })}
                          />
                        ) : (
                          Array.from({ length: pastGameInnings }, (_, inning) => (
                            <select
                              key={inning}
                              value={row.assignments[inning] ?? ''}
                              disabled={!row.played}
                              onChange={(event) => {
                                const assignments = row.assignments.slice()
                                assignments[inning] = event.target.value as Position
                                updatePastGameRow(row.playerId, { assignments })
                              }}
                            >
                              <option value=""></option>
                              {POSITIONS.map((position) => (
                                <option key={position} value={position}>{position}</option>
                              ))}
                            </select>
                          ))
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="preview-actions">
                <button type="button" onClick={() => setPastGameOpen(false)}>
                  Cancel
                </button>
                <button className="primary" type="button" onClick={addPastGame} disabled={pastGameRows.length === 0}>
                  Add Game
                </button>
              </div>
            </div>
          )}
          {bulkHistoryOpen && (
            <div className="bulk-history-panel">
              <div className="bulk-history-copy">
                <h3>Paste past games</h3>
                <p>Copy rows from Sheets, Excel, or a CSV. Use one row per player per game; dates group rows into games.</p>
              </div>
              <div className="bulk-history-grid">
                <label>
                  Game history
                  <textarea
                    value={bulkHistoryText}
                    onChange={(event) => setBulkHistoryText(event.target.value)}
                    placeholder={HISTORY_IMPORT_SAMPLE}
                    spellCheck={false}
                  />
                </label>
                <div className="bulk-history-preview">
                  <div className="preview-toolbar">
                    <strong>Preview</strong>
                    <button type="button" onClick={() => setBulkHistoryText(HISTORY_IMPORT_SAMPLE)}>
                      Use Sample
                    </button>
                  </div>
                  {!bulkHistoryText.trim() && (
                    <p className="quiet">Paste rows to preview before saving.</p>
                  )}
                  {bulkHistoryPreview?.error && (
                    <p className="import-error">{bulkHistoryPreview.error}</p>
                  )}
                  {bulkHistoryPreview?.imported && (
                    <>
                      <p>
                        {bulkHistoryPreview.imported.games.length} game{bulkHistoryPreview.imported.games.length === 1 ? '' : 's'} ·{' '}
                        {bulkHistoryPreview.imported.games.reduce((sum, game) => sum + game.lineup.length, 0)} player rows
                        {bulkHistoryNewPlayers.length ? ` · ${bulkHistoryNewPlayers.length} new player${bulkHistoryNewPlayers.length === 1 ? '' : 's'}` : ''}
                      </p>
                      <div className="preview-game-list">
                        {bulkHistoryPreview.imported.games.map((game) => (
                          <span key={game.id}>{game.date}: {game.lineup.length} players, {game.innings} innings</span>
                        ))}
                      </div>
                      {bulkHistoryNewPlayers.length > 0 && (
                        <p className="quiet">New players: {bulkHistoryNewPlayers.join(', ')}</p>
                      )}
                    </>
                  )}
                  <div className="preview-actions">
                    <button type="button" onClick={() => setBulkHistoryText('')} disabled={!bulkHistoryText}>
                      Clear
                    </button>
                    <button className="primary" type="button" onClick={importBulkHistory} disabled={!bulkHistoryPreview?.imported}>
                      Add to History
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {state.games.length === 0 ? (
            <div className="empty-state">
              <History size={32} />
              <h2>No games logged yet.</h2>
            </div>
          ) : (
            <>
            <div className="logged-games-panel">
              {state.games.map((game, gameIndex) => (
                <div className="logged-game-chip" key={game.id}>
                  <span>{game.date} · Game {gameIndex + 1} · {game.lineup.length} players</span>
                  <button type="button" onClick={() => deleteGame(game.id)} disabled={historyLocked || readOnly} title="Delete this logged game">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
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
                          disabled={historyLocked || readOnly}
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
            </>
          )}
        </section>
      )}
      <input ref={historyInput} className="hidden" type="file" accept=".csv,text/csv" onChange={importHistory} />
        </>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast.message}
        </div>
      )}
      <footer className="app-footer">
        Built for lineup planning. Ask your coach for edit access.
      </footer>
    </main>
  )
}

export default App
