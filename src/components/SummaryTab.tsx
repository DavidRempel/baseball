import { FIELDING_POSITIONS, INFIELD, OUTFIELD } from '../types'
import type { AppState, FieldingPosition, LineupRow, Player, Position, TeamSummary } from '../types'
import { TeamLogoWatermark } from './TeamLogo'
import { getLineupDeltas, getTotals, getWarnings, summarizePlayer } from '../engine/totals'

type SummaryRow = {
  avgBat: number
  current: LineupRow | undefined
  fielding: number
  first: number
  games: number
  infield: number
  last: number
  notes: string[]
  outfield: number
  player: Player
  positionVariety: number
  positions: Record<FieldingPosition, number>
  sits: number
}

function positionLabel(value: Position | FieldingPosition | string) {
  return value === 'Rover' ? 'Rov' : value
}

function formatAvg(value: number) {
  return value ? value.toFixed(1) : '-'
}

function countPositions(positions: Record<FieldingPosition, number>, set: Set<string>) {
  return FIELDING_POSITIONS.filter((position) => set.has(position)).reduce((sum, position) => sum + positions[position], 0)
}

function projectedPositions(row: LineupRow | undefined, positions: Record<FieldingPosition, number>, innings: number) {
  const next = { ...positions }
  row?.assignments.slice(0, innings).forEach((assignment) => {
    if (FIELDING_POSITIONS.includes(assignment as never)) next[assignment as FieldingPosition] += 1
  })
  return next
}

function getCurrentAssignments(row: LineupRow | undefined, innings: number) {
  if (!row) return '-'
  return row.assignments.slice(0, innings).map((assignment) => positionLabel(assignment || '-')).join(' / ')
}

function buildSummaryRows(state: AppState): SummaryRow[] {
  const players = state.players.filter((player) => player.name.trim())
  const lineupByPlayer = new Map(state.currentLineup.map((row) => [row.playerId, row]))
  const seasonTotals = getTotals(players, state.games)

  return players.map((player) => {
    const current = lineupByPlayer.get(player.id)
    const summary = summarizePlayer(player, state.games)
    const deltas = current ? getLineupDeltas(current, state.currentLineup, state.innings) : undefined
    const positions = projectedPositions(current, seasonTotals.get(player.id)?.positions ?? summary.positions, state.innings)
    const sits = summary.sits + (deltas?.sits ?? 0)
    const first = summary.first + (deltas?.first ?? 0)
    const last = summary.last + (deltas?.last ?? 0)
    const infield = countPositions(positions, INFIELD)
    const outfield = countPositions(positions, OUTFIELD)
    const fielding = infield + outfield
    const positionVariety = FIELDING_POSITIONS.filter((position) => positions[position] > 0).length
    const currentWarnings = current ? getWarnings(current, state.innings) : []
    const notes = [
      !player.present ? 'Out' : '',
      currentWarnings.length ? currentWarnings.join(', ') : '',
      fielding > 0 && infield === 0 ? 'No IF yet' : '',
      fielding > 0 && outfield === 0 ? 'No OF yet' : '',
    ].filter(Boolean)

    return {
      avgBat: current ? ((summary.avgBat * summary.games) + current.batOrder) / Math.max(1, summary.games + 1) : summary.avgBat,
      current,
      fielding,
      first,
      games: summary.games,
      infield,
      last,
      notes,
      outfield,
      player,
      positionVariety,
      positions,
      sits,
    }
  }).sort((a, b) => a.player.name.localeCompare(b.player.name))
}

export function SummaryTab({ state, team }: { state: AppState; team: TeamSummary }) {
  const rows = buildSummaryRows(state)

  return (
    <section className="workspace summary-tab">
      <div className="section-title has-team-watermark">
        <div>
          <span className="section-kicker">Summary</span>
          <h2>Fairness dashboard</h2>
        </div>
        <TeamLogoWatermark team={team} />
      </div>

      <div className="summary-table" role="table" aria-label="Player summary">
        <div className="summary-row summary-heading" role="row">
          <span>Player</span>
          <span>G</span>
          <span>Sit</span>
          <span>Fld</span>
          <span>IF</span>
          <span>OF</span>
          {FIELDING_POSITIONS.map((position) => (
            <span key={position}>{positionLabel(position)}</span>
          ))}
          <span>Pos</span>
          <span>Avg</span>
          <span>1st</span>
          <span>Last</span>
          <span>Current</span>
          <span>Notes</span>
        </div>
        {rows.map((row) => (
          <div className={`summary-row ${!row.player.present ? 'summary-row-out' : ''}`} role="row" key={row.player.id}>
            <strong>{row.player.name}</strong>
            <span>{row.games}</span>
            <span>{row.sits}</span>
            <span>{row.fielding}</span>
            <span>{row.infield}</span>
            <span>{row.outfield}</span>
            {FIELDING_POSITIONS.map((position) => (
              <span className={INFIELD.has(position) ? 'summary-position-infield' : 'summary-position-outfield'} key={position}>{row.positions[position]}</span>
            ))}
            <span>{row.positionVariety}</span>
            <span>{formatAvg(row.avgBat)}</span>
            <span>{row.first}</span>
            <span>{row.last}</span>
            <span className="summary-current">{getCurrentAssignments(row.current, state.innings)}</span>
            <span className={row.notes.length ? 'summary-notes has-notes' : 'summary-notes'}>{row.notes.join('; ') || 'ok'}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
