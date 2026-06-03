"use client"

import { usePathname } from "next/navigation"
// v3.74.14: filename in git is `sidebar.tsx` (lowercase) — Linux/Vercel is
// case-sensitive so the import must match exactly. Windows hides this.
import { Sidebar } from "@/components/sidebar"

const EXACT_HIDE_PATHS = ["/"]
const PREFIX_HIDE_PATHS = ["/auth/login", "/auth/sign-up", "/auth/sign-up-success", "/auth/callback", "/onboarding", "/saas-admin", "/legal", "/contact", "/blog"]

export function SidebarLayoutProvider() {
  const pathname = usePathname()
  const isExactHide = EXACT_HIDE_PATHS.includes(pathname)
  const isPrefixHide = PREFIX_HIDE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  if (isExactHide || isPrefixHide) return null
  return <Sidebar />
}
