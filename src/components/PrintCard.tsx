import type { AppState } from '../types'
import { FieldStarLockup } from './FieldStarBrand'

type PrintCardProps = {
  printMode: 'current' | 'gameday' | null
  state: AppState
}

export function PrintCard({ printMode, state }: PrintCardProps) {
  if (!printMode) return null
  const lineup = printMode === 'gameday' ? state.gameDayLineup : state.currentLineup
  if (!lineup.length) return null

  return (
    <section className="print-card" aria-hidden="true">
      <header>
        <FieldStarLockup className="print-brand" markSize={24} />
        <p>{state.gameDate} - {state.innings} innings - {state.fieldingSpots} fielders</p>
      </header>
      <table>
        <thead>
          <tr>
            <th>Bat</th>
            <th>Player</th>
            {Array.from({ length: state.innings }, (_, inning) => (
              <th key={inning}>Inning {inning + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lineup.map((row) => (
            <tr key={row.playerId}>
              <td>{row.batOrder}</td>
              <td>{row.playerName}</td>
              {Array.from({ length: state.innings }, (_, inning) => (
                <td key={inning}>{row.assignments[inning] || ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
