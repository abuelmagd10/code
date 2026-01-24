"use client"

import React, { useEffect, useState, useMemo } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import {
  usePermissions,
  getResourceFromPath,
  getCachedPermissions,
  canAccessPageSync,
} from "@/lib/permissions-context"
import { useAccess } from "@/lib/access-context"
import { RealtimeRouteGuard } from "@/components/realtime-route-guard"

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
  
  // 🔐 استخدام AccessContext كمصدر أساسي
  const { isReady: accessReady, canAccessPage: canAccessPageFromAccess, getFirstAllowedPage } = useAccess()
  
  // Fallback: استخدام PermissionsContext
  const { isReady: permsReady, isLoading, canAccessPage: canAccessPageFromPerms } = usePermissions()
  
  const isReady = accessReady || permsReady
  const canAccessPage = accessReady ? canAccessPageFromAccess : canAccessPageFromPerms

  // تحديد إذا كانت الصفحة عامة
  const isPublicPage = PUBLIC_PATHS.some(p => pathname.startsWith(p)) || pathname === "/"

  // المسار المحمي
  const resource = getResourceFromPath(pathname)

  // قراءة الكاش مع useMemo لتحديثه عند كل تغيير مسار
  // ⚠️ NOTE: This causes hydration mismatch if reading localStorage during render
  // Refactored to read only on client
  const [cachedData, setCachedData] = useState<{ isValid: boolean; role: string; deniedResources: string[] }>({ isValid: false, role: '', deniedResources: [] })
  
  useEffect(() => {
     setCachedData(getCachedPermissions())
  }, [pathname])

  // تحديد الحالة الأولية - دائماً loading أو allowed للصفحات العامة لتجنب Hydration Mismatch
  const [accessState, setAccessState] = useState<"loading" | "allowed" | "denied">(() => {
    if (isPublicPage) return "allowed"
    return "loading"
  })

  // تحديث الحالة عند تغيير المسار (مهم للتنقل)
  useEffect(() => {
    // Reset state on path change
    if (isPublicPage) {
        setAccessState("allowed")
    } else {
        // Try to use cache immediately on client side navigation
        const currentCache = getCachedPermissions()
        if (currentCache.isValid) {
            const hasAccess = canAccessPageSync(resource)
            setAccessState(hasAccess ? "allowed" : "denied")
        } else {
            setAccessState("loading")
        }
    }
  }, [pathname, isPublicPage, resource])

  // إذا كان الوصول مرفوضاً فوراً من الكاش
  useEffect(() => {
    if (!isPublicPage && cachedData.isValid) {
      const hasAccess = canAccessPageSync(resource)
      if (!hasAccess) {
        // 🔐 استخدام getFirstAllowedPage بدلاً من /dashboard
        const redirectTo = accessReady ? getFirstAllowedPage() : "/no-access"
        router.replace(redirectTo)
      }
    }
  }, [pathname, isPublicPage, cachedData, resource, router, accessReady, getFirstAllowedPage])

  // تحديث الحالة بناءً على الصلاحيات المحملة
  useEffect(() => {
    if (isPublicPage) {
      setAccessState("allowed")
      return
    }

    // أثناء التحميل، استخدم الكاش إذا كان صالحاً
    if (!isReady || isLoading) {
      if (cachedData.isValid) {
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
      // 🔐 استخدام getFirstAllowedPage بدلاً من /dashboard
      const redirectTo = accessReady ? getFirstAllowedPage() : "/no-access"
      router.replace(redirectTo)
    }
  }, [pathname, isReady, isLoading, canAccessPage, isPublicPage, resource, router, cachedData])

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

