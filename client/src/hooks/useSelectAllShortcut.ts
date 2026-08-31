import { useEffect } from 'react'

/**
 * Bind Cmd/Ctrl+A to a view's own select-all.
 *
 * The workspace shows several track lists at once, so the shortcut has to pick
 * exactly one. It resolves to the view holding focus: a list claims focus when
 * it is clicked, which is also the gesture that makes it the thing being
 * worked on. Without a focused list the shortcut is left alone, so it keeps
 * meaning "select all text" everywhere else.
 */
export function useSelectAllShortcut(
  ref: React.RefObject<HTMLElement | null>,
  onSelectAll: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) {
      return
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'a' && event.key !== 'A') {
        return
      }
      if (!event.metaKey && !event.ctrlKey) {
        return
      }
      const host = ref.current
      const active = document.activeElement
      if (!host || !active || !host.contains(active)) {
        return
      }
      // Never steal it from a field the user is typing in.
      const tag = active.tagName
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (active as HTMLElement).isContentEditable
      ) {
        return
      }
      event.preventDefault()
      onSelectAll()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [ref, onSelectAll, enabled])
}
