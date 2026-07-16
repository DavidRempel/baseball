import type { TeamSummary } from './types'

const TEAM_LOGOS: Record<string, string> = {
  bananabomber: '/team-logos/banana-bombers.jpeg',
  bananabombers: '/team-logos/banana-bombers.jpeg',
  bluenami: '/team-logos/blue-namis.png',
  bluenamis: '/team-logos/blue-namis.png',
  diamondbacks: '/team-logos/diamondbacks.png',
  ketchupdevil: '/team-logos/ketchup-devils.jpeg',
  ketchupdevils: '/team-logos/ketchup-devils.jpeg',
  purplepanther: '/team-logos/purple-panthers.jpeg',
  purplepanthers: '/team-logos/purple-panthers.jpeg',
  smashingpumpkin: '/team-logos/smashing-pumpkins.jpeg',
  smashingpumpkins: '/team-logos/smashing-pumpkins.jpeg',
  swampmonster: '/team-logos/swamp-monsters.jpeg',
  swampmonsters: '/team-logos/swamp-monsters.jpeg',
}

function logoKey(value: string | undefined) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? ''
}

export function getTeamLogo(team: Pick<TeamSummary, 'id' | 'logoDataUrl' | 'name'> | null | undefined) {
  if (!team) return ''
  if (team.logoDataUrl) return team.logoDataUrl
  return TEAM_LOGOS[logoKey(team.name)] ?? TEAM_LOGOS[logoKey(team.id)] ?? ''
}

export function getTeamInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'FS'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words.at(-1)?.[0] ?? ''}`.toUpperCase()
}
