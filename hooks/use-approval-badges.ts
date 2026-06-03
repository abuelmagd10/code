"use client"

/**
 * useApprovalBadges() — v3.74.15
 *
 * Polls /api/sidebar/approval-badges every 30 seconds and returns a map of
 * approval workflow keys to pending counts for the current user. The
 * Sidebar uses this to render red badges next to each approval page menu
 * item.
 *
 * The single endpoint replaces three legacy polled endpoints
 * (pending-approvals-count, pending-dispatch-count, pending-count) and is
 * the only place new approval workflows need to be wired going forward.
 *
 * Refreshes:
 *   - on mount
 *   - every 30 seconds
 *   - whenever the user navigates (parent calls refresh())
 */

import { useCallback, useEffect, useRef, useState } from "react"

export type ApprovalBadgesMap = Record<string, number>

export interface UseApprovalBadgesResult {
  badges: ApprovalBadgesMap
  refresh: () => Promise<void>
  isLoading: boolean
}

const POLL_INTERVAL_MS = 30_000

export function useApprovalBadges(opts?: {
  enabled?: boolean
}): UseApprovalBadgesResult {
  const enabled = opts?.enabled !== false
  const [badges, setBadges] = useState<ApprovalBadgesMap>({})
  const [isLoading, setIsLoading] = useState(false)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setBadges({})
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch("/api/sidebar/approval-badges", { cache: "no-store" })
      if (!res.ok) {
        // 401 / 403 are non-critical — the user just doesn't have any
        // approvals to see right now. Clear the map to avoid stale badges.
        if (mountedRef.current) setBadges({})
        return
      }
      const json = await res.json()
      const next = (json?.badges ?? {}) as ApprovalBadgesMap
      if (mountedRef.current) setBadges(next)
    } catch {
      /* non-critical */
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    mountedRef.current = true
    if (!enabled) return () => { mountedRef.current = false }
    void refresh()
    const id = setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      mountedRef.current = false
      clearInterval(id)
    }
  }, [enabled, refresh])

  return { badges, refresh, isLoading }
}

/**
 * Convenience helper for menu items that map to MULTIPLE workflow keys
 * (e.g. the sales-return-requests page covers both `_l1` and `_warehouse`
 * stages — whichever the current user can act on shows up). Use this in
 * the sidebar so each entry can declare the keys that contribute to its
 * badge.
 */
export function sumBadges(badges: ApprovalBadgesMap, keys: string[]): number {
  let n = 0
  for (const k of keys) n += Number(badges[k] ?? 0)
  return n
}
