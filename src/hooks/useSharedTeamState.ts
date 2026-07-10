import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState, SyncStatus } from '../types'
import { createInitialState, getTeamStorageKey, loadState, normalizeState } from '../io/storage'
import { clearQueuedSyncSave, loadQueuedSyncSave, saveQueuedSyncSave } from '../io/syncQueue'
import type { QueuedSyncSave } from '../io/syncQueue'

type UseSharedTeamStateArgs = {
  teamId: string
  currentEditToken: string
  canEdit: boolean
  onTeamLoaded: () => void
}

type CommitOptions = {
  undo?: boolean
}

class SyncConflictError extends Error {
  constructor() {
    super('Shared state changed elsewhere')
  }
}

export function useSharedTeamState({ teamId, currentEditToken, canEdit, onTeamLoaded }: UseSharedTeamStateArgs) {
  const [state, setState] = useState<AppState>(() => loadState(teamId))
  const [undoStack, setUndoStack] = useState<AppState[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading')
  const [syncMessage, setSyncMessage] = useState('Loading shared history...')
  const [syncConflict, setSyncConflict] = useState(false)
  const stateRef = useRef(state)
  const remoteRevision = useRef<string | null>(null)
  const remoteReady = useRef(false)
  const saveTimer = useRef<number | null>(null)
  const pendingRemoteSave = useRef<QueuedSyncSave | null>(null)

  const saveSharedState = useCallback(async (next: AppState, options: { baseRevision?: string | null; force?: boolean } = {}) => {
    if (!teamId) throw new Error('No team selected')
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-edit-token': currentEditToken,
    }
    if (options.baseRevision) headers['x-state-revision'] = options.baseRevision
    if (options.force) headers['x-force-save'] = 'true'

    const response = await fetch(`/api/state?team=${encodeURIComponent(teamId)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(next),
    })
    if (response.status === 409) throw new SyncConflictError()
    if (!response.ok) throw new Error(`Save failed (${response.status})`)
    return response.json() as Promise<{ ok: true; updatedAt: string }>
  }, [teamId, currentEditToken])

  const queueRemoteSave = useCallback((queued: QueuedSyncSave) => {
    pendingRemoteSave.current = queued
    saveQueuedSyncSave(teamId, queued)
  }, [teamId])

  const flushQueuedSave = useCallback(async (options: { force?: boolean } = {}) => {
    if (!teamId || !canEdit || !remoteReady.current) return
    const queued = pendingRemoteSave.current ?? loadQueuedSyncSave(teamId)
    if (!queued) return

    pendingRemoteSave.current = queued
    setSyncStatus('saving')
    setSyncMessage(options.force ? 'Overwriting shared history...' : 'Saving shared history...')

    try {
      const result = await saveSharedState(queued.state, { baseRevision: queued.baseRevision, force: options.force })
      remoteRevision.current = result.updatedAt
      pendingRemoteSave.current = null
      clearQueuedSyncSave(teamId)
      setSyncConflict(false)
      setSyncStatus('synced')
      setSyncMessage(`Shared history saved ${new Date(result.updatedAt).toLocaleTimeString()}`)
    } catch (error) {
      queueRemoteSave(queued)
      if (error instanceof SyncConflictError) {
        setSyncConflict(true)
        setSyncStatus('conflict')
        setSyncMessage('Shared history changed elsewhere; reload it or overwrite with this browser')
        return
      }
      setSyncStatus('queued')
      setSyncMessage('Saved on this browser; will retry shared save when online')
    }
  }, [canEdit, queueRemoteSave, saveSharedState, teamId])

  const scheduleRemoteSave = useCallback((next: AppState) => {
    if (!remoteReady.current) return

    queueRemoteSave({ baseRevision: remoteRevision.current, state: next })
    setSyncStatus('saving')
    setSyncMessage('Saving shared history...')

    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      void flushQueuedSave()
    }, 700)
  }, [flushQueuedSave, queueRemoteSave])

  const reloadSharedState = useCallback(async () => {
    if (!teamId) return
    setSyncStatus('loading')
    setSyncMessage('Reloading shared history...')
    const response = await fetch(`/api/state?team=${encodeURIComponent(teamId)}`, { cache: 'no-store' })
    if (!response.ok) {
      setSyncStatus('error')
      setSyncMessage(`Could not reload shared history (${response.status})`)
      return
    }

    const payload = await response.json() as { state: AppState | null; updatedAt: string | null }
    const next = payload.state ? normalizeState(payload.state) : createInitialState()
    stateRef.current = next
    remoteRevision.current = payload.updatedAt
    pendingRemoteSave.current = null
    clearQueuedSyncSave(teamId)
    setState(next)
    setUndoStack([])
    setSyncConflict(false)
    localStorage.setItem(getTeamStorageKey(teamId), JSON.stringify(next))
    setSyncStatus('synced')
    setSyncMessage(payload.updatedAt ? `Shared history reloaded ${new Date(payload.updatedAt).toLocaleTimeString()}` : 'Shared history reloaded')
  }, [teamId])

  const overwriteSharedState = useCallback(async () => {
    const queued = pendingRemoteSave.current ?? loadQueuedSyncSave(teamId) ?? { baseRevision: remoteRevision.current, state: stateRef.current }
    queueRemoteSave(queued)
    await flushQueuedSave({ force: true })
  }, [flushQueuedSave, queueRemoteSave, teamId])

  useEffect(() => {
    let cancelled = false

    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    pendingRemoteSave.current = loadQueuedSyncSave(teamId)

    async function loadSharedState() {
      onTeamLoaded()

      if (!teamId) {
        const blank = createInitialState()
        stateRef.current = blank
        setState(blank)
        setUndoStack([])
        remoteRevision.current = null
        remoteReady.current = false
        pendingRemoteSave.current = null
        clearQueuedSyncSave(teamId)
        setSyncConflict(false)
        setSyncStatus('synced')
        setSyncMessage('Choose a team to view')
        return
      }

      const localState = loadState(teamId)
      stateRef.current = localState
      setState(localState)
      setUndoStack([])
      remoteRevision.current = null
      remoteReady.current = false
      setSyncConflict(false)
      setSyncStatus('loading')
      setSyncMessage('Loading shared history...')

      try {
        const response = await fetch(`/api/state?team=${encodeURIComponent(teamId)}`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`Shared history unavailable (${response.status})`)

        const payload = await response.json() as { state: AppState | null; updatedAt: string | null }
        if (cancelled) return

        remoteRevision.current = payload.updatedAt
        const queued = loadQueuedSyncSave(teamId)

        if (queued && canEdit) {
          const next = normalizeState(queued.state)
          stateRef.current = next
          setState(next)
          localStorage.setItem(getTeamStorageKey(teamId), JSON.stringify(next))
          remoteReady.current = true
          setSyncStatus('queued')
          setSyncMessage('Unsynced local changes found; retrying shared save')
          void flushQueuedSave()
        } else if (payload.state) {
          const next = normalizeState(payload.state)
          stateRef.current = next
          setState(next)
          localStorage.setItem(getTeamStorageKey(teamId), JSON.stringify(next))
          setSyncStatus('synced')
          setSyncMessage(payload.updatedAt ? `Shared history synced ${new Date(payload.updatedAt).toLocaleString()}` : 'Shared history synced')
        } else if (canEdit) {
          remoteReady.current = true
          const result = await saveSharedState(stateRef.current)
          if (cancelled) return
          remoteRevision.current = result.updatedAt
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
      const pending = pendingRemoteSave.current
      if (pending) {
        saveQueuedSyncSave(teamId, pending)
      }
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      pendingRemoteSave.current = null
    }
  }, [teamId, canEdit, flushQueuedSave, onTeamLoaded, saveSharedState])

  useEffect(() => {
    function retryQueuedSave() {
      void flushQueuedSave()
    }

    window.addEventListener('online', retryQueuedSave)
    window.addEventListener('focus', retryQueuedSave)
    return () => {
      window.removeEventListener('online', retryQueuedSave)
      window.removeEventListener('focus', retryQueuedSave)
    }
  }, [flushQueuedSave])

  const commit = useCallback((next: AppState, options: CommitOptions = {}) => {
    if (!canEdit) {
      setSyncStatus('local')
      setSyncMessage(teamId ? 'View-only link; open the private edit link to save changes' : 'Choose a team to view')
      return
    }
    if (options.undo) {
      setUndoStack((current) => current.concat(stateRef.current).slice(-10))
    }
    stateRef.current = next
    setState(next)
    localStorage.setItem(getTeamStorageKey(teamId), JSON.stringify(next))
    scheduleRemoteSave(next)
  }, [canEdit, scheduleRemoteSave, teamId])

  return {
    commit,
    setState,
    setSyncMessage,
    setSyncStatus,
    setUndoStack,
    reloadSharedState,
    overwriteSharedState,
    state,
    stateRef,
    syncConflict,
    syncMessage,
    syncStatus,
    undoStack,
  }
}
