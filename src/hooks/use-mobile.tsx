import { useSyncExternalStore } from "react"

const MOBILE_BREAKPOINT = 768

function subscribeToMobileChange(onChange: () => void) {
  const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function getMobileSnapshot() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
}

export function useIsMobile() {
  return useSyncExternalStore(subscribeToMobileChange, getMobileSnapshot, () => false)
}
