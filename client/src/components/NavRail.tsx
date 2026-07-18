import { useState, useRef, useEffect } from 'react'

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

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
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
