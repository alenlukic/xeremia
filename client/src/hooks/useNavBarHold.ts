import { createContext, useContext, useEffect } from 'react'

/** Adjusts the count of reasons the auto-hiding nav bar must stay revealed. */
export type NavBarHold = (delta: number) => void

export const NavBarHoldContext = createContext<NavBarHold | null>(null)

/**
 * Keep the auto-hiding nav bar revealed while `active`, so an open menu is not
 * yanked away when the pointer leaves the bar to reach it. There is no provider
 * outside the nav bar and this does nothing there, which is what lets the same
 * dropdown be reused anywhere in the workspace.
 */
export function useNavBarHold(active: boolean) {
  const hold = useContext(NavBarHoldContext)
  useEffect(() => {
    if (!hold || !active) {
      return
    }
    hold(1)
    return () => hold(-1)
  }, [hold, active])
}
