import { Download } from 'lucide-react'
import { exportCsv } from '../io/csv'
import { downloadFile, today } from '../io/storage'
import { FIELDING_POSITIONS } from '../types'
import type { AppState, Player } from '../types'
import { summarizePlayer } from '../engine/totals'

type SummaryTabProps = {
  sortedPlayers: Player[]
  state: AppState
}

function positionSpread(player: Player, positions: Record<(typeof FIELDING_POSITIONS)[number], number>) {
  const countedPositions = FIELDING_POSITIONS.filter((position) => !player.dislikedPositions.includes(position))
  const counts = countedPositions.map((position) => positions[position])
  if (counts.length === 0) return 0
  return Math.max(...counts) - Math.min(...counts)
}

export function SummaryTab({ sortedPlayers, state }: SummaryTabProps) {
  return (
    <section className="workspace">
      <div className="section-title">
        <h2>Summary</h2>
        <div className="history-actions">
          <button type="button" onClick={() => downloadFile(`baseball-history-${today()}.csv`, exportCsv(state.games), 'text/csv')}>
            <Download size={18} /> CSV
          </button>
        </div>
      </div>
      <div className="history-table">
        <div className="history-row heading">
          <span>Player</span>
          <span>Games</span>
          <span>Sits</span>
          <span>First</span>
          <span>Last</span>
          <span>Avg Bat</span>
          <span title="Difference between this player's most-played and least-played non-avoid fielding spots">Spread</span>
          {FIELDING_POSITIONS.map((position) => (
            <span key={position}>{position}</span>
          ))}
        </div>
        {sortedPlayers.map((player) => {
          const summary = summarizePlayer(player, state.games)
          return (
            <div className="history-row" key={player.id}>
              <strong>{player.name}</strong>
              <span>{summary.games}</span>
              <span>{summary.sits}</span>
              <span>{summary.first}</span>
              <span>{summary.last}</span>
              <span>{summary.avgBat ? summary.avgBat.toFixed(1) : ''}</span>
              <span>{positionSpread(player, summary.positions)}</span>
              {FIELDING_POSITIONS.map((position) => (
                <span key={position}>{summary.positions[position]}</span>
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}
