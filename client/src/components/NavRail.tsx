import { useState, useRef, useEffect } from 'react'
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick'

export type BottomView = 'matches' | 'set' | 'admin'

interface Props {
  bottomView: BottomView
  onSelectMatches: () => void
  onSelectSet: () => void
  onSelectAdmin: () => void
  setLabel: string
}

export function NavRail({
  bottomView,
  onSelectMatches,
  onSelectSet,
  onSelectAdmin,
  setLabel,
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
