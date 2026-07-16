import {
  BarChart3,
  ClipboardList,
  Edit3,
  Image as ImageIcon,
  List,
  ListPlus,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ChangeEvent } from 'react'
import './styles/base.css'
import './styles/lineup.css'
import './App.css'
import './styles/reorder.css'
import { AppActionsMenu } from './components/AppActionsMenu'
import { LinkDialog, TextEntryDialog } from './components/AppDialog'
import { FullHistoryTab } from './components/FullHistoryTab'
import { LineupTab } from './components/LineupTab'
import { ParentGameCard } from './components/ParentGameCard'
import { FieldStarLockup } from './components/FieldStarBrand'
import { PrintCard } from './components/PrintCard'
import { RosterTab } from './components/RosterTab'
import { SummaryTab } from './components/SummaryTab'
import { TeamHome } from './components/TeamHome'
import { useSharedTeamState } from './hooks/useSharedTeamState'
import { useToast } from './hooks/useToast'
import { createBlankLineup, fixLineupInning, generateLineup, isFieldingPosition } from './engine/lineup'
import { getRosterLineupDiff, syncLineupToRoster } from './engine/sync'
import { applyAssignmentEdit, getLineupChangeKey, getPendingLineupChanges, lineupWithChanges } from './engine/changes'
import { createLineupCardBlob } from './io/lineupImage'
import { DEFAULT_TEAM_ID, createEmptyTeamState, createInitialState, downloadFile, formatLineupText, getAdminTokenFromUrl, getEditTokenFromUrl, getInitialTeamId, getStoredAdminToken, getStoredTeams, getStoredTokens, getTeamUrl, getDuplicatePlayerIds, getSyncLabel, isPlaceholderPlayer, makeId, removeUrlParam, saveStoredAdminToken, saveStoredLastEditTeamId, saveStoredTeams, saveStoredTokens, slugify, today } from './io/storage'
import { getTeamLogo } from './teamLogos'
import { MAX_INNINGS, MIN_INNINGS } from './types'
import type { AppState, FieldingPosition, GameLog, LineupDraft, LineupMode, LineupRow, PendingChange, Player, Position, TeamSummary, TeamTokenMap } from './types'

const MAX_LOGO_DATA_URL_LENGTH = 120_000
const LOGO_SIZE = 128

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image'))
    }
    image.src = url
  })
}

async function resizeTeamLogo(file: File) {
  const image = await loadImage(file)
  const scale = Math.min(1, LOGO_SIZE / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not resize image')
  context.drawImage(image, 0, 0, width, height)
  const dataUrl = canvas.toDataURL('image/webp', 0.86)
  if (dataUrl.length > MAX_LOGO_DATA_URL_LENGTH) throw new Error('Logo image is too large')
  return dataUrl
}

function formatConflictTime(value: string | null) {
  if (!value) return ''
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return ''
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
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
  const [tab, setTab] = useState<'lineup' | 'gameday' | 'roster' | 'summary' | 'history' | 'fullHistory'>('lineup')
  const [acceptedChangeCells, setAcceptedChangeCells] = useState<Set<string>>(() => new Set())
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [rowAnimationKeys, setRowAnimationKeys] = useState<Record<LineupMode, number>>({ current: 0, gameday: 0 })
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const { dismissToast, toast, showToast } = useToast()
  const [printMode, setPrintMode] = useState<'current' | 'gameday' | null>(null)
  const [teamNameDialog, setTeamNameDialog] = useState<{ mode: 'create' | 'rename'; value: string } | null>(null)
  const [linkDialog, setLinkDialog] = useState<{ title: string; value: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const logoInput = useRef<HTMLInputElement>(null)
  const currentTeam = teams.find((team) => team.id === teamId) ?? { id: teamId, name: teamId ? 'Shared team' : 'Choose a team' }
  const currentTeamLogo = getTeamLogo(currentTeam)
  const currentEditToken = editTokens[teamId] ?? ''
  const canEdit = Boolean(teamId && currentEditToken)
  const readOnly = !canEdit
  const canCreateTeams = Boolean(adminToken)
  const canCopyViewLink = Boolean(teamId)
  const visibleTeams = teams.filter((team) => team.listed !== false || Boolean(editTokens[team.id]) || team.id === teamId)
  const handleTeamLoaded = useCallback(() => {
    setPendingChanges([])
  }, [])
  const {
    commit,
    overwriteSharedState,
    reloadSharedState,
    setSyncMessage,
    setSyncStatus,
    setUndoStack,
    state,
    syncConflict,
    syncConflictRevision,
    syncMessage,
    syncStatus,
    undoStack,
  } = useSharedTeamState({
    teamId,
    currentEditToken,
    canEdit,
    onTeamLoaded: handleTeamLoaded,
  })
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
  const currentPendingCount = pendingChanges.filter((change) => change.mode === 'current').length
  const blankPlayerCount = state.players.filter((player) => !player.name.trim()).length
  const presentCount = state.players.filter((player) => player.present && player.name.trim()).length
  const normalizedTab = tab === 'gameday' ? 'lineup' : tab === 'history' ? 'fullHistory' : tab
  const effectiveTab = teamId && rosterPlayers.length === 0 && normalizedTab === 'lineup' ? 'roster' : normalizedTab
  const currentLineupDiff = useMemo(
    () => getRosterLineupDiff(state.currentLineup, state.players),
    [state.currentLineup, state.players],
  )
  const conflictSavedAt = formatConflictTime(syncConflictRevision)
  useEffect(() => {
    fetch('/api/teams', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Teams unavailable')
        return response.json() as Promise<{ teams: TeamSummary[] }>
      })
      .then((payload) => {
        const remoteTeams = payload.teams
          .filter((team) => team.id !== DEFAULT_TEAM_ID)
          .map((team) => ({ ...team, listed: team.listed ?? true }))
        const retainedUnlisted = teams.filter((team) => team.listed === false && editTokens[team.id])
        const merged = retainedUnlisted.concat(remoteTeams)
        if (
          merged.length !== teams.length ||
          merged.some((team, index) => team.name !== teams[index]?.name || team.logoDataUrl !== teams[index]?.logoDataUrl || team.listed !== teams[index]?.listed)
        ) {
          rememberTeams(merged)
        }
      })
      .catch(() => undefined)
  }, [editTokens, teams])

  useEffect(() => {
    if (!teamId || teams.some((team) => team.id === teamId)) return
    fetch(`/api/teams?ids=${encodeURIComponent(teamId)}`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Team unavailable')
        return response.json() as Promise<{ teams: TeamSummary[] }>
      })
      .then((payload) => {
        const team = payload.teams.find((item) => item.id === teamId)
        if (team) rememberTeams([...teams, { ...team, listed: team.listed ?? true }])
      })
      .catch(() => undefined)
  }, [teamId, teams])

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

  function createTeam() {
    if (!canCreateTeams) return
    setTeamNameDialog({ mode: 'create', value: 'Julian' })
  }

  async function createTeamWithName(name: string) {
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

  function renameTeam() {
    if (!canEdit) return
    setTeamNameDialog({ mode: 'rename', value: currentTeam.name })
  }

  async function renameTeamWithName(name: string) {
    if (name.trim() === currentTeam.name) return

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

  function confirmTeamName() {
    if (!teamNameDialog?.value.trim()) return
    const { mode, value } = teamNameDialog
    setTeamNameDialog(null)
    if (mode === 'create') void createTeamWithName(value.trim())
    else void renameTeamWithName(value.trim())
  }

  async function updateTeamLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !canEdit) return

    try {
      const logoDataUrl = await resizeTeamLogo(file)
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-edit-token': currentEditToken },
        body: JSON.stringify({ logoDataUrl }),
      })
      if (!response.ok) throw new Error(`Logo update failed (${response.status})`)

      const payload = await response.json() as { team: TeamSummary }
      rememberTeams(teams.map((team) => (team.id === teamId ? payload.team : team)))
      setSyncStatus('synced')
      setSyncMessage('Team logo updated')
      showToast('Team logo updated')
    } catch {
      setSyncStatus('error')
      setSyncMessage('Could not update team logo')
      showToast('Could not update team logo')
    }
  }

  async function updateTeamListing(listed: boolean) {
    if (!canEdit) return

    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-edit-token': currentEditToken },
        body: JSON.stringify({ listed }),
      })
      if (!response.ok) throw new Error(`Listing update failed (${response.status})`)

      const payload = await response.json() as { team: TeamSummary }
      rememberTeams(teams.map((team) => (team.id === teamId ? { ...payload.team, listed: payload.team.listed ?? true } : team)))
      setSyncStatus('synced')
      setSyncMessage(listed ? 'Team listed in picker' : 'Team hidden from picker')
      showToast(listed ? 'Team listed in picker' : 'Team hidden from picker')
    } catch {
      setSyncStatus('error')
      setSyncMessage('Could not update team listing')
      showToast('Could not update team listing')
    }
  }

  async function copyEditLink() {
    if (!canEdit) return
    const link = getTeamUrl(teamId, currentEditToken, currentTeam.name)
    try {
      await navigator.clipboard.writeText(link)
      setSyncStatus('synced')
      setSyncMessage('Coach edit link copied')
      showToast('Coach edit link copied')
    } catch {
      setLinkDialog({ title: 'Coach edit link', value: link })
    }
  }

  async function copyViewLink() {
    if (!canCopyViewLink) return
    const link = getTeamUrl(teamId, undefined, currentTeam.name)
    try {
      await navigator.clipboard.writeText(link)
      setSyncStatus('synced')
      setSyncMessage('Parent view-only link copied')
      showToast('Parent view-only link copied')
    } catch {
      setLinkDialog({ title: 'Parent view-only link', value: link })
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

  useEffect(() => {
    function showUpdateReady() {
      showToast('FieldStar updated — the latest version is ready')
    }
    window.addEventListener('fieldstar:update-ready', showUpdateReady)
    return () => window.removeEventListener('fieldstar:update-ready', showUpdateReady)
  }, [showToast])

  function clearPendingForMode(mode: LineupMode) {
    setPendingChanges((current) => current.filter((change) => change.mode !== mode))
  }

  function clearPendingForCell(mode: LineupMode, playerId: string, inning: number) {
    const key = getLineupChangeKey(mode, playerId, inning)
    setPendingChanges((current) => current.filter((change) => change.id !== key))
  }

  function restoreState(previous: AppState) {
    setAcceptedChangeCells(new Set())
    setPendingChanges([])
    commit(previous)
  }

  function showUndoToast(message: string, previous: AppState) {
    showToast(message, { label: 'Undo', onClick: () => restoreState(previous) })
  }

  function hasMeaningfulLineup(lineup: LineupRow[]) {
    return lineup.length > 0 && lineup.some((row) => row.playerName.trim() && row.assignments.some(Boolean))
  }

  function nextDraftName(drafts: LineupDraft[]) {
    return `Snapshot ${drafts.length + 1}`
  }

  function createLineupDraft(lineup: LineupRow[], name = nextDraftName(state.lineupDrafts)): LineupDraft {
    return {
      id: makeId(),
      name,
      createdAt: new Date().toISOString(),
      fieldingSpots: state.fieldingSpots,
      innings: state.innings,
      lineup: lineup.map((row) => ({ ...row, assignments: row.assignments.slice() })),
    }
  }

  function saveCurrentLineupDraft() {
    if (!hasMeaningfulLineup(state.currentLineup)) {
      showToast('No lineup to save yet')
      return
    }
    const previous = state
    const draft = createLineupDraft(state.currentLineup)
    commit({ ...state, lineupDrafts: [...state.lineupDrafts, draft] }, { undo: true })
    showUndoToast(`${draft.name} saved`, previous)
  }

  function loadLineupDraft(draftId: string) {
    const draft = state.lineupDrafts.find((item) => item.id === draftId)
    if (!draft) return
    const previous = state
    clearPendingForMode('current')
    commit({
      ...state,
      currentLineup: draft.lineup.map((row) => ({ ...row, assignments: row.assignments.slice() })),
      fieldingSpots: draft.fieldingSpots,
      gameDayLocked: false,
      gameDayLogInnings: Math.min(state.gameDayLogInnings, draft.innings),
      innings: draft.innings,
    }, { undo: true })
    setTab('lineup')
    showUndoToast(`${draft.name} loaded`, previous)
  }

  function deleteLineupDraft(draftId: string) {
    const draft = state.lineupDrafts.find((item) => item.id === draftId)
    if (!draft) return
    const previous = state
    commit({ ...state, lineupDrafts: state.lineupDrafts.filter((item) => item.id !== draftId) }, { undo: true })
    showUndoToast(`${draft.name} deleted`, previous)
  }

  function clearLineupDrafts() {
    if (state.lineupDrafts.length === 0) return
    const previous = state
    commit({ ...state, lineupDrafts: [] }, { undo: true })
    showUndoToast('Snapshots cleared', previous)
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
    const previous = state
    commit({
      ...state,
      players: state.players.filter((player) => player.id !== id),
      currentLineup: state.currentLineup.filter((row) => row.playerId !== id),
      gameDayLineup: state.gameDayLineup.filter((row) => row.playerId !== id),
    })
    showUndoToast('Player removed', previous)
  }

  function addPlayer() {
    commit({
      ...state,
      players: [...state.players, { id: makeId(), name: '', present: true, notes: '', preferredPositions: [], dislikedPositions: [] }],
    })
    setTab('roster')
  }

  function addPlayers(names: string[]) {
    const existingNames = new Set(state.players.map((player) => player.name.trim().toLowerCase()).filter(Boolean))
    const nextPlayers = names
      .map((name) => name.trim())
      .filter(Boolean)
      .filter((name) => !existingNames.has(name.toLowerCase()))
      .map((name) => ({ id: makeId(), name, present: true, notes: '', preferredPositions: [], dislikedPositions: [] }))
    if (!nextPlayers.length) {
      showToast('No new players to add')
      return
    }
    const previous = state
    commit({ ...state, players: [...state.players, ...nextPlayers] }, { undo: true })
    setTab('roster')
    showUndoToast(`Added ${nextPlayers.length} player${nextPlayers.length === 1 ? '' : 's'}`, previous)
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
    const savedDraft = hasMeaningfulLineup(state.currentLineup) ? createLineupDraft(state.currentLineup) : null
    const next = generateLineup(state.players, state.games, state.innings, state.fieldingSpots)
    setAcceptedChangeCells(new Set())
    clearPendingForMode('current')
    commit({
      ...state,
      currentLineup: next,
      gameDayLocked: false,
      gameDayLogInnings: Math.min(state.gameDayLogInnings, state.innings),
      lineupDrafts: savedDraft ? [...state.lineupDrafts, savedDraft] : state.lineupDrafts,
    }, { undo: true })
    setTab('lineup')
    showToast(savedDraft ? `Generated lineup; saved previous as ${savedDraft.name}` : 'Generated lineup')
  }

  function emptyCurrentLineup() {
    const previous = state
    const next = createBlankLineup(state.players, state.innings)
    setAcceptedChangeCells(new Set())
    clearPendingForMode('current')
    commit({ ...state, currentLineup: next }, { undo: true })
    setTab('lineup')
    showUndoToast('Lineup cleared', previous)
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
    const result = applyAssignmentEdit(source, rowIndex, inning, value)
    if (!result) return

    result.changedCells.forEach((cell) => clearPendingForCell(mode, cell.playerId, cell.inning))
    commitLineupChange(source, result.lineup, mode, mode === 'gameday' ? { ...state, gameDayLineup: result.lineup } : { ...state, currentLineup: result.lineup })
  }

  function reorderRow(fromIndex: number, toIndex: number, mode: 'current' | 'gameday' = 'current') {
    const source = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= source.length || toIndex >= source.length) return
    const next = source.slice()
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    setRowAnimationKeys((current) => ({ ...current, [mode]: current[mode] + 1 }))
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
    showToast(`${source.find((row) => row.playerId === playerId)?.playerName ?? 'Player'} marked out; review cleanup suggestions`)
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
    showToast(`${player.name} checked back in; review lineup suggestions`)
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

  function logGame(mode: 'current' | 'gameday' = 'current', date = state.gameDate) {
    const lineup = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    if (!lineup.length) return
    const previous = state
    const loggedInnings = Math.min(state.gameDayLogInnings, state.innings)
    const game: GameLog = {
      id: makeId(),
      date,
      innings: loggedInnings,
      fieldingSpots: state.fieldingSpots,
      lineup: lineup.map((row) => ({ ...row, assignments: row.assignments.slice(0, loggedInnings) })),
    }
    commit({
      ...state,
      games: [...state.games, game],
      currentLineup: mode === 'current' ? createBlankLineup(state.players, state.innings) : state.currentLineup,
      gameDayLineup: mode === 'gameday' ? [] : state.gameDayLineup,
      gameDayLocked: false,
      gameDate: today(),
    })
    setTab('fullHistory')
    showUndoToast('Game logged', previous)
  }

  function clearGameDay() {
    const previous = state
    clearPendingForMode('gameday')
    commit({
      ...state,
      gameDayLineup: [],
      gameDayLocked: false,
      gameDayLogInnings: state.innings,
    }, { undo: true })
    showUndoToast('Gameday cleared', previous)
  }

  function setGameDayLocked(locked: boolean) {
    commit({ ...state, gameDayLocked: locked })
  }

  function setGameDayLogInnings(innings: number) {
    commit({ ...state, gameDayLogInnings: Math.max(MIN_INNINGS, Math.min(state.innings, innings)) })
  }

  function addLineupInning() {
    if (state.innings >= MAX_INNINGS) return
    const previous = state
    const innings = state.innings + 1
    setAcceptedChangeCells(new Set())
    setPendingChanges([])
    commit({
      ...state,
      innings,
      gameDayLogInnings: innings,
      currentLineup: state.currentLineup.map((row) => ({
        ...row,
        assignments: [...row.assignments, ''],
      })),
      gameDayLineup: state.gameDayLineup.map((row) => ({
        ...row,
        assignments: [...row.assignments, ''],
      })),
    }, { undo: true })
    showUndoToast(`Inning ${innings} added`, previous)
  }

  function removeLineupInning(inningIndex: number) {
    if (state.innings <= MIN_INNINGS) return
    const previous = state
    const innings = state.innings - 1
    const safeIndex = Math.max(0, Math.min(state.innings - 1, inningIndex))
    setAcceptedChangeCells(new Set())
    setPendingChanges([])
    commit({
      ...state,
      innings,
      gameDayLogInnings: Math.min(state.gameDayLogInnings, innings),
      currentLineup: state.currentLineup.map((row) => ({
        ...row,
        assignments: row.assignments.filter((_, index) => index !== safeIndex),
      })),
      gameDayLineup: state.gameDayLineup.map((row) => ({
        ...row,
        assignments: row.assignments.filter((_, index) => index !== safeIndex),
      })),
    }, { undo: true })
    showUndoToast(`Inning ${safeIndex + 1} removed`, previous)
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

  async function shareLineupImage(mode: 'current' | 'gameday' = 'current') {
    const lineup = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
    if (!lineup.length) {
      showToast('Generate a lineup first')
      return
    }

    try {
      const blob = await createLineupCardBlob(currentTeam, lineup, state.gameDate, state.innings)
      const filename = `fieldstar-${slugify(currentTeam.name)}-${state.gameDate}.png`
      const file = new File([blob], filename, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${currentTeam.name} lineup` })
        return
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
      showToast('Lineup card downloaded')
    } catch {
      showToast('Could not create lineup card')
    }
  }

  function exportBackup() {
    downloadFile(`lineup-coach-${slugify(currentTeam.name)}-${today()}.json`, JSON.stringify(state, null, 2), 'application/json')
  }

  function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const previous = state
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result)) as AppState
        commit({ ...createInitialState(), ...imported })
        showUndoToast('Backup restored', previous)
      } catch {
        showToast('Could not read that backup file')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const pageStyle = currentTeamLogo && teamId
    ? ({
        '--team-watermark-image': `url("${currentTeamLogo}")`,
      } as CSSProperties)
    : undefined

  return (
    <main style={pageStyle}>
      <PrintCard printMode={printMode} state={state} />
      {teamNameDialog && (
        <TextEntryDialog
          confirmLabel={teamNameDialog.mode === 'create' ? 'Create Team' : 'Save Name'}
          label="Team name"
          onCancel={() => setTeamNameDialog(null)}
          onChange={(value) => setTeamNameDialog((current) => current ? { ...current, value } : current)}
          onConfirm={confirmTeamName}
          title={teamNameDialog.mode === 'create' ? 'Create a team' : 'Rename team'}
          value={teamNameDialog.value}
        />
      )}
      {linkDialog && (
        <LinkDialog
          onClose={() => setLinkDialog(null)}
          onCopied={() => showToast(`${linkDialog.title} copied`)}
          title={linkDialog.title}
          value={linkDialog.value}
        />
      )}
      <header className="app-header">
        <div className="brand-lockup">
          <FieldStarLockup markSize={54} onDark />
          {teamId && <p className="eyebrow">{currentTeam.name}</p>}
          {currentTeamLogo && teamId && (
            <img className="team-header-logo" src={currentTeamLogo} alt="" />
          )}
        </div>
        <div className="header-actions">
          <span className={`sync-status ${syncStatus}`} title={syncMessage}>
            {getSyncLabel(syncStatus)}
          </span>
          <label className="team-picker">
            Team
            <select value={teamId} onChange={(event) => switchTeam(event.target.value)}>
              <option value="">Choose team</option>
              {visibleTeams.map((team) => (
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
          {canEdit && (
            <button type="button" onClick={() => logoInput.current?.click()} title="Change team logo">
              <ImageIcon size={18} />
            </button>
          )}
          <AppActionsMenu
            canCopyViewLink={canCopyViewLink}
            canEdit={canEdit}
            currentLineupCount={state.currentLineup.length}
            isListed={currentTeam.listed !== false}
            onBackup={exportBackup}
            onCopyEditLink={() => { void copyEditLink() }}
            onCopyViewLink={() => { void copyViewLink() }}
            onRestore={() => fileInput.current?.click()}
            onShareCard={() => { void shareLineupImage('current') }}
            onShareText={() => { void shareLineup('current') }}
            onToggleListed={() => { void updateTeamListing(currentTeam.listed === false) }}
            open={actionMenuOpen}
            setOpen={setActionMenuOpen}
          />
          <input ref={fileInput} className="hidden" type="file" accept="application/json" onChange={importBackup} />
          <input ref={logoInput} className="hidden" type="file" accept="image/*" onChange={updateTeamLogo} />
        </div>
      </header>

      {syncConflict && canEdit && (
        <section className="sync-conflict-banner" role="status">
          <div>
            <strong>Another coach saved changes{conflictSavedAt ? ` at ${conflictSavedAt}` : ''}</strong>
            <span>Your edits are still safe on this phone. Choose which version to keep.</span>
          </div>
          <button type="button" onClick={reloadSharedState}>
            See Theirs
          </button>
          <button className="danger-outline" type="button" onClick={overwriteSharedState}>
            Keep Mine
          </button>
        </section>
      )}

      {!teamId ? (
        <TeamHome canCreateTeams={canCreateTeams} editTokens={editTokens} onCreateTeam={createTeam} onSwitchTeam={switchTeam} teams={visibleTeams} />
      ) : readOnly ? (
        <ParentGameCard onShareLineup={() => shareLineup('current')} state={state} team={currentTeam} />
      ) : (
        <>
      <nav className="tabs" aria-label="Views">
        <button type="button" className={effectiveTab === 'lineup' ? 'active' : ''} onClick={() => setTab('lineup')}>
          <ClipboardList size={18} /> Lineup
          {currentPendingCount > 0 && <span className="tab-badge">{currentPendingCount}</span>}
        </button>
        <button type="button" className={effectiveTab === 'roster' ? 'active' : ''} onClick={() => setTab('roster')}>
          <Users size={18} /> Roster
        </button>
        <button type="button" className={effectiveTab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>
          <BarChart3 size={18} /> Summary
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
          onAddLineupInning={addLineupInning}
          onApplyPendingChanges={applyPendingChanges}
          onClearGameDay={clearGameDay}
          onClearAcceptedChangeCell={clearAcceptedChangeCell}
          onClearLineupDrafts={clearLineupDrafts}
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
          onSaveLineupDraft={saveCurrentLineupDraft}
          onLoadLineupDraft={loadLineupDraft}
          onDeleteLineupDraft={deleteLineupDraft}
          onScratchGameDayPlayer={scratchGameDayPlayer}
          onSetGameDayLocked={setGameDayLocked}
          onSetGameDayLogInnings={setGameDayLogInnings}
          onSetPrintMode={setPrintMode}
          onShareLineup={shareLineup}
          onShowRoster={() => setTab('roster')}
          onRemoveLineupInning={removeLineupInning}
          onUndoLastChange={undoLastChange}
          onUpdateAssignment={updateAssignment}
          onUpdateLineupFromRoster={updateLineupFromRoster}
          pendingChanges={pendingChanges}
          readOnly={readOnly}
          rowAnimationKey={rowAnimationKeys.current}
          rosterDiff={currentLineupDiff}
          rosterPlayers={rosterPlayers}
          showHistoryPanel
          state={state}
          undoStackLength={undoStack.length}
        />
      )}

      {effectiveTab === 'roster' && (
        <RosterTab
          addPlayer={addPlayer}
          addPlayers={addPlayers}
          blankPlayerCount={blankPlayerCount}
          deleteUnusedPlayer={deleteUnusedPlayer}
          duplicatePlayerIds={duplicatePlayerIds}
          finishPlayerNameEdit={finishPlayerNameEdit}
          readOnly={readOnly}
          sortedPlayers={sortedPlayers}
          state={state}
          updatePlayer={updatePlayer}
          updatePlayerDislike={updatePlayerDislike}
          updatePlayerPreference={updatePlayerPreference}
        />
      )}

      {effectiveTab === 'summary' && (
        <SummaryTab state={state} />
      )}

      {effectiveTab === 'fullHistory' && (
        <FullHistoryTab commit={commit} readOnly={readOnly} showToast={showToast} state={state} />
      )}
        </>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              onClick={() => {
                toast.onAction?.()
                dismissToast()
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
      <footer className="app-footer">
        <strong>fieldstar</strong> · Every kid plays the field. Ask your coach for edit access.
      </footer>
    </main>
  )
}

export default App
