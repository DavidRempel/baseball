import { ListPlus, Users } from 'lucide-react'
import type { TeamSummary } from '../types'

type TeamHomeProps = {
  canCreateTeams: boolean
  onCreateTeam: () => void
  onSwitchTeam: (teamId: string) => void
  teams: TeamSummary[]
}

export function TeamHome({ canCreateTeams, onCreateTeam, onSwitchTeam, teams }: TeamHomeProps) {
  const visibleTeams = teams.slice().sort((a, b) => a.name.localeCompare(b.name))

  return (
    <section className="workspace team-home">
      <div className="team-home-header">
        <div>
          <h2>Choose a team</h2>
          <p className="quiet">Parents can view any team. Coaches need a private edit link to save changes.</p>
        </div>
        {canCreateTeams && (
          <button type="button" onClick={onCreateTeam}>
            <ListPlus size={18} /> Add Team
          </button>
        )}
      </div>
      {visibleTeams.length === 0 ? (
        <div className="empty-state">
          <Users size={32} />
          <h2>No teams found yet.</h2>
        </div>
      ) : (
        <div className="team-grid">
          {visibleTeams.map((team) => (
            <button type="button" className="team-card" key={team.id} onClick={() => onSwitchTeam(team.id)}>
              <strong>{team.name}</strong>
              <span>View lineup</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
