import { CalendarDays, ChevronLeft, ChevronRight, Eye, Share2, ShieldCheck, Users } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'
import type { AppState, LineupRow, TeamSummary } from '../types'
import { FieldStarLockup } from './FieldStarBrand'
import { TeamLogo } from './TeamLogo'

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
  const { label, lineup } = getParentLineup(state)
  const [selectedInning, setSelectedInning] = useState(0)
  const activeInning = Math.min(selectedInning, Math.max(0, state.innings - 1))
  const fieldPositions = useMemo(() => Object.keys(fieldPositionClass).flatMap((position) => {
    const players = lineup
      .filter((row) => row.assignments[activeInning] === position)
      .map((row) => ({ playerName: row.playerName }))
    return players.length ? [{ position, players }] : []
  }), [activeInning, lineup])

  return (
    <section className="workspace parent-game-card">
      <div className="parent-brand-band">
        <FieldStarLockup className="parent-card-brand" markSize={30} onDark />
        <span>Family game card</span>
      </div>
      <header className="parent-card-header">
        <div className="parent-card-team-row">
          <div className="parent-team-lockup">
            <TeamLogo className="parent-team-logo" team={team} variant="card" />
            <div>
              <span className="section-kicker">View only</span>
              <h2>{team.name}</h2>
              <p>{label} for families</p>
            </div>
          </div>
          <button type="button" className="parent-share-button" onClick={onShareLineup} aria-label="Share lineup">
            <Share2 size={18} /> <span>Share</span>
          </button>
        </div>
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
          <section className="parent-field-preview" aria-labelledby="parent-field-title">
              <div className="parent-field-copy">
                <span className="section-kicker">Game snapshot</span>
                <h3 id="parent-field-title">Inning {activeInning + 1} at a glance</h3>
                <p>Preview each inning here. The full batting-order grid stays below.</p>
                <div className="parent-field-stepper" aria-label="Choose inning">
                  <button
                    type="button"
                    onClick={() => setSelectedInning((inning) => Math.max(0, inning - 1))}
                    disabled={activeInning === 0}
                    aria-label="Previous inning"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <strong>Inning {activeInning + 1} of {state.innings}</strong>
                  <button
                    type="button"
                    onClick={() => setSelectedInning((inning) => Math.min(state.innings - 1, inning + 1))}
                    disabled={activeInning === state.innings - 1}
                    aria-label="Next inning"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
              <div className="parent-field-diamond" role="list" aria-label={`Inning ${activeInning + 1} field positions`}>
                <span className="field-line field-line-left" aria-hidden="true" />
                <span className="field-line field-line-right" aria-hidden="true" />
                <span className="field-base field-base-first" aria-hidden="true" />
                <span className="field-base field-base-second" aria-hidden="true" />
                <span className="field-base field-base-third" aria-hidden="true" />
                <span className="field-home-plate" aria-hidden="true" />
                {fieldPositions.map(({ players, position }) => (
                  <span
                    className={`field-player ${players.length > 1 ? 'has-duplicates' : ''} ${fieldPositionClass[position]}`}
                    key={position}
                    role="listitem"
                    title={`${players.map(({ playerName }) => playerName).join(', ')} — ${position}`}
                  >
                    <strong>{positionLabel(position)}</strong>
                    <span>{players.map(({ playerName }) => shortPlayerName(playerName)).join(' / ')}</span>
                  </span>
                ))}
                {fieldPositions.length === 0 && (
                  <span className="field-empty">No field positions assigned for this inning.</span>
                )}
              </div>
            </section>
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
