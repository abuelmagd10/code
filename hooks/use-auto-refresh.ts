/**
 * useAutoRefresh — v3.74.81 (perf hardening)
 *
 * Refreshes a page's data when:
 *   - the user comes back to the window (`focus`)
 *   - the user makes the tab visible again (`visibilitychange`)
 *
 * Throttled so rapid blur/focus toggling can't hammer the database.
 * No realtime / no polling — those exist separately (useRealtimeTable for
 * critical multi-user workflows). This hook is the cheap, universal
 * "you came back, here's fresh data" layer.
 *
 * Usage:
 *   useAutoRefresh({ onRefresh: loadData })
 *
 * Or with a controlled enable flag:
 *   useAutoRefresh({ onRefresh: loadData, enabled: !isLoading })
 *
 * Safe for SSR — the listeners only attach on the client.
 *
 * v3.74.81 changes:
 * - lastRunRef initializes to Date.now() instead of 0. Prevents the
 *   spurious "second fetch" right after mount when a focus event fires
 *   moments later (the throttle window now covers the mount itself).
 * - Default throttle bumped 5s -> 30s. The hook is meant for "you came
 *   back to the tab after a while", not "you blurred for 6 seconds".
 * - New skipIfHidden option: when true, refresh is skipped while the
 *   document is hidden. Recommended on heavy pages where a background
 *   fetch is wasted work. Default false to preserve existing behavior.
 */
import { useEffect, useRef } from "react"

interface UseAutoRefreshOptions {
  /** Function that reloads the page's data. Async is fine. */
  onRefresh: () => void | Promise<void>
  /** Default: true. Disable e.g. while a modal is open or initial load is in flight. */
  enabled?: boolean
  /** Minimum gap between refreshes, in milliseconds. Default: 30000 (was 5000 pre-v3.74.81). */
  minIntervalMs?: number
  /**
   * v3.74.81 - when true, do not refresh while the document is hidden
   * (background tab, minimized, etc.). The listeners still attach so
   * becoming visible again still triggers the refresh.
   * Default false to preserve existing behavior across ~85 pages.
   */
  skipIfHidden?: boolean
}

export function useAutoRefresh(options: UseAutoRefreshOptions): void {
  const enabled = options.enabled !== false
  const minIntervalMs = options.minIntervalMs ?? 30000
  const skipIfHidden = options.skipIfHidden === true

  // Keep the latest callback in a ref so listeners always call the
  // current version without forcing the effect to re-attach.
  const refreshRef = useRef(options.onRefresh)
  refreshRef.current = options.onRefresh

  // v3.74.81: start the throttle window at mount time. Prevents the page's
  // own useEffect-driven initial fetch from being immediately followed by
  // a focus-event-driven re-fetch.
  const lastRunRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!enabled) return
    if (typeof window === "undefined") return

    const tryRefresh = () => {
      if (skipIfHidden && typeof document !== "undefined" && document.visibilityState !== "visible") {
        return
      }
      const now = Date.now()
      if (now - lastRunRef.current < minIntervalMs) return
      lastRunRef.current = now
      try {
        const result = refreshRef.current()
        if (result && typeof (result as Promise<void>).catch === "function") {
          ;(result as Promise<void>).catch((err) => {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[useAutoRefresh] refresh failed:", err)
            }
          })
        }
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[useAutoRefresh] refresh threw:", err)
        }
      }
    }

    const onFocus = () => tryRefresh()
    const onVisibility = () => {
      if (document.visibilityState === "visible") tryRefresh()
    }

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [enabled, minIntervalMs, skipIfHidden])
}
