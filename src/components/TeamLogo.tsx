import type { TeamSummary } from '../types'
import { getTeamInitials, getTeamLogo } from '../teamLogos'

type TeamLogoProps = {
  className?: string
  team: Pick<TeamSummary, 'id' | 'logoDataUrl' | 'name'>
  variant?: 'avatar' | 'card' | 'watermark'
}

export function TeamLogo({ className = '', team, variant = 'card' }: TeamLogoProps) {
  const logo = getTeamLogo(team)
  return (
    <span className={`team-logo team-logo-${variant} ${className}`.trim()} aria-hidden="true">
      {logo
        ? <img src={logo} alt="" />
        : <span className="team-logo-initials">{getTeamInitials(team.name)}</span>}
    </span>
  )
}

export function TeamLogoWatermark({ team }: Pick<TeamLogoProps, 'team'>) {
  return <TeamLogo team={team} variant="watermark" />
}
