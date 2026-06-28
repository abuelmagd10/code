"use client"

import { usePathname } from "next/navigation"
// v3.74.15: settle on lowercase `sidebar.tsx` to match every other file in
// the project that uses kebab-case. The fix_sidebar_casing rename flipped
// git to capital but the on-disk NTFS entry ended up lowercase again after
// subsequent edits. Single source of truth: lowercase everywhere.
import { Sidebar } from "@/components/sidebar"

const EXACT_HIDE_PATHS = ["/"]
// v3.74.228 — /demo is a public marketing page and must render full-bleed
// (no app sidebar shoulder-to-shoulder with the demo canvas). Logged-in
// visitors who reach it from the landing page would otherwise see their
// authenticated sidebar overlap the demo content, which we saw in the test.
// v3.74.286 — auth-flow landing pages must not render the app sidebar:
//   /auth/force-change-password — reached after a "forgot password" reset
//     or as the forced first-login flow for invited users. The recovery
//     session has replaced auth, but the previously-cached
//     active_company_id in localStorage/cookie still points at whatever
//     tenant was last active on this browser — so the sidebar would
//     render the wrong company's menu next to the password form.
//   /invitations/accept — same root cause: after verifyOtp on an invite
//     link the auth session is the invitee, but active_company_id is the
//     tenant the browser last opened, so the sidebar shows the unrelated
//     company. The user accepts the invite from here, after which the
//     accept handler writes the correct active_company_id and redirects.
// v3.74.380 — /suspended must hide the sidebar. The page targets
// non-owner members whose seat license has expired. The sidebar
// auto-polls /api/sidebar/approval-badges and a few other endpoints
// that aren't meant for suspended users — some of them return HTML
// (login redirect, error page) which crashes the JSON parser with
// "Unexpected token '<', "<!DOCTYPE "... is not valid JSON" in the
// console even though the visible page is /suspended.
const PREFIX_HIDE_PATHS = ["/auth/login", "/auth/sign-up", "/auth/sign-up-success", "/auth/callback", "/auth/force-change-password", "/invitations/accept", "/onboarding", "/saas-admin", "/legal", "/contact", "/blog", "/demo", "/suspended"]

export function SidebarLayoutProvider() {
  const pathname = usePathname()
  const isExactHide = EXACT_HIDE_PATHS.includes(pathname)
  const isPrefixHide = PREFIX_HIDE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  if (isExactHide || isPrefixHide) return null
  return <Sidebar />
}
