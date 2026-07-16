import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BRAND_COLORS, BRAND_CSS_TOKENS, BRAND_NAME, BRAND_SLOGAN } from './brand'
import { FieldStarMark } from './components/FieldStarBrand'

function relativeLuminance(hex: string) {
  const values = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
  const [red, green, blue] = values.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

function contrast(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
}

describe('clubhouse brand system', () => {
  it('keeps shared CSS and canvas colours on the v4 palette', () => {
    expect(BRAND_CSS_TOKENS['--cream']).toBe(BRAND_COLORS.cream)
    expect(BRAND_CSS_TOKENS['--grass']).toBe(BRAND_COLORS.grass)
    expect(BRAND_CSS_TOKENS['--grass-tint']).toBe(BRAND_COLORS.grassTint)
    expect(BRAND_CSS_TOKENS['--clay']).toBe(BRAND_COLORS.clay)
    expect(BRAND_CSS_TOKENS['--clay-tint']).toBe(BRAND_COLORS.clayTint)
    expect(BRAND_CSS_TOKENS['--page-bg']).toBe(BRAND_COLORS.cream)
    expect(BRAND_CSS_TOKENS['--brand']).toBe(BRAND_COLORS.grass)
    expect(BRAND_CSS_TOKENS['--accent']).toBe(BRAND_COLORS.clay)
    expect(BRAND_NAME).toBe('fieldstar')
    expect(BRAND_SLOGAN).toBe('EVERY KID PLAYS THE FIELD')
  })

  it('passes normal-text contrast for the primary grass and ink colours', () => {
    expect(contrast(BRAND_COLORS.grass, BRAND_COLORS.cream)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(BRAND_COLORS.ink, BRAND_COLORS.cream)).toBeGreaterThanOrEqual(4.5)
    // Clay is deliberately limited to large numerals and non-text accents.
    expect(contrast(BRAND_COLORS.clay, BRAND_COLORS.cream)).toBeGreaterThanOrEqual(3)
  })

  it('removes noisy stitch seams at small icon sizes', () => {
    expect(renderToStaticMarkup(<FieldStarMark size={24} />)).not.toContain('fieldstar-logo-stitches')
    expect(renderToStaticMarkup(<FieldStarMark size={52} />)).toContain('fieldstar-logo-stitches')
  })
})
