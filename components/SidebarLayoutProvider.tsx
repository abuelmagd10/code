"use client"

import { usePathname } from "next/navigation"
import { Sidebar } from "@/components/sidebar"

/**
 * SidebarLayoutProvider — يعرض الـ Sidebar مرة واحدة ثابتة لكل جلسة المستخدم
 *
 * المنطق:
 * - يظهر في جميع الصفحات عدا صفحات المصادقة وSaaS Admin
 * - بما أن هذا Component في app/layout.tsx، فهو لا يُعاد إنشاؤه عند Navigation
 * - حالة الـ Sidebar (notifications, user data, expanded items) تُحفَظ بين الصفحات
 *
 * الصفحات المستثناة (بدون Sidebar):
 * - صفحات تسجيل الدخول والتسجيل
 * - صفحة الـ onboarding
 * - منطقة SaaS Admin (لها واجهتها الخاصة)
 */

const PATHS_WITHOUT_SIDEBAR: string[] = [
  "/auth/login",
  "/auth/sign-up",
  "/auth/sign-up-success",
  "/auth/callback",
  "/onboarding",
  "/saas-admin",
]

export function SidebarLayoutProvider() {
  const pathname = usePathname()

  const shouldHide = PATHS_WITHOUT_SIDEBAR.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  )

  if (shouldHide) return null

  return <Sidebar />
}
