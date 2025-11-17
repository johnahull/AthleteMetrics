import * as React from "react"
import { RESPONSIVE_BREAKPOINTS } from "@shared/constants"

const { MOBILE_BREAKPOINT, TABLET_BREAKPOINT } = RESPONSIVE_BREAKPOINTS

export type ResponsiveMode = 'mobile' | 'tablet' | 'desktop'

/**
 * Hook to detect the current responsive mode based on viewport width.
 *
 * Breakpoints:
 * - Mobile: < 768px
 * - Tablet: 768px - 1023px
 * - Desktop: >= 1024px
 *
 * Uses window.matchMedia for optimal performance - only fires when
 * breakpoint boundaries are crossed, not on every resize event.
 * This approach is more efficient than listening to resize events.
 *
 * @returns {ResponsiveMode} Current responsive mode ('mobile' | 'tablet' | 'desktop')
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const mode = useResponsiveMode();
 *
 *   return (
 *     <div>
 *       {mode === 'mobile' && <MobileView />}
 *       {mode === 'tablet' && <TabletView />}
 *       {mode === 'desktop' && <DesktopView />}
 *     </div>
 *   );
 * }
 * ```
 */
export function useResponsiveMode(): ResponsiveMode {
  const [mode, setMode] = React.useState<ResponsiveMode>(() => {
    // SSR-safe initial value
    if (typeof window === 'undefined') return 'desktop'

    const width = window.innerWidth
    if (width < MOBILE_BREAKPOINT) return 'mobile'
    if (width < TABLET_BREAKPOINT) return 'tablet'
    return 'desktop'
  })

  React.useEffect(() => {
    // Skip effect in SSR environment
    if (typeof window === 'undefined') return

    const getMode = (): ResponsiveMode => {
      const width = window.innerWidth
      if (width < MOBILE_BREAKPOINT) return 'mobile'
      if (width < TABLET_BREAKPOINT) return 'tablet'
      return 'desktop'
    }

    const onChange = () => {
      setMode(getMode())
    }

    // Listen for both breakpoints
    const mqlMobile = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const mqlTablet = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT}px) and (max-width: ${TABLET_BREAKPOINT - 1}px)`)

    mqlMobile.addEventListener("change", onChange)
    mqlTablet.addEventListener("change", onChange)

    setMode(getMode())

    return () => {
      mqlMobile.removeEventListener("change", onChange)
      mqlTablet.removeEventListener("change", onChange)
    }
  }, [])

  return mode
}

export function useIsTablet(): boolean {
  const mode = useResponsiveMode()
  return mode === 'tablet'
}

export function useIsMobile() {
  const mode = useResponsiveMode()
  return mode === 'mobile'
}
