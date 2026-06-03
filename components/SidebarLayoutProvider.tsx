"use client"

import { usePathname } from "next/navigation"
// v3.74.14: import path must match Sidebar.tsx casing (TS1261 otherwise)
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
