import { describe, expect, it } from 'vitest'
import { getTeamLogo } from './teamLogos'

describe('team logos', () => {
  it('matches logos from team names with spaces or casing differences', () => {
    expect(getTeamLogo({ id: 'team-1', name: 'Blue Namis' })).toBe('/team-logos/blue-namis.png')
    expect(getTeamLogo({ id: 'team-2', name: 'smashingPumpkins' })).toBe('/team-logos/smashing-pumpkins.jpeg')
  })

  it('falls back to the team id when the team name is unavailable', () => {
    expect(getTeamLogo({ id: 'purple-panthers', name: 'Shared team' })).toBe('/team-logos/purple-panthers.jpeg')
  })
})
