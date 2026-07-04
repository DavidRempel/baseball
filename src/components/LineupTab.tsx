import {
  AlertTriangle,
  Check,
  ClipboardList,
  Download,
  Eraser,
  GripVertical,
  ListPlus,
  Lock,
  Printer,
  Save,
  Share2,
  Shuffle,
  Undo2,
  Unlock,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { getLineupChangeKey } from '../engine/changes'
import { explainAssignment, getInningFixes, getInningWarnings, getLineupDeltas, getWarnings, hasRepeatedPositions, isBlankLineup, summarizePlayer, warningSeverity, worstWarningSeverity } from '../engine/totals'
import { exportCsv } from '../io/csv'
import { downloadFile, today } from '../io/storage'
import { useFlipListAnimation } from '../hooks/useFlipListAnimation'
import { FIELDING_POSITIONS, INFIELD, OUTFIELD, POSITIONS } from '../types'
import type { AppState, LineupMode, PendingChange, Player, Position } from '../types'

type RosterDiff = {
  added: Player[]
  removed: AppState['currentLineup']
  renamed: AppState['currentLineup']
}

type LineupTabProps = {
  changedCells: Set<string>
  mode: LineupMode
  onAcceptPendingChange: (changeId: string) => void
  onAddLineupPlayer: (playerId: string, mode: LineupMode) => void
  onApplyPendingChanges: (mode: LineupMode) => void
  onClearChangedCell: (cellKey: string) => void
  onEmptyCurrentLineup: () => void
  onFixInning: (inning: number, mode: LineupMode) => void
  onFixPlayerRepeats: (mode: LineupMode) => void
  onGenerateDraftLineup: () => void
  onLogGame: (mode: LineupMode) => void
  onRegenerateFromRoster: (mode: LineupMode) => void
  onRejectPendingChange: (changeId: string) => void
  onRemoveLineupPlayer: (playerId: string, mode: LineupMode) => void
  onReorderRow: (fromIndex: number, toIndex: number, mode: LineupMode) => void
  onRevertPendingChanges: (mode: LineupMode) => void
  onSaveToGameDay: () => void
  onScratchGameDayPlayer: (playerId: string, startInning: number) => void
  onSetGameDayLocked: (locked: boolean) => void
  onSetGameDayLogInnings: (innings: number) => void
  onSetPrintMode: (mode: LineupMode) => void
  onShareLineup: (mode: LineupMode) => void
  onShowRoster: () => void
  onUndoLastChange: () => void
  onUpdateAssignment: (rowIndex: number, inning: number, value: Position, mode: LineupMode) => void
  onUpdateLineupFromRoster: (mode: LineupMode) => void
  pendingChanges: PendingChange[]
  readOnly: boolean
  rosterDiff: RosterDiff
  rosterPlayers: Player[]
  showHistoryPanel: boolean
  state: AppState
  undoStackLength: number
}

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

function CountCell({ value, delta = 0 }: { value: number; delta?: number }) {
  return <span className={delta > 0 ? 'projected-count' : ''}>{value + delta}</span>
}

export function LineupTab({
  changedCells,
  mode,
  onAcceptPendingChange,
  onAddLineupPlayer,
  onApplyPendingChanges,
  onClearChangedCell,
  onEmptyCurrentLineup,
  onFixInning,
  onFixPlayerRepeats,
  onGenerateDraftLineup,
  onLogGame,
  onRegenerateFromRoster,
  onRejectPendingChange,
  onRemoveLineupPlayer,
  onReorderRow,
  onRevertPendingChanges,
  onSaveToGameDay,
  onScratchGameDayPlayer,
  onSetGameDayLocked,
  onSetGameDayLogInnings,
  onSetPrintMode,
  onShareLineup,
  onShowRoster,
  onUndoLastChange,
  onUpdateAssignment,
  onUpdateLineupFromRoster,
  pendingChanges,
  readOnly,
  rosterDiff,
  rosterPlayers,
  showHistoryPanel,
  state,
  undoStackLength,
}: LineupTabProps) {
  const [draggedRowIndex, setDraggedRowIndex] = useState<number | null>(null)
  const [dragOverRowIndex, setDragOverRowIndex] = useState<number | null>(null)
  const [scratchFromInning, setScratchFromInning] = useState(1)
  const sectionRef = useRef<HTMLElement>(null)
  const lineup = mode === 'gameday' ? state.gameDayLineup : state.currentLineup
  const isGameDay = mode === 'gameday'
  const locked = readOnly || (isGameDay && state.gameDayLocked)
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
  const lineupOrder = useMemo(() => lineup.map((row) => row.playerId), [lineup])
  useFlipListAnimation(lineupOrder, mode, sectionRef)

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

  function finishRowPointerDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const toIndex = dragOverRowIndex ?? getRowIndexFromPointer(event)
    const fromIndex = draggedRowIndex
    setDraggedRowIndex(null)
    setDragOverRowIndex(null)
    if (fromIndex !== null && toIndex !== null) onReorderRow(fromIndex, toIndex, mode)
  }

  function cancelRowPointerDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDraggedRowIndex(null)
    setDragOverRowIndex(null)
  }

  return (
    <section className="workspace" ref={sectionRef}>
      {!isGameDay && lineup.length > 0 && !readOnly && (
        <div className="candidate-strip">
          <button className="primary" type="button" onClick={onGenerateDraftLineup} disabled={readOnly}>
            <Shuffle size={16} /> Generate
          </button>
          <button className="danger-outline" type="button" onClick={onEmptyCurrentLineup} disabled={readOnly}>
            <Eraser size={16} /> Clear
          </button>
          <button type="button" onClick={onUndoLastChange} disabled={undoStackLength === 0 || readOnly}>
            <Undo2 size={16} /> Undo
          </button>
          {pendingForMode.length > 0 && (
            <>
              <button type="button" onClick={() => onApplyPendingChanges(mode)} disabled={readOnly}>
                <Check size={16} /> Accept all
              </button>
              <button type="button" onClick={() => onRevertPendingChanges(mode)} disabled={readOnly}>
                <X size={16} /> Revert all
              </button>
            </>
          )}
        </div>
      )}

      {isGameDay && lineup.length > 0 && !readOnly && (
        <div className="candidate-strip">
          <button type="button" onClick={() => onSetGameDayLocked(!state.gameDayLocked)} disabled={readOnly}>
            {locked ? <Lock size={16} /> : <Unlock size={16} />}
            {locked ? 'Locked' : 'Editing'}
          </button>
          <label className="compact-field">
            Log innings
            <select value={Math.min(state.gameDayLogInnings, state.innings)} onChange={(event) => onSetGameDayLogInnings(Number(event.target.value))} disabled={readOnly}>
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
          <button type="button" onClick={onUndoLastChange} disabled={undoStackLength === 0 || locked || readOnly}>
            <Undo2 size={16} /> Undo
          </button>
          {pendingForMode.length > 0 && (
            <>
              <button type="button" onClick={() => onApplyPendingChanges(mode)} disabled={locked}>
                <Check size={16} /> Accept all
              </button>
              <button type="button" onClick={() => onRevertPendingChanges(mode)} disabled={locked}>
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
            <button className="primary" type="button" onClick={onShowRoster}>
              <ListPlus size={18} /> Add Players
            </button>
          ) : !isGameDay && !readOnly && (
            <button className="primary" type="button" onClick={onGenerateDraftLineup} disabled={readOnly}>
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
              <button type="button" onClick={() => onUpdateLineupFromRoster(mode)} disabled={readOnly}>
                Update lineup
              </button>
              <button type="button" onClick={() => onRegenerateFromRoster(mode)} disabled={readOnly}>
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
              <button type="button" onClick={() => onApplyPendingChanges(mode)} disabled={readOnly}>
                <Check size={16} /> Accept all
              </button>
              <button type="button" onClick={() => onRevertPendingChanges(mode)} disabled={readOnly}>
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
                <button type="button" key={fix.inning} onClick={() => onFixInning(fix.inning, mode)} disabled={readOnly}>
                  {fix.label}
                </button>
              ))}
              {hasPlayerRepeats && (
                <button type="button" onClick={() => onFixPlayerRepeats(mode)} disabled={readOnly}>
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
                      onPointerUp={finishRowPointerDrag}
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
                              if (isGameDay) onScratchGameDayPlayer(row.playerId, scratchFromInning)
                              else onRemoveLineupPlayer(row.playerId, mode)
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
                          onMouseEnter={() => onClearChangedCell(cellKey)}
                          onFocus={() => onClearChangedCell(cellKey)}
                          onChange={(event) => onUpdateAssignment(rowIndex, inning, event.target.value as Position, mode)}
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
                            <button type="button" onClick={() => onAcceptPendingChange(pending.id)} disabled={locked} title="Accept suggestion">
                              <Check size={13} />
                            </button>
                            <button type="button" onClick={() => onRejectPendingChange(pending.id)} disabled={locked} title="Reject suggestion">
                              <X size={13} />
                            </button>
                          </span>
                        )}
                      </span>
                    )
                  })}
                  {displayWarnings.length ? (
                    <button className={`warning warning-${worstWarningSeverity(displayWarnings)} warning-fix`} type="button" disabled={locked} title="Fix this player's warnings" onClick={() => onFixPlayerRepeats(mode)}>
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
                          if (event.target.checked) onAddLineupPlayer(player.id, mode)
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
              <button type="button" onClick={onSaveToGameDay} disabled={readOnly}>
                <ClipboardList size={18} /> Save to Gameday
              </button>
            )}
            <button type="button" onClick={() => downloadFile(`baseball-log-${today()}.csv`, exportCsv([{ id: isGameDay ? 'gameday' : 'current', date: state.gameDate, innings: state.innings, fieldingSpots: state.fieldingSpots, lineup }]), 'text/csv')}>
              <Download size={18} /> Export CSV
            </button>
            <button type="button" onClick={() => onSetPrintMode(mode)}>
              <Printer size={18} /> Print
            </button>
            <button type="button" onClick={() => onShareLineup(mode)}>
              <Share2 size={18} /> Share
            </button>
            {!readOnly && (
              <button className="primary" type="button" onClick={() => onLogGame(mode)}>
                <Save size={18} /> Log Game
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
