import { CalendarDays, Eye, Share2, ShieldCheck, Users } from 'lucide-react'
import type { CSSProperties } from 'react'
import { getTeamLogo } from '../teamLogos'
import type { AppState, LineupRow, TeamSummary } from '../types'

type ParentGameCardProps = {
  onShareLineup: () => void
  state: AppState
  team: TeamSummary
}

function getParentLineup(state: AppState): { label: string; lineup: LineupRow[] } {
  if (state.currentLineup.length) return { label: 'Lineup', lineup: state.currentLineup }
  if (state.gameDayLineup.length) return { label: 'Saved game lineup', lineup: state.gameDayLineup }
  return { label: 'Lineup', lineup: state.currentLineup }
}

function positionLabel(value: string) {
  return value === 'Rover' ? 'Rov' : value
}

export function ParentGameCard({ onShareLineup, state, team }: ParentGameCardProps) {
  const logo = getTeamLogo(team)
  const { label, lineup } = getParentLineup(state)

  return (
    <section className="workspace parent-game-card">
      <header className="parent-card-header">
        <div className="parent-team-lockup">
          <img className="parent-team-logo" src={logo || '/fieldstar-mark.png'} alt="" />
          <div>
            <span className="section-kicker">View only</span>
            <h2>{team.name}</h2>
            <p>{label} for families</p>
          </div>
        </div>
        <button type="button" onClick={onShareLineup}>
          <Share2 size={18} /> Share
        </button>
      </header>

      <div className="parent-card-meta" aria-label="Game details">
        <span><CalendarDays size={16} /> {state.gameDate}</span>
        <span><Users size={16} /> {lineup.length} players</span>
        <span><Eye size={16} /> {state.innings} innings</span>
        <span><ShieldCheck size={16} /> View-only</span>
      </div>

      {lineup.length === 0 ? (
        <div className="empty-state compact-empty">
          <Eye size={32} />
          <h2>No lineup has been shared yet.</h2>
        </div>
      ) : (
        <div
          className="parent-card-table"
          role="table"
          aria-label={`${team.name} ${label}`}
          style={{ '--parent-innings': state.innings } as CSSProperties}
        >
          <div className="parent-card-row parent-card-heading" role="row">
            <span>Bat</span>
            <span>Player</span>
            {Array.from({ length: state.innings }, (_, inning) => (
              <span key={inning}>Inn {inning + 1}</span>
            ))}
          </div>
          {lineup.map((row) => (
            <div className="parent-card-row" role="row" key={row.playerId}>
              <strong>{row.batOrder}</strong>
              <span className="parent-player-name">{row.playerName}</span>
              {Array.from({ length: state.innings }, (_, inning) => {
                const assignment = row.assignments[inning] || ''
                return (
                  <span className={assignment === 'Sit' ? 'parent-sit-cell' : ''} key={inning}>
                    {positionLabel(assignment) || '-'}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      )}
      {lineup.length > 0 && (
        <div className="parent-card-note">
          <span>Positions can change before game time.</span>
          <span>Sit means that inning off the field.</span>
        </div>
      )}
    </section>
  )
}
