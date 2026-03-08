/**
 * 🔐 Realtime Route Guard - حماية المسارات لحظياً
 * 
 * مكون مركزي يحمي جميع المسارات ويحدثها فوراً عند تغيير الصلاحيات
 */

"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAccess } from "@/lib/access-context"
import { getResourceFromPath } from "@/lib/permissions-context"
import { Loader2, ShieldAlert } from "lucide-react"

/**
 * Realtime Route Guard Component
 * 
 * يحمي المسارات ويحدثها فوراً عند تغيير الصلاحيات
 */
export function RealtimeRouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isReady, canAccessPage, getFirstAllowedPage, profile } = useAccess()
  const [isChecking, setIsChecking] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)

  // ✅ [Enterprise Architecture - Single Source of Truth]
  // لا نستخدم useGovernanceRealtime هنا مباشرةً لأن ذلك ينشئ handler ثانيًا في RealtimeManager
  // AccessContext هو المستمع الوحيد للـ Realtime ويُطلق `permissions_updated` event بعد كل BLIND REFRESH
  // نحن نستمع لهذا الـ event فقط (passive consumer)
  useEffect(() => {
    const handlePermissionsUpdated = async () => {
      console.log("🔄 [RealtimeRouteGuard] permissions_updated received, rechecking access...")
      await new Promise(resolve => setTimeout(resolve, 100))
      const currentPathname = pathname
      const resource = getResourceFromPath(currentPathname)
      const access = canAccessPage(resource)
      if (access) {
        setHasAccess(true)
        console.log(`✅ [RealtimeRouteGuard] Page ${currentPathname} is still allowed`)
      } else {
        setHasAccess(false)
        const redirectTo = getFirstAllowedPage()
        if (redirectTo && redirectTo !== "/no-access") {
          console.log(`🔄 [RealtimeRouteGuard] Page ${currentPathname} no longer allowed, redirecting to: ${redirectTo}`)
          router.replace(redirectTo)
        } else {
          console.error(`❌ [RealtimeRouteGuard] No allowed pages found for user`)
        }
      }
    }

    window.addEventListener("permissions_updated", handlePermissionsUpdated)
    return () => window.removeEventListener("permissions_updated", handlePermissionsUpdated)
  }, [pathname, canAccessPage, getFirstAllowedPage, router])

  // فحص الصلاحية عند تحميل الصفحة أو تغيير المسار
  useEffect(() => {
    if (!isReady) {
      setIsChecking(true)
      return
    }

    const resource = getResourceFromPath(pathname)
    const access = canAccessPage(resource)

    setHasAccess(access)
    setIsChecking(false)

    if (!access) {
      // منع الوصول وإعادة التوجيه
      const redirectTo = getFirstAllowedPage()

      // ✅ التحقق من أن الصفحة الهدف صالحة (نفس التحقق الموجود في realtime handlers)
      if (redirectTo && redirectTo !== "/no-access") {
        console.log(`🚫 [RealtimeRouteGuard] Access denied to ${pathname}, redirecting to: ${redirectTo}`)
        router.replace(redirectTo)
      } else {
        console.error(`❌ [RealtimeRouteGuard] No allowed pages found for user, showing no-access screen`)
        setHasAccess(false)
      }
    }
  }, [isReady, pathname, canAccessPage, getFirstAllowedPage, router])

  // حالة التحميل
  if (isChecking || !isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">جاري التحقق من الصلاحيات...</p>
        </div>
      </div>
    )
  }

  // حالة عدم الصلاحية
  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            غير مصرح بالوصول
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            تم تحديث صلاحياتك بواسطة الإدارة.
            <br />
            لم يعد مسموح لك الوصول إلى هذه الصفحة.
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            سيتم توجيهك تلقائياً إلى صفحة مسموحة...
          </p>
        </div>
      </div>
    )
  }

  // حالة السماح - اعرض المحتوى
  return <>{children}</>
}
