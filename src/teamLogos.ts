import type { TeamSummary } from './types'

const TEAM_LOGOS: Record<string, string> = {
  bananabombers: '/team-logos/banana-bombers.jpeg',
  bluenamis: '/team-logos/blue-namis.png',
  diamondbacks: '/team-logos/diamondbacks.png',
  ketchupdevils: '/team-logos/ketchup-devils.jpeg',
  purplepanthers: '/team-logos/purple-panthers.jpeg',
  smashingpumpkins: '/team-logos/smashing-pumpkins.jpeg',
  swampmonsters: '/team-logos/swamp-monsters.jpeg',
}

function logoKey(value: string | undefined) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? ''
}

export function getTeamLogo(team: Pick<TeamSummary, 'id' | 'name'> | null | undefined) {
  if (!team) return ''
  return TEAM_LOGOS[logoKey(team.name)] ?? TEAM_LOGOS[logoKey(team.id)] ?? ''
}
