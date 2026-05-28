"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// ─── Public shapes ────────────────────────────────────────────────────────────

export interface AIProactiveAlert {
  key: string
  type: string
  severity: "critical" | "warning" | "info"
  resource: string
  title: string
  message: string
  actionUrl: string | null
  count: number
  totalAmount: number | null
  metadata: Record<string, unknown> | null
}

export interface UseAIAlertsReturn {
  alerts: AIProactiveAlert[]
  total: number
  isLoading: boolean
  refresh: () => void
}

// ─── Config ──────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 60_000 // 60 s — light enough, fresh enough

/**
 * useAIAlerts — fetches proactive smart suggestions and refreshes every minute.
 *
 * Governance: relies entirely on the API endpoint /api/ai/alerts which itself
 * defers to the SECURITY INVOKER RPC. Nothing here bypasses permissions.
 *
 * Disabled when `enabled` is false (e.g. when the assistant is excluded for
 * the current page) — avoids needless fetches and respects user preference.
 */
export function useAIAlerts(
  lang: "ar" | "en",
  enabled: boolean
): UseAIAlertsReturn {
  const [alerts, setAlerts] = useState<AIProactiveAlert[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFetchRef = useRef<number>(0)

  const fetchOnce = useCallback(async () => {
    if (!enabled) return

    // Cancel any in-flight request before starting a new one
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    try {
      const response = await fetch(
        `/api/ai/alerts?language=${encodeURIComponent(lang)}`,
        { signal: controller.signal, credentials: "same-origin" }
      )
      if (!response.ok) {
        setAlerts([])
        return
      }
      const payload = await response.json()
      const rows: AIProactiveAlert[] = Array.isArray(payload?.alerts)
        ? payload.alerts
            .filter((a: any) => a && typeof a.key === "string")
            .map(
              (a: any): AIProactiveAlert => ({
                key: String(a.key),
                type: String(a.type || "info"),
                severity: (["critical", "warning", "info"] as const).includes(
                  a.severity
                )
                  ? a.severity
                  : "info",
                resource: String(a.resource || ""),
                title: String(a.title || ""),
                message: String(a.message || ""),
                actionUrl:
                  typeof a.actionUrl === "string" ? a.actionUrl : null,
                count: Number.isFinite(a.count) ? Number(a.count) : 0,
                totalAmount:
                  a.totalAmount != null && Number.isFinite(a.totalAmount)
                    ? Number(a.totalAmount)
                    : null,
                metadata:
                  a.metadata && typeof a.metadata === "object"
                    ? a.metadata
                    : null,
              })
            )
        : []
      setAlerts(rows)
      lastFetchRef.current = Date.now()
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        // Silent fallback — empty alerts is a safe default
        setAlerts([])
      }
    } finally {
      setIsLoading(false)
    }
  }, [enabled, lang])

  // Polling effect
  useEffect(() => {
    if (!enabled) {
      setAlerts([])
      return
    }

    const tick = () => {
      void fetchOnce()
      timerRef.current = setTimeout(tick, POLL_INTERVAL_MS)
    }
    tick()

    const onFocus = () => {
      // Refresh on tab focus, but skip if we just fetched
      if (Date.now() - lastFetchRef.current > 10_000) {
        void fetchOnce()
      }
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus)
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      abortRef.current?.abort()
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus)
      }
    }
  }, [enabled, fetchOnce])

  const total = alerts.reduce((acc, alert) => acc + (alert.count || 0), 0)

  return { alerts, total, isLoading, refresh: fetchOnce }
}
