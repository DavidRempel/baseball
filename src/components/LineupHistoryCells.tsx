import { FIELDING_POSITIONS } from '../types'
import type { FieldingPosition, Player } from '../types'

export function CountCell({
  delta = 0,
  marker,
  markerLabel,
  value,
}: {
  delta?: number
  marker?: 'preferred' | 'disliked'
  markerLabel?: string
  value: number
}) {
  const markerText = marker === 'preferred' ? '^' : '-'
  return (
    <span className={`history-count${delta > 0 ? ' projected-count' : ''}${marker ? ` history-count-${marker}` : ''}`} title={markerLabel}>
      {value + delta}
      <small className={marker ? '' : 'history-marker-placeholder'} aria-label={markerLabel} aria-hidden={!marker}>
        {markerText}
      </small>
    </span>
  )
}

export function PositionCountCell({
  delta = 0,
  player,
  position,
  value,
}: {
  delta?: number
  player: Player | undefined
  position: FieldingPosition
  value: number
}) {
  const dislikedIndex = player?.dislikedPositions.indexOf(position) ?? -1
  const preferredIndex = player?.preferredPositions.indexOf(position) ?? -1
  if (dislikedIndex >= 0) {
    return <CountCell value={value} delta={delta} marker="disliked" markerLabel={`Avoids ${position}`} />
  }
  if (preferredIndex >= 0) {
    return <CountCell value={value} delta={delta} marker="preferred" markerLabel={`Preference ${preferredIndex + 1}: ${position}`} />
  }
  return <CountCell value={value} delta={delta} />
}

export function PositionHistoryHeader({ positionLabel }: { positionLabel: (position: FieldingPosition) => string }) {
  return (
    <>
      {FIELDING_POSITIONS.map((position) => (
        <span key={position}>{positionLabel(position)}</span>
      ))}
    </>
  )
}
