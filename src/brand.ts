export const BRAND_COLORS = {
  cream: '#F7F3E8',
  surface: '#FDFBF4',
  grass: '#3E7C4F',
  grassTint: '#E5EFE2',
  clay: '#C75B39',
  clayTint: '#F7E4DB',
  ink: '#26312A',
  muted: '#8B8069',
  line: '#D8CFB8',
  hairline: '#EDE6D2',
} as const

export const BRAND_NAME = 'fieldstar'
export const BRAND_SLOGAN = 'EVERY KID PLAYS THE FIELD'
export const BRAND_FONTS = {
  display: '"Zilla Slab"',
  ui: 'Karla',
} as const

export const BRAND_CSS_TOKENS = {
  '--cream': BRAND_COLORS.cream,
  '--page-bg': BRAND_COLORS.cream,
  '--surface': BRAND_COLORS.surface,
  '--ink': BRAND_COLORS.ink,
  '--muted': BRAND_COLORS.muted,
  '--line': BRAND_COLORS.line,
  '--line-strong': BRAND_COLORS.line,
  '--hairline': BRAND_COLORS.hairline,
  '--grass': BRAND_COLORS.grass,
  '--grass-tint': BRAND_COLORS.grassTint,
  '--brand': BRAND_COLORS.grass,
  '--brand-dark': BRAND_COLORS.grass,
  '--brand-soft': BRAND_COLORS.grassTint,
  '--clay': BRAND_COLORS.clay,
  '--clay-tint': BRAND_COLORS.clayTint,
  '--accent': BRAND_COLORS.clay,
  '--accent-soft': BRAND_COLORS.clayTint,
  '--panel': BRAND_COLORS.surface,
  '--header-muted': BRAND_COLORS.cream,
  '--danger': BRAND_COLORS.clay,
} as const

export function applyBrandTokens(root: HTMLElement = document.documentElement) {
  Object.entries(BRAND_CSS_TOKENS).forEach(([token, value]) => root.style.setProperty(token, value))
}
