import { useState, useRef, useEffect, useCallback } from 'react'
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick'
import { SetPickerControls } from './SetPickerControls'
import type { SetSummary } from '../types'
import type { PendingAdd } from '../hooks/useSetBuilder'

export type BottomView = 'matches' | 'set' | 'admin'

const SHOW_DELAY_MS = 200
const HIDE_DELAY_MS = 200

interface Props {
  bottomView: BottomView
  onSelectMatches: () => void
  onSelectSet: () => void
  onSelectAdmin: () => void
  setLabel: string
  sets: SetSummary[]
  activeSetId: number | null
  pendingAdd: PendingAdd | null
  createSet: (name: string) => Promise<SetSummary | null>
  selectSet: (id: number) => void
  deleteSet: (id: number) => void
  resolvePendingAdd: (setId: number) => void
  clearPendingAdd: () => void
}

export function NavRail({
  bottomView,
  onSelectMatches,
  onSelectSet,
  onSelectAdmin,
  setLabel,
  sets,
  activeSetId,
  pendingAdd,
  createSet,
  selectSet,
  deleteSet,
  resolvePendingAdd,
  clearPendingAdd,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const [navVisible, setNavVisible] = useState(false)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
  }, [])

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const scheduleHide = useCallback(() => {
    clearHideTimer()
    hideTimerRef.current = setTimeout(() => {
      setNavVisible(false)
      hideTimerRef.current = null
    }, HIDE_DELAY_MS)
  }, [clearHideTimer])

  const handleTriggerEnter = useCallback(() => {
    clearHideTimer()
    if (navVisible) {
      return
    }
    clearShowTimer()
    showTimerRef.current = setTimeout(() => {
      setNavVisible(true)
      showTimerRef.current = null
      scheduleHide()
    }, SHOW_DELAY_MS)
  }, [navVisible, clearHideTimer, clearShowTimer, scheduleHide])

  const handleTriggerLeave = useCallback(() => {
    clearShowTimer()
  }, [clearShowTimer])

  const handleNavEnter = useCallback(() => {
    clearHideTimer()
  }, [clearHideTimer])

  const handleNavLeave = useCallback(() => {
    scheduleHide()
  }, [scheduleHide])

  // The chevron follows the nav: it lives above the hidden bar (acting as the
  // show trigger) and re-attaches under the bar once open (acting like the
  // rest of the bar for hide/keep-open purposes), so its enter/leave behavior
  // must match whichever role it is currently playing.
  const handleChevronLeave = useCallback(() => {
    if (navVisible) {
      scheduleHide()
    } else {
      clearShowTimer()
    }
  }, [navVisible, scheduleHide, clearShowTimer])

  useEffect(() => {
    return () => {
      clearShowTimer()
      clearHideTimer()
    }
  }, [clearShowTimer, clearHideTimer])

  useDismissOnOutsideClick(menuRef, menuOpen, () => setMenuOpen(false))

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setMenuOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen])

  return (
    <>
      <div
        className="nav-trigger-zone"
        onMouseEnter={handleTriggerEnter}
        onMouseLeave={handleTriggerLeave}
      />
      <div
        className={`nav-trigger-chevron${navVisible ? ' nav-trigger-chevron--open' : ''}`}
        onMouseEnter={handleTriggerEnter}
        onMouseLeave={handleChevronLeave}
        aria-hidden="true"
      >
        ⌄
      </div>
      <nav
        className={`nav-rail${navVisible ? ' nav-rail--visible' : ''}`}
        onMouseEnter={handleNavEnter}
        onMouseLeave={handleNavLeave}
      >
        <button
          className={`tab${bottomView === 'matches' ? ' active' : ''}`}
          onClick={onSelectMatches}
        >
          Matches
        </button>
        <button
          className={`tab${bottomView === 'set' ? ' active' : ''}`}
          onClick={onSelectSet}
        >
          {setLabel}
        </button>
        {bottomView === 'set' && (
          <SetPickerControls
            sets={sets}
            activeSetId={activeSetId}
            pendingAdd={pendingAdd}
            createSet={createSet}
            selectSet={selectSet}
            deleteSet={deleteSet}
            resolvePendingAdd={resolvePendingAdd}
            clearPendingAdd={clearPendingAdd}
          />
        )}
        <div className="nav-rail-menu-wrapper" ref={menuRef}>
          <button
            className="nav-rail-menu-toggle"
            aria-label="Menu"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="nav-rail-menu">
              <button
                className={`nav-rail-menu-item${bottomView === 'admin' ? ' active' : ''}`}
                onClick={() => {
                  onSelectAdmin()
                  setMenuOpen(false)
                }}
              >
                Admin
              </button>
            </div>
          )}
        </div>
      </nav>
    </>
  )
}
