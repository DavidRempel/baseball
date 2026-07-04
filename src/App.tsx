import {
  AlertTriangle,
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
  Undo2,
  Unlock,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent, PointerEvent } from 'react'
import './App.css'
import './styles/reorder.css'
import { FullHistoryTab } from './components/FullHistoryTab'
import { PrintCard } from './components/PrintCard'
import { RosterTab } from './components/RosterTab'
import { SummaryTab } from './components/SummaryTab'
import { TeamHome } from './components/TeamHome'
import { useFlipListAnimation } from './hooks/useFlipListAnimation'
import { useSharedTeamState } from './hooks/useSharedTeamState'
import { useToast } from './hooks/useToast'
import { exportCsv } from './io/csv'
import { createBlankLineup, fixLineupInning, fixLineupInningWithForcedSits, generateLineup, isFieldingPosition } from './engine/lineup'
import { explainAssignment, getInningFixes, getInningWarnings, getLineupDeltas, getTotals, getWarnings, hasRepeatedPositions, isBlankLineup, summarizePlayer, warningSeverity, worstWarningSeverity } from './engine/totals'
import { getRosterLineupDiff, syncLineupToRoster } from './engine/sync'
import { getChangedCells, getLineupChangeKey, getPendingLineupChanges, lineupWithChanges } from './engine/changes'
import { DEFAULT_TEAM_ID, createEmptyTeamState, createInitialState, downloadFile, formatLineupText, getAdminTokenFromUrl, getEditTokenFromUrl, getInitialTeamId, getStoredAdminToken, getStoredTeams, getStoredTokens, getTeamUrl, getDuplicatePlayerIds, getSyncLabel, isPlaceholderPlayer, makeId, normalizeInnings, removeUrlParam, saveStoredAdminToken, saveStoredLastEditTeamId, saveStoredTeams, saveStoredTokens, slugify, today } from './io/storage'
import { FIELDING_POSITIONS, INFIELD, MAX_INNINGS, MIN_INNINGS, OUTFIELD, POSITIONS } from './types'
import type { AppState, FieldingPosition, GameLog, LineupMode, LineupRow, PendingChange, Player, Position, TeamSummary, TeamTokenMap } from './types'

function lineupGridStyle(innings: number, showHistoryPanel: boolean): CSSProperties {
  return {
    gridTemplateColumns: showHistoryPanel
      ? `46px 52px 140px repeat(${innings}, 122px) 150px 34px 34px 38px repeat(10, 34px)`
      : `46px 52px 150px repeat(${innings}, 136px) 184px`,
  }
}

function positionSelectClass(value: Position, changed = false) {
  return [
    changed ? 'changed-cell' : '',
    INFIELD.has(value) ? 'position-infield' : '',
    OUTFIELD.has(value) ? 'position-outfield' : '',
    value === 'Sit' ? 'position-sit' : '',
  ].filter(Boolean).join(' ')
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
  const { toast, showToast } = useToast()
  const [scratchFromInning, setScratchFromInning] = useState(1)
  const [printMode, setPrintMode] = useState<'current' | 'gameday' | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const currentTeam = teams.find((team) => team.id === teamId) ?? { id: teamId, name: teamId ? 'Shared team' : 'Choose a team' }
  const currentEditToken = editTokens[teamId] ?? ''
  const canEdit = Boolean(teamId && currentEditToken)
  const readOnly = !canEdit
  const canCreateTeams = Boolean(adminToken)
  const canCopyViewLink = Boolean(teamId)
  const handleTeamLoaded = useCallback(() => {
    setPendingChanges([])
  }, [])
  const { commit, setSyncMessage, setSyncStatus, setUndoStack, state, syncMessage, syncStatus, undoStack } = useSharedTeamState({
    teamId,
    currentEditToken,
    canEdit,
    onTeamLoaded: handleTeamLoaded,
  })
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
      players: [...state.players, { id: makeId(), name: '', present: true, notes: '', preferredPositions: [], dislikedPositions: [] }],
    })
    setTab('roster')
  }

  function updatePlayerPositionList(
    id: string,
    field: 'preferredPositions' | 'dislikedPositions',
    positionIndex: number,
    value: FieldingPosition | '',
  ) {
    const player = state.players.find((item) => item.id === id)
    if (!player) return
    const nextPositions = player[field].slice(0, 3)
    nextPositions[positionIndex] = value as FieldingPosition
    updatePlayer(id, {
      [field]: nextPositions
        .filter((position): position is FieldingPosition => isFieldingPosition(position))
        .filter((position, index, all) => all.indexOf(position) === index),
    })
  }

  function updatePlayerPreference(id: string, preferenceIndex: number, value: FieldingPosition | '') {
    updatePlayerPositionList(id, 'preferredPositions', preferenceIndex, value)
  }

  function updatePlayerDislike(id: string, dislikeIndex: number, value: FieldingPosition | '') {
    updatePlayerPositionList(id, 'dislikedPositions', dislikeIndex, value)
  }

  function generateDraftLineup() {
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
    const next = generateLineup(state.players, state.games, state.innings, state.fieldingSpots)
    setChangedCells(new Set())
    clearPendingForMode('current')
    commit({ ...state, currentLineup: next }, { undo: true })
    setTab('lineup')
    showToast('Generated draft lineup')
  }

  function emptyCurrentLineup() {
    const next = createBlankLineup(state.players, state.innings)
    setChangedCells(new Set())
    clearPendingForMode('current')
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

  function reorderRow(fromIndex: number, toIndex: number, mode: 'current' | 'gameday' = 'current') {
    const source = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= source.length || toIndex >= source.length) return
    const next = source.slice()
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    setLineup(next, mode)
  }

  function getRowIndexFromPointer(event: PointerEvent<HTMLElement>) {
    const element = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-lineup-row-index]')
    const rowIndex = Number(element?.dataset.lineupRowIndex)
    return Number.isFinite(rowIndex) ? rowIndex : null
  }

  function startRowPointerDrag(event: PointerEvent<HTMLButtonElement>, rowIndex: number) {
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    setDraggedRowIndex(rowIndex)
    setDragOverRowIndex(rowIndex)
  }

  function moveRowPointerDrag(event: PointerEvent<HTMLButtonElement>) {
    if (draggedRowIndex === null) return
    const rowIndex = getRowIndexFromPointer(event)
    if (rowIndex !== null) setDragOverRowIndex(rowIndex)
  }

  function finishRowPointerDrag(event: PointerEvent<HTMLButtonElement>, mode: 'current' | 'gameday' = 'current') {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const toIndex = dragOverRowIndex ?? getRowIndexFromPointer(event)
    const fromIndex = draggedRowIndex
    setDraggedRowIndex(null)
    setDragOverRowIndex(null)
    if (fromIndex !== null && toIndex !== null) reorderRow(fromIndex, toIndex, mode)
  }

  function cancelRowPointerDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDraggedRowIndex(null)
    setDragOverRowIndex(null)
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
        {!isGameDay && lineup.length > 0 && !readOnly && (
          <div className="candidate-strip">
            <button className="primary" type="button" onClick={generateDraftLineup} disabled={readOnly}>
              <Shuffle size={16} /> Generate
            </button>
            <button className="danger-outline" type="button" onClick={emptyCurrentLineup} disabled={readOnly}>
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
          </div>
        )}

        {isGameDay && lineup.length > 0 && !readOnly && (
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
            ) : !isGameDay && !readOnly && (
              <button className="primary" type="button" onClick={generateDraftLineup} disabled={readOnly}>
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
                      data-lineup-row-index={rowIndex}
                    >
                      <span className="drag-cell">
                        <button
                          type="button"
                          className="drag-handle"
                          disabled={locked}
                          onPointerDown={(event) => startRowPointerDrag(event, rowIndex)}
                          onPointerMove={moveRowPointerDrag}
                          onPointerUp={(event) => finishRowPointerDrag(event, mode)}
                          onPointerCancel={cancelRowPointerDrag}
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
                        const pending = pendingByCell.get(cellKey)
                        return (
                          <span className={pending ? 'suggested-cell' : ''} key={inning}>
                            <select
                              className={positionSelectClass(row.assignments[inning] ?? '', changedCells.has(cellKey))}
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
                          <AlertTriangle size={14} />
                          <span>{displayWarnings.join('; ')}</span>
                        </button>
                      ) : (
                        <span className="empty-warning" aria-label="No warnings"></span>
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
                {!isGameDay && !readOnly && (
                  <button type="button" onClick={saveToGameDay} disabled={readOnly}>
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
                {!readOnly && (
                  <button className="primary" type="button" onClick={() => logGame(mode)}>
                    <Save size={18} /> Log Game
                  </button>
                )}
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
          {canEdit && (
            <button type="button" onClick={renameTeam} title="Rename team">
              <Edit3 size={18} />
            </button>
          )}
          <div className="team-link-panel" aria-label="Team links">
            <button type="button" onClick={copyViewLink} disabled={!canCopyViewLink} title={canCopyViewLink ? 'Copy view-only team link' : 'Select a team for view-only sharing'}>
              <Eye size={18} /> View Link
            </button>
            {canEdit && (
              <button type="button" onClick={copyEditLink} title="Copy private edit link">
                <Copy size={18} /> Edit Link
              </button>
            )}
          </div>
          {canEdit && (
            <>
              <button type="button" onClick={exportBackup} title="Download a full team backup as JSON">
                <Download size={18} /> Backup
              </button>
              <button type="button" onClick={() => fileInput.current?.click()} title="Restore a full team backup from JSON">
                <Upload size={18} /> Restore
              </button>
            </>
          )}
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
          updatePlayerDislike={updatePlayerDislike}
          updatePlayerPreference={updatePlayerPreference}
        />
      )}

      {effectiveTab === 'history' && <SummaryTab sortedPlayers={sortedPlayers} state={state} />}

      {effectiveTab === 'fullHistory' && (
        <FullHistoryTab commit={commit} readOnly={readOnly} showToast={showToast} state={state} />
      )}
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
