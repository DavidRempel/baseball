import { describe, expect, it } from 'vitest'
import { buildGamesFromCsv, normalizeHistoryImportText, parseSitInnings } from './csv'

describe('history CSV import', () => {
  it('imports valid rows and creates missing players', () => {
    const imported = buildGamesFromCsv(
      normalizeHistoryImportText('Date,Player,Bat,1,2\n2026-07-01,A,1,P,Sit\n2026-07-01,B,2,C,SS'),
      [],
    )

    expect(imported.players.map((player) => player.name)).toEqual(['A', 'B'])
    expect(imported.games).toHaveLength(1)
    expect(imported.games[0].lineup.map((row) => row.assignments.slice(0, 2))).toEqual([
      ['P', 'Sit'],
      ['C', 'SS'],
    ])
  })

  it('rejects bad rows with row-level details', () => {
    expect(() => buildGamesFromCsv('Date,Player,Bat,1\n2026-07-01,A,nope,Moon', [])).toThrow(
      /row 2: inning 1 has unknown position "Moon"; row 2: bat order must be a positive number/,
    )
  })
})

describe('manual sit inning parsing', () => {
  it('ignores duplicates, invalid values, zero, and innings beyond the game length', () => {
    expect(Array.from(parseSitInnings('1, 2 2 x 0 5', 4)).sort()).toEqual([0, 1])
  })
})
