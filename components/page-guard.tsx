"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { usePermissions, getResourceFromPath } from "@/lib/permissions-context"
import { Loader2, ShieldAlert } from "lucide-react"

interface PageGuardProps {
  children: React.ReactNode
  resource?: string // إذا لم يُحدد، سيتم استنتاجه من المسار
  fallbackPath?: string // المسار البديل عند عدم الصلاحية
  showAccessDenied?: boolean // عرض رسالة عدم الصلاحية بدلاً من التوجيه
}

/**
 * مكون حماية الصفحات
 * يمنع عرض المحتوى حتى يتم التحقق من الصلاحيات
 * يمنع الوميض (Flicker) بشكل كامل
 */
export function PageGuard({
  children,
  resource,
  fallbackPath,
  showAccessDenied = false,
}: PageGuardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { isReady, isLoading, canAccessPage, role } = usePermissions()
  const [accessState, setAccessState] = useState<"loading" | "allowed" | "denied">("loading")

  // تحديد المورد من المسار إذا لم يُحدد
  const targetResource = resource || getResourceFromPath(pathname)

  useEffect(() => {
    // انتظار تحميل الصلاحيات
    if (!isReady || isLoading) {
      setAccessState("loading")
      return
    }

    // التحقق من الصلاحية
    const hasAccess = canAccessPage(targetResource)

    if (hasAccess) {
      setAccessState("allowed")
    } else {
      setAccessState("denied")

      // إذا لم يكن showAccessDenied مفعلاً، قم بالتوجيه
      if (!showAccessDenied) {
        const redirectTo = fallbackPath || "/dashboard"
        router.replace(redirectTo)
      }
    }
  }, [isReady, isLoading, canAccessPage, targetResource, router, fallbackPath, showAccessDenied])

  // حالة التحميل - لا تعرض أي محتوى
  if (accessState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">جاري التحقق من الصلاحيات...</p>
        </div>
      </div>
    )
  }

  // حالة عدم الصلاحية
  if (accessState === "denied") {
    if (showAccessDenied) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center max-w-md px-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">
              غير مصرح بالوصول
            </h1>
            <p className="text-gray-500 mb-6">
              ليس لديك صلاحية للوصول إلى هذه الصفحة.
              <br />
              يرجى التواصل مع مدير النظام إذا كنت تعتقد أن هذا خطأ.
            </p>
            <button
              onClick={() => router.back()}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              العودة للخلف
            </button>
          </div>
        </div>
      )
    }
    // التوجيه جاري، لا تعرض شيئاً
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    )
  }

  // حالة السماح - اعرض المحتوى
  return <>{children}</>
}

/**
 * مكون للتحقق من صلاحية عرض عنصر معين (ليس صفحة كاملة)
 */
interface PermissionGateProps {
  children: React.ReactNode
  resource: string
  action?: string
  fallback?: React.ReactNode
}

export function PermissionGate({
  children,
  resource,
  action = "read",
  fallback = null,
}: PermissionGateProps) {
  const { isReady, canAction } = usePermissions()

  // أثناء التحميل، لا تعرض شيئاً
  if (!isReady) return null

  // التحقق من الصلاحية
  if (!canAction(resource, action)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

/**
 * Hook للتحقق من صلاحية الصفحة الحالية
 */
export function usePageAccess(resource?: string) {
  const pathname = usePathname()
  const { isReady, isLoading, canAccessPage, role } = usePermissions()
  
  const targetResource = resource || getResourceFromPath(pathname)
  
  return {
    isLoading: !isReady || isLoading,
    hasAccess: isReady ? canAccessPage(targetResource) : false,
    role,
    resource: targetResource,
  }
}

