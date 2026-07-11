import { ClipboardList, Download, History, ListPlus, Lock, Trash2, Unlock, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import { getWarnings, worstWarningSeverity } from '../engine/totals'
import { HISTORY_IMPORT_SAMPLE, buildGamesFromCsv, exportCsv, normalizeHistoryImportText, parseSitInnings } from '../io/csv'
import { createBlankLineup } from '../engine/lineup'
import { createPastGameRows, downloadFile, isPlaceholderLineup, isPlaceholderPlayer, makeId, normalizeInnings, today } from '../io/storage'
import { INFIELD, MAX_INNINGS, MIN_INNINGS, OUTFIELD, POSITIONS } from '../types'
import type { AppState, GameLog, LineupRow, PastGameRow, Position } from '../types'

type CommitOptions = {
  undo?: boolean
}

type FullHistoryTabProps = {
  commit: (next: AppState, options?: CommitOptions) => void
  readOnly: boolean
  showToast: (message: string, action?: { label: string; onClick: () => void }) => void
  state: AppState
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

function positionSelectClass(value: Position) {
  return [
    INFIELD.has(value) ? 'position-infield' : '',
    OUTFIELD.has(value) ? 'position-outfield' : '',
    value === 'Sit' ? 'position-sit' : '',
  ].filter(Boolean).join(' ')
}

export function FullHistoryTab({ commit, readOnly, showToast, state }: FullHistoryTabProps) {
  const [historyLocked, setHistoryLocked] = useState(true)
  const [confirmClearHistory, setConfirmClearHistory] = useState(false)
  const [expandedGameIds, setExpandedGameIds] = useState<Set<string>>(() => new Set(state.games.slice(-3).map((game) => game.id)))
  const [bulkHistoryOpen, setBulkHistoryOpen] = useState(false)
  const [bulkHistoryText, setBulkHistoryText] = useState('')
  const [pastGameOpen, setPastGameOpen] = useState(false)
  const [pastGameDate, setPastGameDate] = useState(today())
  const [pastGameInnings, setPastGameInnings] = useState(4)
  const [pastGameQuickMode, setPastGameQuickMode] = useState(true)
  const [pastGameRows, setPastGameRows] = useState<PastGameRow[]>(() => createPastGameRows(state.players, 4))
  const historyInput = useRef<HTMLInputElement>(null)

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
  const visibleGames = state.games.filter((game) => expandedGameIds.has(game.id))

  function showUndoToast(message: string, previous: AppState) {
    showToast(message, { label: 'Undo', onClick: () => commit(previous) })
  }

  function toggleGameExpanded(gameId: string) {
    setExpandedGameIds((current) => {
      const next = new Set(current)
      if (next.has(gameId)) next.delete(gameId)
      else next.add(gameId)
      return next
    })
  }

  function commitImportedHistory(imported: { players: AppState['players']; games: GameLog[] }) {
    const shouldReplaceLineup = !state.currentLineup.length || isPlaceholderLineup(state.currentLineup)
    const previous = state
    commit({
      ...state,
      players: imported.players,
      games: [...state.games, ...imported.games],
      currentLineup: shouldReplaceLineup ? createBlankLineup(imported.players, state.innings) : state.currentLineup,
    }, { undo: true })
    setExpandedGameIds((current) => new Set([...current, ...imported.games.map((game) => game.id)]))
    return previous
  }

  function importHistory(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const imported = buildGamesFromCsv(normalizeHistoryImportText(String(reader.result)), state.players)
        const previous = commitImportedHistory(imported)
        showUndoToast(`Imported ${imported.games.length} game${imported.games.length === 1 ? '' : 's'}`, previous)
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Could not import that history CSV')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  function importBulkHistory() {
    if (!bulkHistoryPreview?.imported) return
    const previous = commitImportedHistory(bulkHistoryPreview.imported)
    showUndoToast(`Imported ${bulkHistoryPreview.imported.games.length} game${bulkHistoryPreview.imported.games.length === 1 ? '' : 's'}`, previous)
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

    const previous = state
    const game = {
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
    setExpandedGameIds((current) => new Set([...current, game.id]))
    setPastGameOpen(false)
    showUndoToast('Past game added', previous)
  }

  function clearHistory() {
    if (!state.games.length) return
    if (!confirmClearHistory) {
      setConfirmClearHistory(true)
      showToast('Press Clear History again to confirm')
      return
    }
    setConfirmClearHistory(false)
    const previous = state
    commit({ ...state, games: [] }, { undo: true })
    setExpandedGameIds(new Set())
    showUndoToast('History cleared', previous)
  }

  function deleteGame(gameId: string) {
    const previous = state
    commit({
      ...state,
      games: state.games.filter((game) => game.id !== gameId),
    }, { undo: true })
    setExpandedGameIds((current) => {
      const next = new Set(current)
      next.delete(gameId)
      return next
    })
    showUndoToast('Game deleted', previous)
  }

  function updateGameDate(gameId: string, date: string) {
    if (!date) return
    commit({
      ...state,
      games: state.games.map((game) => (game.id === gameId ? { ...game, date } : game)),
    }, { undo: true })
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

  return (
    <>
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
                            className={positionSelectClass(row.assignments[inning] ?? '')}
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
            <div className="history-expand-actions">
              <button type="button" onClick={() => setExpandedGameIds(new Set(state.games.map((game) => game.id)))}>
                Show all
              </button>
              <button type="button" onClick={() => setExpandedGameIds(new Set())}>
                Hide all
              </button>
            </div>
            <div className="logged-games-panel">
              {state.games.map((game, gameIndex) => (
                <div className={`logged-game-chip ${expandedGameIds.has(game.id) ? 'expanded' : ''}`} key={game.id}>
                  {historyLocked || readOnly ? (
                    <button type="button" onClick={() => toggleGameExpanded(game.id)} title={expandedGameIds.has(game.id) ? 'Collapse game' : 'Expand game'}>
                      {expandedGameIds.has(game.id) ? 'Hide' : 'Show'}
                    </button>
                  ) : (
                    <>
                      <input
                        className="logged-game-date"
                        type="date"
                        value={game.date}
                        onChange={(event) => updateGameDate(game.id, event.target.value)}
                        title={`Game ${gameIndex + 1} date`}
                      />
                    </>
                  )}
                  <span>{game.date} · Game {gameIndex + 1} · {game.lineup.length} players</span>
                  {!(historyLocked || readOnly) && (
                    <button type="button" onClick={() => toggleGameExpanded(game.id)} title={expandedGameIds.has(game.id) ? 'Collapse game' : 'Expand game'}>
                      {expandedGameIds.has(game.id) ? 'Hide' : 'Show'}
                    </button>
                  )}
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
                    {visibleGames.length === 0 && (
                      <div className="full-history-row empty-history-row" style={fullHistoryGridStyle(maxHistoryInnings)}>
                        <span></span>
                        <span></span>
                        <strong></strong>
                        <span>No games expanded.</span>
                        {Array.from({ length: maxHistoryInnings }, (_, inning) => (
                          <span key={inning}></span>
                        ))}
                        <span></span>
                        <span></span>
                      </div>
                    )}
                    {visibleGames.map((game) => {
                      const gameIndex = state.games.findIndex((item) => item.id === game.id)
                      return (
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
                                className={`history-position-select ${positionSelectClass(row.assignments[inning] ?? '')}`}
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
                      })
                      )
                    })}
                  </>
                )
              })()}
            </div>
          </>
        )}
      </section>
      <input ref={historyInput} className="hidden" type="file" accept=".csv,text/csv" onChange={importHistory} />
    </>
  )
}
