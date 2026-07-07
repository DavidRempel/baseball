import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

export function useFlipListAnimation(
  rowIds: string[],
  mode: string,
  containerRef?: RefObject<HTMLElement | null>,
  animationKey?: string | number,
) {
  const previousRects = useRef<Map<string, DOMRect>>(new Map())
  const previousAnimationKey = useRef<string | number | undefined>(animationKey)
  const rowOrderKey = rowIds.join('|')

  useLayoutEffect(() => {
    const container = containerRef?.current ?? document
    const elements = Array.from(container.querySelectorAll<HTMLElement>(`[data-lineup-mode="${mode}"][data-lineup-row-id]`))
    const nextRects = new Map(elements.map((element) => [element.dataset.lineupRowId ?? '', element.getBoundingClientRect()]))
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const shouldAnimate = animationKey !== undefined && animationKey !== previousAnimationKey.current

    elements.forEach((element) => {
      const rowId = element.dataset.lineupRowId
      if (!rowId) return

      const previous = previousRects.current.get(rowId)
      const next = nextRects.get(rowId)
      if (!previous || !next) return
      if (!shouldAnimate) return

      const deltaX = previous.left - next.left
      const deltaY = previous.top - next.top
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return
      if (reduceMotion) return

      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: 'translate(0, 0)' },
        ],
        {
          duration: 190,
          easing: 'cubic-bezier(0.2, 0, 0, 1)',
        },
      )
    })

    previousRects.current = nextRects
    previousAnimationKey.current = animationKey
  }, [animationKey, containerRef, mode, rowOrderKey])
}
