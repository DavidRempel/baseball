import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Eraser,
  GripVertical,
  History,
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
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { getLineupChangeKey } from '../engine/changes'
import { explainAssignment, getInningFixes, getInningWarnings, getLineupDeltas, getWarnings, hasRepeatedPositions, isBlankLineup, summarizePlayer, warningSeverity, worstWarningSeverity } from '../engine/totals'
import { exportCsv } from '../io/csv'
import { downloadFile, today } from '../io/storage'
import { useFlipListAnimation } from '../hooks/useFlipListAnimation'
import { FIELDING_POSITIONS, INFIELD, OUTFIELD, POSITIONS } from '../types'
import type { AppState, FieldingPosition, LineupMode, PendingChange, Player, Position } from '../types'

type RosterDiff = {
  added: Player[]
  removed: AppState['currentLineup']
  renamed: AppState['currentLineup']
}

type LineupTabProps = {
  acceptedChangeCells: Set<string>
  mode: LineupMode
  onAcceptPendingChange: (changeId: string) => void
  onAddLineupPlayer: (playerId: string, mode: LineupMode) => void
  onApplyPendingChanges: (mode: LineupMode) => void
  onClearAcceptedChangeCell: (cellKey: string) => void
  onEmptyCurrentLineup: () => void
  onClearGameDay: () => void
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
  rowAnimationKey: number
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

function getPreferenceClass(player: Player | undefined, value: Position) {
  if (!player || !FIELDING_POSITIONS.includes(value as never)) return ''
  if (player.preferredPositions.includes(value as never)) return 'position-preferred'
  return ''
}

function positionSelectClass(value: Position, changed = false, preferenceClass = '') {
  return [
    changed ? 'changed-cell' : '',
    value === 'P' || value === 'C' ? 'position-battery' : '',
    INFIELD.has(value) ? 'position-infield' : '',
    OUTFIELD.has(value) ? 'position-outfield' : '',
    value === 'Sit' ? 'position-sit' : '',
    preferenceClass,
  ].filter(Boolean).join(' ')
}

function assignedDislikedPositions(player: Player | undefined, assignments: Position[]) {
  if (!player) return []
  return assignments.filter((assignment): assignment is FieldingPosition => (
    FIELDING_POSITIONS.includes(assignment as never) && player.dislikedPositions.includes(assignment as never)
  ))
}

function CountCell({
  delta = 0,
  marker,
  markerLabel,
  value,
}: {
  delta?: number
  marker?: 'preferred' | 'disliked'
  markerLabel?: string
  value: number
}) {
  const markerText = marker === 'preferred' ? '^' : '-'
  return (
    <span className={`history-count${delta > 0 ? ' projected-count' : ''}${marker ? ` history-count-${marker}` : ''}`} title={markerLabel}>
      {value + delta}
      <small className={marker ? '' : 'history-marker-placeholder'} aria-label={markerLabel} aria-hidden={!marker}>
        {markerText}
      </small>
    </span>
  )
}

function PositionCountCell({
  delta = 0,
  player,
  position,
  value,
}: {
  delta?: number
  player: Player | undefined
  position: FieldingPosition
  value: number
}) {
  const dislikedIndex = player?.dislikedPositions.indexOf(position) ?? -1
  const preferredIndex = player?.preferredPositions.indexOf(position) ?? -1
  if (dislikedIndex >= 0) {
    return <CountCell value={value} delta={delta} marker="disliked" markerLabel={`Avoids ${position}`} />
  }
  if (preferredIndex >= 0) {
    return <CountCell value={value} delta={delta} marker="preferred" markerLabel={`Preference ${preferredIndex + 1}: ${position}`} />
  }
  return <CountCell value={value} delta={delta} />
}

type LineupRowViewProps = {
  acceptedChangeCells: Set<string>
  blankLineup: boolean
  cancelRowPointerDrag: (event: PointerEvent<HTMLButtonElement>) => void
  displayHistoryPanel: boolean
  dragOverRowIndex: number | null
  draggedRowIndex: number | null
  finishRowPointerDrag: (event: PointerEvent<HTMLButtonElement>) => void
  isGameDay: boolean
  lineup: AppState['currentLineup']
  locked: boolean
  mode: LineupMode
  moveRowPointerDrag: (event: PointerEvent<HTMLButtonElement>) => void
  onAcceptPendingChange: (changeId: string) => void
  onClearAcceptedChangeCell: (cellKey: string) => void
  onFixPlayerRepeats: (mode: LineupMode) => void
  onRejectPendingChange: (changeId: string) => void
  onRemoveLineupPlayer: (playerId: string, mode: LineupMode) => void
  onScratchGameDayPlayer: (playerId: string, startInning: number) => void
  onUpdateAssignment: (rowIndex: number, inning: number, value: Position, mode: LineupMode) => void
  pendingByCell: Map<string, PendingChange>
  player: Player | undefined
  row: AppState['currentLineup'][number]
  rowIndex: number
  scratchFromInning: number
  startRowPointerDrag: (event: PointerEvent<HTMLButtonElement>, rowIndex: number) => void
  state: AppState
}

const LineupRowView = memo(function LineupRowView({
  acceptedChangeCells,
  blankLineup,
  cancelRowPointerDrag,
  displayHistoryPanel,
  dragOverRowIndex,
  draggedRowIndex,
  finishRowPointerDrag,
  isGameDay,
  lineup,
  locked,
  mode,
  moveRowPointerDrag,
  onAcceptPendingChange,
  onClearAcceptedChangeCell,
  onFixPlayerRepeats,
  onRejectPendingChange,
  onRemoveLineupPlayer,
  onScratchGameDayPlayer,
  onUpdateAssignment,
  pendingByCell,
  player,
  row,
  rowIndex,
  scratchFromInning,
  startRowPointerDrag,
  state,
}: LineupRowViewProps) {
  const warnings = getWarnings(row, state.innings)
  const displayWarnings = blankLineup ? [] : warnings
  const avoidWarnings = assignedDislikedPositions(player, row.assignments.slice(0, state.innings))
    .map((position) => `avoids ${position}`)
  const rowWarnings = displayWarnings.concat(avoidWarnings)
  const summary = player ? summarizePlayer(player, state.games) : undefined
  const deltas = getLineupDeltas(row, lineup, state.innings)

  return (
    <div
      className={`lineup-row ${displayHistoryPanel ? 'with-history-panel' : ''} ${rowIndex % 2 === 1 ? 'zebra-row' : ''} ${row.assignments.some((_, inning) => pendingByCell.has(getLineupChangeKey(mode, row.playerId, inning))) ? 'has-suggestion' : ''} ${draggedRowIndex === rowIndex ? 'dragging' : ''} ${dragOverRowIndex === rowIndex && draggedRowIndex !== rowIndex ? 'drop-target' : ''}`}
      style={lineupGridStyle(state.innings, displayHistoryPanel)}
      key={row.playerId}
      data-lineup-mode={mode}
      data-lineup-row-id={row.playerId}
      data-lineup-row-index={rowIndex}
    >
      <span className="drag-cell">
        {locked ? (
          <span className="drag-placeholder" aria-hidden="true">
            <GripVertical size={16} />
          </span>
        ) : (
          <button
            type="button"
            className="drag-handle"
            onPointerDown={(event) => startRowPointerDrag(event, rowIndex)}
            onPointerMove={moveRowPointerDrag}
            onPointerUp={finishRowPointerDrag}
            onPointerCancel={cancelRowPointerDrag}
            title="Drag to reorder"
          >
            <GripVertical size={16} />
          </button>
        )}
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
        const assignment = row.assignments[inning] ?? ''
        return (
          <span className={pending ? 'suggested-cell' : ''} key={inning}>
            <select
              className={positionSelectClass(assignment, acceptedChangeCells.has(cellKey), getPreferenceClass(player, assignment))}
              value={assignment}
              disabled={locked}
              title={explainAssignment(player, row, assignment, state.games, lineup, state.innings)}
              onMouseEnter={() => onClearAcceptedChangeCell(cellKey)}
              onFocus={() => onClearAcceptedChangeCell(cellKey)}
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
      {rowWarnings.length ? (
        <button className={`warning warning-${worstWarningSeverity(rowWarnings)} warning-fix ${displayWarnings.length === 0 ? 'warning-note' : ''}`} type="button" disabled={locked} title={displayWarnings.length > 0 ? 'Fix this player\'s warnings' : 'Position preference warning'} onClick={() => {
          if (displayWarnings.length > 0) onFixPlayerRepeats(mode)
        }}>
          <AlertTriangle size={14} />
          <span>{rowWarnings.join('; ')}</span>
        </button>
      ) : (
        <span className="empty-warning" aria-label="No warnings"></span>
      )}
      {displayHistoryPanel && (
        <>
          <CountCell value={summary?.sits ?? 0} delta={deltas.sits} />
          <CountCell value={summary?.first ?? 0} delta={deltas.first} />
          <CountCell value={summary?.last ?? 0} delta={deltas.last} />
          {FIELDING_POSITIONS.map((position) => (
            <PositionCountCell key={position} player={player} position={position} value={summary?.positions[position] ?? 0} delta={deltas.positions[position]} />
          ))}
        </>
      )}
    </div>
  )
})

export function LineupTab({
  acceptedChangeCells,
  mode,
  onAcceptPendingChange,
  onAddLineupPlayer,
  onApplyPendingChanges,
  onClearGameDay,
  onClearAcceptedChangeCell,
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
  rowAnimationKey,
  rosterDiff,
  rosterPlayers,
  showHistoryPanel,
  state,
  undoStackLength,
}: LineupTabProps) {
  const [draggedRowIndex, setDraggedRowIndex] = useState<number | null>(null)
  const [dragOverRowIndex, setDragOverRowIndex] = useState<number | null>(null)
  const [scratchFromInning, setScratchFromInning] = useState(1)
  const [mobileInning, setMobileInning] = useState(0)
  const [historyPanelOpen, setHistoryPanelOpen] = useState(showHistoryPanel)
  const [confirmDraftLogArmed, setConfirmDraftLogArmed] = useState(false)
  const [confirmClearGameDayArmed, setConfirmClearGameDayArmed] = useState(false)
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
  const displayHistoryPanel = showHistoryPanel && historyPanelOpen
  const pendingForMode = pendingChanges.filter((change) => change.mode === mode)
  const pendingByCell = new Map(pendingForMode.map((change) => [change.id, change]))
  const lineupOrder = useMemo(() => lineup.map((row) => row.playerId), [lineup])
  const selectedMobileInning = Math.min(mobileInning, Math.max(0, state.innings - 1))
  useFlipListAnimation(lineupOrder, mode, sectionRef, rowAnimationKey)

  const getRowIndexFromPointer = useCallback((event: PointerEvent<HTMLElement>) => {
    const element = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-lineup-row-index]')
    const rowIndex = Number(element?.dataset.lineupRowIndex)
    return Number.isFinite(rowIndex) ? rowIndex : null
  }, [])

  const startRowPointerDrag = useCallback((event: PointerEvent<HTMLButtonElement>, rowIndex: number) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    setDraggedRowIndex(rowIndex)
    setDragOverRowIndex(rowIndex)
  }, [])

  const moveRowPointerDrag = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (draggedRowIndex === null) return
    const rowIndex = getRowIndexFromPointer(event)
    if (rowIndex !== null) setDragOverRowIndex(rowIndex)
  }, [draggedRowIndex, getRowIndexFromPointer])

  const finishRowPointerDrag = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const toIndex = dragOverRowIndex ?? getRowIndexFromPointer(event)
    const fromIndex = draggedRowIndex
    setDraggedRowIndex(null)
    setDragOverRowIndex(null)
    if (fromIndex !== null && toIndex !== null) onReorderRow(fromIndex, toIndex, mode)
  }, [dragOverRowIndex, draggedRowIndex, getRowIndexFromPointer, mode, onReorderRow])

  const cancelRowPointerDrag = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDraggedRowIndex(null)
    setDragOverRowIndex(null)
  }, [])

  function confirmDraftLog() {
    if (isGameDay || confirmDraftLogArmed) {
      setConfirmDraftLogArmed(false)
      onLogGame(mode)
      return
    }

    setConfirmDraftLogArmed(true)
  }

  function confirmClearGameDay() {
    if (!confirmClearGameDayArmed) {
      setConfirmClearGameDayArmed(true)
      return
    }

    setConfirmClearGameDayArmed(false)
    onClearGameDay()
  }

  return (
    <section className="workspace" ref={sectionRef}>
      {!isGameDay && lineup.length > 0 && !readOnly && (
        <div className="candidate-strip">
          <button className="primary" type="button" onClick={onGenerateDraftLineup} disabled={readOnly}>
            <Shuffle size={16} /> Generate
          </button>
          <button className="primary game-action" type="button" onClick={onSaveToGameDay} disabled={readOnly}>
            <ClipboardList size={16} /> Save to Gameday
          </button>
          <button type="button" onClick={confirmDraftLog} disabled={readOnly}>
            <Save size={16} /> {confirmDraftLogArmed ? 'Confirm Log Draft' : 'Log Game'}
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
          <button className="primary game-action" type="button" onClick={confirmDraftLog} disabled={readOnly}>
            <Save size={16} /> Log Game
          </button>
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
          <button className="danger-outline" type="button" onClick={confirmClearGameDay} disabled={readOnly}>
            <Eraser size={16} /> {confirmClearGameDayArmed ? 'Confirm Clear' : 'Clear Gameday'}
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
          {showHistoryPanel && (
            <div className="lineup-view-options">
              <button type="button" onClick={() => setHistoryPanelOpen((open) => !open)}>
                <History size={16} /> {historyPanelOpen ? 'Hide season history' : 'Show season history'}
              </button>
            </div>
          )}
          <div className="mobile-inning-view">
            <div className="mobile-inning-stepper" aria-label="Choose inning">
              <button type="button" aria-label="Previous inning" onClick={() => setMobileInning((inning) => Math.max(0, inning - 1))} disabled={selectedMobileInning === 0}>
                <ChevronLeft size={18} />
              </button>
              <strong>Inning {selectedMobileInning + 1}</strong>
              <button type="button" aria-label="Next inning" onClick={() => setMobileInning((inning) => Math.min(state.innings - 1, inning + 1))} disabled={selectedMobileInning >= state.innings - 1}>
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="mobile-lineup-list">
              {lineup.map((row, rowIndex) => {
                const player = state.players.find((item) => item.id === row.playerId)
                const assignment = row.assignments[selectedMobileInning] ?? ''
                const cellKey = `${mode}:${row.playerId}:${selectedMobileInning}`
                const pending = pendingByCell.get(cellKey)
                return (
                  <div className={`mobile-lineup-row ${pending ? 'suggested-cell' : ''}`} key={row.playerId}>
                    <span className="mobile-bat-order">{row.batOrder}</span>
                    <span className="mobile-player-name">{row.playerName}</span>
                    <select
                      className={positionSelectClass(assignment, acceptedChangeCells.has(cellKey), getPreferenceClass(player, assignment))}
                      value={assignment}
                      disabled={locked}
                      title={explainAssignment(player, row, assignment, state.games, lineup, state.innings)}
                      onMouseEnter={() => onClearAcceptedChangeCell(cellKey)}
                      onFocus={() => onClearAcceptedChangeCell(cellKey)}
                      onChange={(event) => onUpdateAssignment(rowIndex, selectedMobileInning, event.target.value as Position, mode)}
                    >
                      <option value=""></option>
                      {POSITIONS.map((position) => (
                        <option key={position} value={position}>
                          {position}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="lineup-table">
            <div className={`lineup-row heading ${displayHistoryPanel ? 'with-history-panel' : ''}`} style={lineupGridStyle(state.innings, displayHistoryPanel)}>
              <span>Order</span>
              <span>Bat</span>
              <span>Player</span>
              {Array.from({ length: state.innings }, (_, index) => (
                <span key={index}>Inning {index + 1}</span>
              ))}
              <span>Warn</span>
              {displayHistoryPanel && (
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
            {lineup.map((row, rowIndex) => (
              <LineupRowView
                acceptedChangeCells={acceptedChangeCells}
                blankLineup={blankLineup}
                cancelRowPointerDrag={cancelRowPointerDrag}
                displayHistoryPanel={displayHistoryPanel}
                dragOverRowIndex={dragOverRowIndex}
                draggedRowIndex={draggedRowIndex}
                finishRowPointerDrag={finishRowPointerDrag}
                isGameDay={isGameDay}
                key={row.playerId}
                lineup={lineup}
                locked={locked}
                mode={mode}
                moveRowPointerDrag={moveRowPointerDrag}
                onAcceptPendingChange={onAcceptPendingChange}
                onClearAcceptedChangeCell={onClearAcceptedChangeCell}
                onFixPlayerRepeats={onFixPlayerRepeats}
                onRejectPendingChange={onRejectPendingChange}
                onRemoveLineupPlayer={onRemoveLineupPlayer}
                onScratchGameDayPlayer={onScratchGameDayPlayer}
                onUpdateAssignment={onUpdateAssignment}
                pendingByCell={pendingByCell}
                player={state.players.find((item) => item.id === row.playerId)}
                row={row}
                rowIndex={rowIndex}
                scratchFromInning={scratchFromInning}
                startRowPointerDrag={startRowPointerDrag}
                state={state}
              />
            ))}
            {absentPlayers.length > 0 && (
              <div className="lineup-section-label">Not present</div>
            )}
            {absentPlayers.map((player) => {
              const summary = summarizePlayer(player, state.games)
              return (
                <div className={`lineup-row absent-row ${displayHistoryPanel ? 'with-history-panel' : ''}`} style={lineupGridStyle(state.innings, displayHistoryPanel)} key={`absent-${player.id}`}>
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
                  {displayHistoryPanel && (
                    <>
                      <CountCell value={summary.sits} />
                      <CountCell value={summary.first} />
                      <CountCell value={summary.last} />
                      {FIELDING_POSITIONS.map((position) => (
                        <PositionCountCell key={position} player={player} position={position} value={summary.positions[position]} />
                      ))}
                    </>
                  )}
                </div>
              )
            })}
          </div>
          <div className="bottom-actions">
            <button type="button" onClick={() => downloadFile(`baseball-log-${today()}.csv`, exportCsv([{ id: isGameDay ? 'gameday' : 'current', date: state.gameDate, innings: state.innings, fieldingSpots: state.fieldingSpots, lineup }]), 'text/csv')}>
              <Download size={18} /> Export CSV
            </button>
            <button type="button" onClick={() => onSetPrintMode(mode)}>
              <Printer size={18} /> Print
            </button>
            <button type="button" onClick={() => onShareLineup(mode)}>
              <Share2 size={18} /> Share
            </button>
          </div>
        </>
      )}
    </section>
  )
}
