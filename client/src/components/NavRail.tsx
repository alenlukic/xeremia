import { useState, useRef, useEffect } from 'react'
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick'
import { SetPickerControls } from './SetPickerControls'
import type { SetSummary } from '../types'
import type { PendingAdd } from '../hooks/useSetBuilder'

export type BottomView = 'matches' | 'set' | 'admin'

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
    <nav className="nav-rail">
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
  )
}
