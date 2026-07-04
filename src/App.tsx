import {
  ClipboardList,
  Copy,
  Download,
  Edit3,
  Eye,
  History,
  List,
  ListPlus,
  Save,
  Upload,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import './styles/base.css'
import './styles/lineup.css'
import './App.css'
import './styles/reorder.css'
import { FullHistoryTab } from './components/FullHistoryTab'
import { LineupTab } from './components/LineupTab'
import { PrintCard } from './components/PrintCard'
import { RosterTab } from './components/RosterTab'
import { SummaryTab } from './components/SummaryTab'
import { TeamHome } from './components/TeamHome'
import { useSharedTeamState } from './hooks/useSharedTeamState'
import { useToast } from './hooks/useToast'
import { createBlankLineup, fixLineupInning, generateLineup, isFieldingPosition } from './engine/lineup'
import { getTotals } from './engine/totals'
import { getRosterLineupDiff, syncLineupToRoster } from './engine/sync'
import { getLineupChangeKey, getPendingLineupChanges, lineupWithChanges } from './engine/changes'
import { DEFAULT_TEAM_ID, createEmptyTeamState, createInitialState, downloadFile, formatLineupText, getAdminTokenFromUrl, getEditTokenFromUrl, getInitialTeamId, getStoredAdminToken, getStoredTeams, getStoredTokens, getTeamUrl, getDuplicatePlayerIds, getSyncLabel, isPlaceholderPlayer, makeId, normalizeInnings, removeUrlParam, saveStoredAdminToken, saveStoredLastEditTeamId, saveStoredTeams, saveStoredTokens, slugify, today } from './io/storage'
import { MAX_INNINGS, MIN_INNINGS } from './types'
import type { AppState, FieldingPosition, GameLog, LineupMode, LineupRow, PendingChange, Player, Position, TeamSummary, TeamTokenMap } from './types'

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
  const [acceptedChangeCells, setAcceptedChangeCells] = useState<Set<string>>(() => new Set())
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const { toast, showToast } = useToast()
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
    setAcceptedChangeCells(new Set())
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
    setAcceptedChangeCells(new Set())
    clearPendingForMode('current')
    commit({ ...state, currentLineup: next }, { undo: true })
    setTab('lineup')
    showToast('Generated draft lineup')
  }

  function emptyCurrentLineup() {
    const next = createBlankLineup(state.players, state.innings)
    setAcceptedChangeCells(new Set())
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
    setAcceptedChangeCells(new Set(getPendingLineupChanges(before, after, state.innings, mode, 'Accepted change').map((change) => change.id)))
    commit(nextState, { undo: true })
  }

  function clearAcceptedChangeCell(key: string) {
    setAcceptedChangeCells((current) => {
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

  function scratchGameDayPlayer(playerId: string, scratchFromInning: number) {
    const source = state.gameDayLineup
    const startInning = Math.max(0, Math.min(state.innings - 1, scratchFromInning - 1))
    const forcedSitterIds = new Set([playerId])
    const scratched = Array.from({ length: state.innings - startInning }, (_, index) => startInning + index).reduce(
      (lineup, inning) => fixLineupInning(lineup, state.players, state.games, state.innings, state.fieldingSpots, inning, { forcedSitterIds }),
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

      {effectiveTab === 'lineup' && (
        <LineupTab
          acceptedChangeCells={acceptedChangeCells}
          mode="current"
          onAcceptPendingChange={acceptPendingChange}
          onAddLineupPlayer={addLineupPlayer}
          onApplyPendingChanges={applyPendingChanges}
          onClearAcceptedChangeCell={clearAcceptedChangeCell}
          onEmptyCurrentLineup={emptyCurrentLineup}
          onFixInning={fixInning}
          onFixPlayerRepeats={fixPlayerRepeats}
          onGenerateDraftLineup={generateDraftLineup}
          onLogGame={logGame}
          onRegenerateFromRoster={regenerateFromRoster}
          onRejectPendingChange={rejectPendingChange}
          onRemoveLineupPlayer={removeLineupPlayer}
          onReorderRow={reorderRow}
          onRevertPendingChanges={(mode) => setPendingChanges((current) => current.filter((change) => change.mode !== mode))}
          onSaveToGameDay={saveToGameDay}
          onScratchGameDayPlayer={scratchGameDayPlayer}
          onSetGameDayLocked={setGameDayLocked}
          onSetGameDayLogInnings={setGameDayLogInnings}
          onSetPrintMode={setPrintMode}
          onShareLineup={shareLineup}
          onShowRoster={() => setTab('roster')}
          onUndoLastChange={undoLastChange}
          onUpdateAssignment={updateAssignment}
          onUpdateLineupFromRoster={updateLineupFromRoster}
          pendingChanges={pendingChanges}
          readOnly={readOnly}
          rosterDiff={currentLineupDiff}
          rosterPlayers={rosterPlayers}
          showHistoryPanel
          state={state}
          undoStackLength={undoStack.length}
        />
      )}
      {effectiveTab === 'gameday' && (
        <LineupTab
          acceptedChangeCells={acceptedChangeCells}
          mode="gameday"
          onAcceptPendingChange={acceptPendingChange}
          onAddLineupPlayer={addLineupPlayer}
          onApplyPendingChanges={applyPendingChanges}
          onClearAcceptedChangeCell={clearAcceptedChangeCell}
          onEmptyCurrentLineup={emptyCurrentLineup}
          onFixInning={fixInning}
          onFixPlayerRepeats={fixPlayerRepeats}
          onGenerateDraftLineup={generateDraftLineup}
          onLogGame={logGame}
          onRegenerateFromRoster={regenerateFromRoster}
          onRejectPendingChange={rejectPendingChange}
          onRemoveLineupPlayer={removeLineupPlayer}
          onReorderRow={reorderRow}
          onRevertPendingChanges={(mode) => setPendingChanges((current) => current.filter((change) => change.mode !== mode))}
          onSaveToGameDay={saveToGameDay}
          onScratchGameDayPlayer={scratchGameDayPlayer}
          onSetGameDayLocked={setGameDayLocked}
          onSetGameDayLogInnings={setGameDayLogInnings}
          onSetPrintMode={setPrintMode}
          onShareLineup={shareLineup}
          onShowRoster={() => setTab('roster')}
          onUndoLastChange={undoLastChange}
          onUpdateAssignment={updateAssignment}
          onUpdateLineupFromRoster={updateLineupFromRoster}
          pendingChanges={pendingChanges}
          readOnly={readOnly}
          rosterDiff={gameDayLineupDiff}
          rosterPlayers={rosterPlayers}
          showHistoryPanel
          state={state}
          undoStackLength={undoStack.length}
        />
      )}

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
