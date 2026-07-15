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

const fieldPositionClass: Record<string, string> = {
  C: 'position-c',
  P: 'position-p',
  '1B': 'position-1b',
  '2B': 'position-2b',
  SS: 'position-ss',
  '3B': 'position-3b',
  LF: 'position-lf',
  CF: 'position-cf',
  RF: 'position-rf',
  Rover: 'position-rover',
}

function shortPlayerName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}

export function ParentGameCard({ onShareLineup, state, team }: ParentGameCardProps) {
  const logo = getTeamLogo(team)
  const { label, lineup } = getParentLineup(state)
  const firstInning = lineup.flatMap((row) => {
    const position = row.assignments[0]
    if (!position || position === 'Sit' || !fieldPositionClass[position]) return []
    return [{ playerId: row.playerId, playerName: row.playerName, position }]
  })

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
        <button type="button" className="parent-share-button" onClick={onShareLineup} aria-label="Share lineup">
          <Share2 size={18} /> <span>Share</span>
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
        <>
          {firstInning.length > 0 && (
            <section className="parent-field-preview" aria-labelledby="parent-field-title">
              <div className="parent-field-copy">
                <span className="section-kicker">Game snapshot</span>
                <h3 id="parent-field-title">Inning 1 at a glance</h3>
                <p>A quick field view for players and families. The full inning-by-inning plan is below.</p>
              </div>
              <div className="parent-field-diamond" role="list" aria-label="Inning 1 field positions">
                <span className="field-line field-line-left" aria-hidden="true" />
                <span className="field-line field-line-right" aria-hidden="true" />
                <span className="field-base field-base-first" aria-hidden="true" />
                <span className="field-base field-base-second" aria-hidden="true" />
                <span className="field-base field-base-third" aria-hidden="true" />
                <span className="field-home-plate" aria-hidden="true" />
                {firstInning.map(({ playerId, playerName, position }) => (
                  <span
                    className={`field-player ${fieldPositionClass[position]}`}
                    key={`${playerId}-${position}`}
                    role="listitem"
                    title={`${playerName} — ${position}`}
                  >
                    <strong>{positionLabel(position)}</strong>
                    <span>{shortPlayerName(playerName)}</span>
                  </span>
                ))}
              </div>
            </section>
          )}
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
        </>
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
