import { Eye, EyeOff, KeyRound, ListPlus, ShieldCheck, Users } from 'lucide-react'
import { getTeamLogo } from '../teamLogos'
import type { TeamSummary, TeamTokenMap } from '../types'

type TeamHomeProps = {
  canCreateTeams: boolean
  editTokens: TeamTokenMap
  onCreateTeam: () => void
  onSwitchTeam: (teamId: string) => void
  teams: TeamSummary[]
}

export function TeamHome({ canCreateTeams, editTokens, onCreateTeam, onSwitchTeam, teams }: TeamHomeProps) {
  const visibleTeams = teams.slice().sort((a, b) => a.name.localeCompare(b.name))
  const editableCount = visibleTeams.filter((team) => editTokens[team.id]).length

  return (
    <section className="workspace team-home">
      <div className="team-home-header">
        <div className="team-home-title">
          <span className="section-kicker">Teams</span>
          <h2>Choose a team</h2>
          <div className="team-home-guidance" aria-label="Access guidance">
            <span><Eye size={14} /> Parents can view any team</span>
            <span><KeyRound size={14} /> Coaches need a private edit link</span>
          </div>
        </div>
        {canCreateTeams && (
          <button type="button" className="primary" onClick={onCreateTeam}>
            <ListPlus size={18} /> Add Team
          </button>
        )}
      </div>
      <div className="team-home-summary" aria-label="Team access summary">
        <span><Users size={15} /> {visibleTeams.length} teams</span>
        <span><ShieldCheck size={15} /> {editableCount} editable here</span>
        <span><Eye size={15} /> Listed teams appear here</span>
      </div>
      {visibleTeams.length === 0 ? (
        <div className="empty-state">
          <Users size={32} />
          <h2>No teams found yet.</h2>
        </div>
      ) : (
        <div className="team-grid">
          {visibleTeams.map((team) => {
            const canEditTeam = Boolean(editTokens[team.id])
            return (
              <button type="button" className={`team-card ${canEditTeam ? 'editable' : ''}`} key={team.id} onClick={() => onSwitchTeam(team.id)}>
                <img className="team-card-logo" src={getTeamLogo(team) || '/fieldstar-mark.png'} alt="" />
                <span className="team-card-copy">
                  <span className="team-card-topline">
                    <strong>{team.name}</strong>
                    <span className={`access-chip ${canEditTeam ? 'editable' : ''}`}>
                      {team.listed === false ? 'Unlisted' : canEditTeam ? 'Edit ready' : 'View only'}
                    </span>
                  </span>
                  <span className="team-card-action">
                    {team.listed === false ? <EyeOff size={14} /> : <Eye size={14} />} View lineup
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
