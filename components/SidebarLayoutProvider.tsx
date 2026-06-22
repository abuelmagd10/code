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
// v3.74.286 — /auth/force-change-password is reached either right after
// a "forgot password" reset or as the forced first-login flow for invited
// users. In both cases the app sidebar (full nav of an authenticated
// session) showing in the background is wrong: the recovery session is a
// minimal-permission session that hasn't accepted membership yet, and the
// page is meant to feel like an auth screen, not a logged-in workspace.
const PREFIX_HIDE_PATHS = ["/auth/login", "/auth/sign-up", "/auth/sign-up-success", "/auth/callback", "/auth/force-change-password", "/onboarding", "/saas-admin", "/legal", "/contact", "/blog", "/demo"]

export function SidebarLayoutProvider() {
  const pathname = usePathname()
  const isExactHide = EXACT_HIDE_PATHS.includes(pathname)
  const isPrefixHide = PREFIX_HIDE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  if (isExactHide || isPrefixHide) return null
  return <Sidebar />
}
