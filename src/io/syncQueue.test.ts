import { beforeEach, describe, expect, it } from 'vitest'
import { createInitialState } from './storage'
import { clearQueuedSyncSave, getSyncQueueStorageKey, loadQueuedSyncSave, saveQueuedSyncSave } from './syncQueue'

const storage = new Map<string, string>()

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, value),
  },
})

describe('sync save queue', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores one pending state per team with the base revision', () => {
    const state = createInitialState()
    saveQueuedSyncSave('team-a', { baseRevision: 'rev-1', state })

    expect(loadQueuedSyncSave('team-a')).toEqual({ baseRevision: 'rev-1', state })
    expect(localStorage.getItem(getSyncQueueStorageKey('team-a'))).toBeTruthy()
  })

  it('clears queued state after a successful sync', () => {
    saveQueuedSyncSave('team-a', { baseRevision: null, state: createInitialState() })
    clearQueuedSyncSave('team-a')

    expect(loadQueuedSyncSave('team-a')).toBeNull()
  })
})
