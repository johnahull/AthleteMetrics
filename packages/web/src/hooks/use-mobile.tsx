import * as React from "react"

export const MOBILE_BREAKPOINT = 768
export const TABLET_BREAKPOINT = 1024

export type ResponsiveMode = 'mobile' | 'tablet' | 'desktop'

export function useResponsiveMode(): ResponsiveMode {
  const [mode, setMode] = React.useState<ResponsiveMode | undefined>(undefined)

  React.useEffect(() => {
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

  return mode || 'desktop'
}

export function useIsTablet(): boolean {
  const mode = useResponsiveMode()
  return mode === 'tablet'
}

export function useIsMobile() {
  const mode = useResponsiveMode()
  return mode === 'mobile'
}
