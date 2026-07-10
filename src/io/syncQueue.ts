import type { AppState } from '../types'

export type QueuedSyncSave = {
  baseRevision: string | null
  state: AppState
}

const SYNC_QUEUE_KEY = 'baseball-sync-queue-v1'

export function getSyncQueueStorageKey(teamId: string) {
  return `${SYNC_QUEUE_KEY}-${teamId || 'home'}`
}

export function loadQueuedSyncSave(teamId: string): QueuedSyncSave | null {
  const saved = localStorage.getItem(getSyncQueueStorageKey(teamId))
  if (!saved) return null

  try {
    const parsed = JSON.parse(saved) as QueuedSyncSave
    if (!parsed || typeof parsed !== 'object' || !('state' in parsed)) return null
    return {
      baseRevision: typeof parsed.baseRevision === 'string' ? parsed.baseRevision : null,
      state: parsed.state,
    }
  } catch {
    return null
  }
}

export function saveQueuedSyncSave(teamId: string, queued: QueuedSyncSave) {
  localStorage.setItem(getSyncQueueStorageKey(teamId), JSON.stringify(queued))
}

export function clearQueuedSyncSave(teamId: string) {
  localStorage.removeItem(getSyncQueueStorageKey(teamId))
}
