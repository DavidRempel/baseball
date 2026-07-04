import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppState, SyncStatus } from '../types'
import { createInitialState, getTeamStorageKey, loadState, normalizeState } from '../io/storage'

type UseSharedTeamStateArgs = {
  teamId: string
  currentEditToken: string
  canEdit: boolean
  onTeamLoaded: () => void
}

type CommitOptions = {
  undo?: boolean
}

export function useSharedTeamState({ teamId, currentEditToken, canEdit, onTeamLoaded }: UseSharedTeamStateArgs) {
  const [state, setState] = useState<AppState>(() => loadState(teamId))
  const [undoStack, setUndoStack] = useState<AppState[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading')
  const [syncMessage, setSyncMessage] = useState('Loading shared history...')
  const stateRef = useRef(state)
  const remoteReady = useRef(false)
  const saveTimer = useRef<number | null>(null)
  const pendingRemoteState = useRef<AppState | null>(null)

  const saveSharedState = useCallback(async (next: AppState) => {
    if (!teamId) throw new Error('No team selected')
    const response = await fetch(`/api/state?team=${encodeURIComponent(teamId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-edit-token': currentEditToken },
      body: JSON.stringify(next),
    })
    if (!response.ok) throw new Error(`Save failed (${response.status})`)
    return response.json() as Promise<{ ok: true; updatedAt: string }>
  }, [teamId, currentEditToken])

  const scheduleRemoteSave = useCallback((next: AppState) => {
    if (!remoteReady.current) return

    pendingRemoteState.current = next
    setSyncStatus('saving')
    setSyncMessage('Saving shared history...')

    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const stateToSave = pendingRemoteState.current
      pendingRemoteState.current = null
      saveTimer.current = null
      if (!stateToSave) return

      saveSharedState(stateToSave)
        .then((result) => {
          setSyncStatus('synced')
          setSyncMessage(`Shared history saved ${new Date(result.updatedAt).toLocaleTimeString()}`)
        })
        .catch(() => {
          setSyncStatus('error')
          setSyncMessage('Saved on this browser only; shared save failed')
        })
    }, 700)
  }, [saveSharedState])

  useEffect(() => {
    let cancelled = false

    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    pendingRemoteState.current = null

    async function loadSharedState() {
      onTeamLoaded()

      if (!teamId) {
        const blank = createInitialState()
        stateRef.current = blank
        setState(blank)
        setUndoStack([])
        remoteReady.current = false
        setSyncStatus('synced')
        setSyncMessage('Choose a team to view')
        return
      }

      const localState = loadState(teamId)
      stateRef.current = localState
      setState(localState)
      setUndoStack([])
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
      const pending = pendingRemoteState.current
      if (pending && remoteReady.current) {
        void saveSharedState(pending).catch(() => undefined)
      }
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      pendingRemoteState.current = null
    }
  }, [teamId, canEdit, onTeamLoaded, saveSharedState])

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
    state,
    stateRef,
    syncMessage,
    syncStatus,
    undoStack,
  }
}
