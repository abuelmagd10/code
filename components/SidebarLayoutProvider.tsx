"use client"

import { usePathname } from "next/navigation"
// v3.74.14: filename in git is now `Sidebar.tsx` (capital S) after the
// fix_sidebar_casing rename. The import must match exactly because
// Linux/Vercel is case-sensitive.
import { Sidebar } from "@/components/Sidebar"

const EXACT_HIDE_PATHS = ["/"]
const PREFIX_HIDE_PATHS = ["/auth/login", "/auth/sign-up", "/auth/sign-up-success", "/auth/callback", "/onboarding", "/saas-admin", "/legal", "/contact", "/blog"]

export function SidebarLayoutProvider() {
  const pathname = usePathname()
  const isExactHide = EXACT_HIDE_PATHS.includes(pathname)
  const isPrefixHide = PREFIX_HIDE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  if (isExactHide || isPrefixHide) return null
  return <Sidebar />
}
