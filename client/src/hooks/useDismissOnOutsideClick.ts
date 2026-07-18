import { useEffect, useRef } from 'react'

/**
 * Invoke `onDismiss` when a mousedown lands outside `ref`'s subtree while
 * `active` is true. Shared by dropdown/menu components so the dismiss
 * behavior stays consistent across them.
 */
export function useDismissOnOutsideClick(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
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
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismissRef.current()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [ref, active])
}
