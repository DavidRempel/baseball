import { ListPlus, Trash2, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FIELDING_POSITIONS } from '../types'
import type { AppState, FieldingPosition, Player } from '../types'

type RosterTabProps = {
  addPlayer: () => void
  addPlayers: (names: string[]) => void
  blankPlayerCount: number
  deleteUnusedPlayer: (id: string) => void
  duplicatePlayerIds: Set<string>
  finishPlayerNameEdit: (id: string) => void
  readOnly: boolean
  sortedPlayers: Player[]
  state: AppState
  updatePlayer: (id: string, patch: Partial<Player>) => void
  updatePlayerDislike: (id: string, dislikeIndex: number, value: FieldingPosition | '') => void
  updatePlayerPreference: (id: string, preferenceIndex: number, value: FieldingPosition | '') => void
}

export function RosterTab({
  addPlayer,
  addPlayers,
  blankPlayerCount,
  deleteUnusedPlayer,
  duplicatePlayerIds,
  finishPlayerNameEdit,
  readOnly,
  sortedPlayers,
  state,
  updatePlayer,
  updatePlayerDislike,
  updatePlayerPreference,
}: RosterTabProps) {
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const bulkNames = useMemo(() => bulkText
    .split(/[\n,;\t]+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name, index, all) => all.findIndex((item) => item.toLowerCase() === name.toLowerCase()) === index), [bulkText])

  function saveBulkPlayers() {
    if (!bulkNames.length) return
    addPlayers(bulkNames)
    setBulkText('')
    setBulkOpen(false)
  }

  return (
    <section className="workspace">
      <div className="section-title">
        <h2>Roster</h2>
        <div className="section-actions">
          <button type="button" onClick={addPlayer} disabled={readOnly}>
            <ListPlus size={18} /> Add
          </button>
          <button type="button" onClick={() => setBulkOpen((open) => !open)} disabled={readOnly}>
            <ListPlus size={18} /> Bulk Add
          </button>
        </div>
      </div>
      {(blankPlayerCount > 0 || duplicatePlayerIds.size > 0) && (
        <div className="validation-banner">
          {blankPlayerCount > 0 && <span>{blankPlayerCount} blank player row{blankPlayerCount === 1 ? '' : 's'} will be removed when left empty.</span>}
          {duplicatePlayerIds.size > 0 && <span>{duplicatePlayerIds.size} player row{duplicatePlayerIds.size === 1 ? '' : 's'} use duplicate names.</span>}
        </div>
      )}
      {bulkOpen && (
        <div className="bulk-roster-panel">
          <label>
            Player names
            <textarea
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              placeholder={'Alex\nBlake\nCasey'}
              spellCheck={false}
            />
          </label>
          <div className="bulk-roster-preview">
            <strong>{bulkNames.length} player{bulkNames.length === 1 ? '' : 's'}</strong>
            <span>{bulkNames.slice(0, 8).join(', ')}{bulkNames.length > 8 ? '...' : ''}</span>
          </div>
          <div className="preview-actions">
            <button type="button" onClick={() => setBulkText('')} disabled={!bulkText}>
              Clear
            </button>
            <button className="primary" type="button" onClick={saveBulkPlayers} disabled={!bulkNames.length}>
              Add Players
            </button>
          </div>
        </div>
      )}
      <div className="roster-list">
        {sortedPlayers.length === 0 ? (
          <div className="empty-state compact-empty">
            <Users size={32} />
            <h2>Add your roster first.</h2>
            <button className="primary" type="button" onClick={addPlayer} disabled={readOnly}>
              <ListPlus size={18} /> Add Player
            </button>
          </div>
        ) : (
          <>
            <div className="roster-row roster-heading" aria-hidden="true">
              <span>Player</span>
              <span>Position preferences</span>
              <span>Avoid positions</span>
              <span>Notes</span>
              <span></span>
            </div>
            {sortedPlayers.map((player) => {
              return (
                <div className="roster-row" key={player.id}>
                  <input
                    className={duplicatePlayerIds.has(player.id) || !player.name.trim() ? 'invalid-field' : ''}
                    value={player.name}
                    placeholder="Player"
                    disabled={readOnly}
                    onBlur={() => finishPlayerNameEdit(player.id)}
                    onChange={(event) => updatePlayer(player.id, { name: event.target.value })}
                    title={duplicatePlayerIds.has(player.id) ? 'Duplicate player name' : !player.name.trim() ? 'Player name required' : 'Player name'}
                  />
                  <div className="preference-selects" aria-label={`${player.name || 'Player'} preferred positions`}>
                    {Array.from({ length: 3 }, (_, preferenceIndex) => (
                      <select
                        key={preferenceIndex}
                        value={player.preferredPositions[preferenceIndex] ?? ''}
                        disabled={readOnly}
                        onChange={(event) => updatePlayerPreference(player.id, preferenceIndex, event.target.value as FieldingPosition | '')}
                        title={`Preference ${preferenceIndex + 1}`}
                      >
                        <option value="">Pref {preferenceIndex + 1}</option>
                        {FIELDING_POSITIONS.map((position) => (
                          <option key={position} value={position}>{position}</option>
                        ))}
                      </select>
                    ))}
                  </div>
                  <div className="preference-selects avoid-selects" aria-label={`${player.name || 'Player'} avoid positions`}>
                    {Array.from({ length: 3 }, (_, dislikeIndex) => (
                      <select
                        key={dislikeIndex}
                        value={player.dislikedPositions[dislikeIndex] ?? ''}
                        disabled={readOnly}
                        onChange={(event) => updatePlayerDislike(player.id, dislikeIndex, event.target.value as FieldingPosition | '')}
                        title={`Avoid ${dislikeIndex + 1}`}
                      >
                        <option value="">Avoid {dislikeIndex + 1}</option>
                        {FIELDING_POSITIONS.map((position) => (
                          <option key={position} value={position}>{position}</option>
                        ))}
                      </select>
                    ))}
                  </div>
                  <input value={player.notes} placeholder="Notes" disabled={readOnly} onChange={(event) => updatePlayer(player.id, { notes: event.target.value })} />
                  <button
                    type="button"
                    onClick={() => deleteUnusedPlayer(player.id)}
                    disabled={readOnly || state.games.some((game) => game.lineup.some((row) => row.playerId === player.id))}
                    title="Remove unused player"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )
            })}
          </>
        )}
      </div>
    </section>
  )
}
