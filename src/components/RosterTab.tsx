import { ListPlus, Trash2, Users } from 'lucide-react'
import { FIELDING_POSITIONS } from '../types'
import type { AppState, FieldingPosition, Player, PlayerTotals } from '../types'

type RosterTabProps = {
  addPlayer: () => void
  blankPlayerCount: number
  deleteUnusedPlayer: (id: string) => void
  duplicatePlayerIds: Set<string>
  finishPlayerNameEdit: (id: string) => void
  readOnly: boolean
  sortedPlayers: Player[]
  state: AppState
  totals: Map<string, PlayerTotals>
  updatePlayer: (id: string, patch: Partial<Player>) => void
  updatePlayerPreference: (id: string, preferenceIndex: number, value: FieldingPosition | '') => void
}

export function RosterTab({
  addPlayer,
  blankPlayerCount,
  deleteUnusedPlayer,
  duplicatePlayerIds,
  finishPlayerNameEdit,
  readOnly,
  sortedPlayers,
  state,
  totals,
  updatePlayer,
  updatePlayerPreference,
}: RosterTabProps) {
  return (
    <section className="workspace">
      <div className="section-title">
        <h2>Roster</h2>
        <button type="button" onClick={addPlayer} disabled={readOnly}>
          <ListPlus size={18} /> Add
        </button>
      </div>
      {(blankPlayerCount > 0 || duplicatePlayerIds.size > 0) && (
        <div className="validation-banner">
          {blankPlayerCount > 0 && <span>{blankPlayerCount} blank player row{blankPlayerCount === 1 ? '' : 's'} will be removed when left empty.</span>}
          {duplicatePlayerIds.size > 0 && <span>{duplicatePlayerIds.size} player row{duplicatePlayerIds.size === 1 ? '' : 's'} use duplicate names.</span>}
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
              <span>Playing</span>
              <span>Player</span>
              <span>Position preferences</span>
              <span>Notes</span>
              <span>Sits</span>
              <span></span>
            </div>
            {sortedPlayers.map((player) => {
              const playerTotals = totals.get(player.id)
              return (
                <div className="roster-row" key={player.id}>
                  <label className="toggle">
                    <input type="checkbox" checked={player.present} disabled={readOnly} onChange={(event) => updatePlayer(player.id, { present: event.target.checked })} />
                    Present
                  </label>
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
                  <input value={player.notes} placeholder="Notes" disabled={readOnly} onChange={(event) => updatePlayer(player.id, { notes: event.target.value })} />
                  <span>{playerTotals?.sits ?? 0} sits</span>
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
