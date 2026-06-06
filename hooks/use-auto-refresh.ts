/**
 * useAutoRefresh — v3.74.56
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
 */
import { useEffect, useRef } from "react"

interface UseAutoRefreshOptions {
  /** Function that reloads the page's data. Async is fine. */
  onRefresh: () => void | Promise<void>
  /** Default: true. Disable e.g. while a modal is open or initial load is in flight. */
  enabled?: boolean
  /** Minimum gap between refreshes, in milliseconds. Default: 5000. */
  minIntervalMs?: number
}

export function useAutoRefresh({
  onRefresh,
  enabled = true,
  minIntervalMs = 5000,
}: UseAutoRefreshOptions): void {
  // Keep the latest callback in a ref so listeners always call the
  // current version without forcing the effect to re-attach.
  const refreshRef = useRef(onRefresh)
  refreshRef.current = onRefresh

  // Track the last successful refresh trigger to enforce the throttle.
  const lastRunRef = useRef<number>(0)

  useEffect(() => {
    if (!enabled) return
    if (typeof window === "undefined") return

    const tryRefresh = () => {
      const now = Date.now()
      if (now - lastRunRef.current < minIntervalMs) return
      lastRunRef.current = now
      try {
        const result = refreshRef.current()
        if (result && typeof (result as Promise<void>).catch === "function") {
          ;(result as Promise<void>).catch((err) => {
            // Silent — page-level error handling is the consumer's job.
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
  }, [enabled, minIntervalMs])
}
