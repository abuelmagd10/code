"use client"

import React, { useEffect, useState, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import {
  usePermissions,
  getResourceFromPath,
  getCachedPermissions,
  canAccessPageSync,
} from "@/lib/permissions-context"

// الصفحات العامة التي لا تحتاج تحقق من الصلاحيات
const PUBLIC_PATHS = [
  "/auth/login",
  "/auth/sign-up",
  "/auth/sign-up-success",
  "/auth/callback",
  "/auth/force-change-password",
  "/onboarding",
  "/invitations/accept",
]

interface AppShellProps {
  children: React.ReactNode
}

/**
 * مكون الحماية الرئيسي للتطبيق
 * - يحجب كل المحتوى حتى تجهز الصلاحيات
 * - يتحقق من صلاحية الوصول للصفحة الحالية قبل العرض
 * - يستخدم الكاش للتحقق الفوري (Pre-render check)
 *
 * ملاحظة: لا يضيف Sidebar - الصفحات تتولى ذلك بنفسها
 */
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { isReady, isLoading, canAccessPage } = usePermissions()

  // قراءة الكاش فوراً (Pre-render check)
  const cachedData = useRef(getCachedPermissions())

  // تحديد إذا كانت الصفحة عامة
  const isPublicPage = PUBLIC_PATHS.some(p => pathname.startsWith(p)) || pathname === "/"

  // الحالة الأولية بناءً على الكاش
  const resource = getResourceFromPath(pathname)
  const initialAccess = cachedData.current.isValid
    ? canAccessPageSync(resource)
    : true // نسمح مؤقتاً حتى يتم التحميل

  const [accessState, setAccessState] = useState<"loading" | "allowed" | "denied">(
    isPublicPage ? "allowed" : (cachedData.current.isValid ? (initialAccess ? "allowed" : "denied") : "loading")
  )

  // إذا كان الوصول مرفوضاً فوراً من الكاش
  useEffect(() => {
    if (!isPublicPage && cachedData.current.isValid && !initialAccess) {
      router.replace("/dashboard")
    }
  }, [])

  // تحديث الحالة بناءً على الصلاحيات المحملة
  useEffect(() => {
    if (isPublicPage) {
      setAccessState("allowed")
      return
    }

    // أثناء التحميل، استخدم الكاش إذا كان صالحاً
    if (!isReady || isLoading) {
      if (cachedData.current.isValid) {
        const hasAccess = canAccessPageSync(resource)
        setAccessState(hasAccess ? "allowed" : "denied")
      } else {
        setAccessState("loading")
      }
      return
    }

    // بعد التحميل، استخدم الصلاحيات الفعلية
    const hasAccess = canAccessPage(resource)
    if (hasAccess) {
      setAccessState("allowed")
    } else {
      setAccessState("denied")
      router.replace("/dashboard")
    }
  }, [pathname, isReady, isLoading, canAccessPage, isPublicPage, resource, router])

  // حالة التحميل - Loader محايد فقط (بدون أي قائمة أو صفحة)
  if (accessState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  // حالة عدم الصلاحية - Loader فقط (التوجيه جاري)
  if (accessState === "denied") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    )
  }

  // حالة السماح - عرض المحتوى (الصفحة تتولى Sidebar بنفسها)
  return <>{children}</>
}

