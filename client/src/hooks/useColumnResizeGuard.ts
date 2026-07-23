import { useCallback, useRef } from 'react'

/**
 * Stops the click the browser synthesizes at the end of a column-resize drag
 * from activating a header's sort (the pointer often releases over an adjacent
 * header). Standard drag-vs-click disambiguation: once a resize starts, swallow
 * the next click in the capture phase — before it can reach any sort handler.
 *
 * Wire {@link onResizeStart} into the resize handle's `onMouseDown`/`onTouchStart`
 * (alongside the existing resize handler). Optionally gate a header's sort
 * `onClick` with {@link shouldIgnoreSortClick} as belt-and-suspenders.
 */
export function useColumnResizeGuard() {
  const resizingRef = useRef(false)
  // While a swallow is armed, sort clicks are also ignored defensively.
  const guardingRef = useRef(false)

  const onResizeStart = useCallback(() => {
    resizingRef.current = true
    guardingRef.current = true

    const swallow = (e: Event) => {
      e.stopPropagation()
      e.preventDefault()
      window.removeEventListener('click', swallow, true)
      guardingRef.current = false
    }

    const onEnd = () => {
      window.removeEventListener('mouseup', onEnd, true)
      window.removeEventListener('touchend', onEnd, true)
      resizingRef.current = false
      // The drag's click fires right after release; catch it in capture. If no
      // click follows (e.g. released off-target), stop guarding shortly after.
      window.addEventListener('click', swallow, true)
      window.setTimeout(() => {
        window.removeEventListener('click', swallow, true)
        guardingRef.current = false
      }, 300)
    }

    window.addEventListener('mouseup', onEnd, true)
    window.addEventListener('touchend', onEnd, true)
  }, [])

  const shouldIgnoreSortClick = useCallback(
    () => resizingRef.current || guardingRef.current,
    [],
  )

  return { onResizeStart, shouldIgnoreSortClick }
}
