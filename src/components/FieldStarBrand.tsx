import { BRAND_COLORS, BRAND_NAME, BRAND_SLOGAN } from '../brand'

type FieldStarMarkProps = {
  className?: string
  onDark?: boolean
  size?: number
}

export function FieldStarMark({ className = '', onDark = false, size = 54 }: FieldStarMarkProps) {
  const compact = size <= 28
  const classes = ['fieldstar-logo-mark', compact ? 'is-compact' : '', onDark ? 'is-on-dark' : '', className]
    .filter(Boolean)
    .join(' ')

  const circleFill = onDark ? BRAND_COLORS.clay : BRAND_COLORS.cream
  const detail = onDark ? BRAND_COLORS.cream : BRAND_COLORS.grass
  const stitch = onDark ? BRAND_COLORS.cream : BRAND_COLORS.clay

  return (
    <svg className={classes} width={size} height={size} viewBox="0 0 54 54" aria-hidden="true">
      <circle cx="27" cy="27" r="24" fill={circleFill} stroke={detail} strokeWidth={onDark ? 0 : 3} />
      {!compact && (
        <g className="fieldstar-logo-stitches">
          <path d="M13 10 C18.5 20,18.5 34,13 44" fill="none" stroke={stitch} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 5" />
          <path d="M41 10 C35.5 20,35.5 34,41 44" fill="none" stroke={stitch} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 5" />
        </g>
      )}
      <path d="M27 19 L29.5 25.6 L36.4 25.9 L31 30.2 L32.9 36.9 L27 32.9 L21.1 36.9 L23 30.2 L17.6 25.9 L24.5 25.6 Z" fill={detail} />
    </svg>
  )
}

type FieldStarLockupProps = {
  className?: string
  markSize?: number
  onDark?: boolean
  showSlogan?: boolean
}

export function FieldStarLockup({ className = '', markSize = 54, onDark = false, showSlogan = true }: FieldStarLockupProps) {
  return (
    <span className={`fieldstar-logo-lockup ${onDark ? 'is-on-dark' : ''} ${className}`.trim()}>
      <FieldStarMark onDark={onDark} size={markSize} />
      <span className="fieldstar-logo-copy">
        <strong>{BRAND_NAME}</strong>
        {showSlogan && <small>{BRAND_SLOGAN}</small>}
      </span>
    </span>
  )
}
