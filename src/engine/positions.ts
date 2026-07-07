import { FIELDING_POSITIONS } from '../types'
import type { FieldingPosition, Position } from '../types'

export function isFieldingPosition(value: Position): value is FieldingPosition {
  return FIELDING_POSITIONS.includes(value as FieldingPosition)
}

export function getFieldingPositions(fieldingSpots: number) {
  const ordered = fieldingSpots < FIELDING_POSITIONS.length
    ? FIELDING_POSITIONS.filter((position) => position !== 'Rover')
    : FIELDING_POSITIONS.slice()
  return ordered.slice(0, Math.min(fieldingSpots, ordered.length))
}

export function getAssignableFieldingPositions(fieldingSpots: number, fielderCount: number) {
  return getFieldingPositions(Math.min(fieldingSpots, fielderCount))
}
