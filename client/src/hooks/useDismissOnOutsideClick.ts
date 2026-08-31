import { useEffect, useRef } from 'react'

/**
 * Invoke `onDismiss` when a mousedown lands outside `ref`'s subtree while
 * `active` is true. Shared by dropdown/menu components so the dismiss
 * behavior stays consistent across them.
 *
 * Menus that float via {@link FloatingSurface} render in a portal at <body>,
 * outside the trigger's subtree, so pass their surface as `floatingRef` to keep
 * clicks inside the menu from dismissing it.
 */
export function useDismissOnOutsideClick(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
  floatingRef?: React.RefObject<HTMLElement | null>,
) {
  // Callers typically pass an inline closure; routing it through a ref keeps
  // the listener subscription stable across renders while `active` holds.
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  })

  useEffect(() => {
    if (!active) {
      return
    }
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (ref.current?.contains(target)) {
        return
      }
      if (floatingRef?.current?.contains(target)) {
        return
      }
      if (ref.current) {
        onDismissRef.current()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [ref, floatingRef, active])
}
