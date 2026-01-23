/**
 * 🔐 صفحة عدم الوصول - No Access Page
 * 
 * تُعرض عندما لا يملك المستخدم أي صفحات مسموحة
 */

"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAccess } from "@/lib/access-context"
import { ShieldAlert, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NoAccessPage() {
  const router = useRouter()
  const { isReady, profile, getFirstAllowedPage, refreshAccess } = useAccess()

  // محاولة إعادة التحميل عند تغيير الصلاحيات
  useEffect(() => {
    if (isReady && profile && profile.allowed_pages.length > 0) {
      // إذا أصبحت هناك صفحات مسموحة، إعادة التوجيه
      const firstPage = getFirstAllowedPage()
      if (firstPage !== "/no-access") {
        router.replace(firstPage)
      }
    }
  }, [isReady, profile, getFirstAllowedPage, router])

  // إعادة تحميل الصلاحيات
  const handleRefresh = async () => {
    await refreshAccess()
    const firstPage = getFirstAllowedPage()
    if (firstPage !== "/no-access") {
      router.replace(firstPage)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 px-4">
      <div className="text-center max-w-md w-full">
        <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="h-10 w-10 text-red-600 dark:text-red-400" />
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          لا تملك أي صلاحيات حالياً
        </h1>
        
        <p className="text-gray-600 dark:text-gray-400 mb-2">
          لم يتم تعيين أي صفحات أو صلاحيات لك في النظام.
        </p>
        
        <p className="text-sm text-gray-500 dark:text-gray-500 mb-8">
          يرجى التواصل مع مدير النظام أو الإدارة لتعيين الصلاحيات المناسبة.
        </p>

        <div className="space-y-3">
          <Button
            onClick={handleRefresh}
            className="w-full"
            variant="outline"
          >
            <RefreshCw className="w-4 h-4 ml-2" />
            إعادة تحميل الصلاحيات
          </Button>
          
          <Button
            onClick={() => router.push("/settings/profile")}
            className="w-full"
            variant="ghost"
          >
            الانتقال إلى الملف الشخصي
          </Button>
        </div>

        {profile && (
          <div className="mt-8 p-4 bg-gray-100 dark:bg-slate-800 rounded-lg text-left">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              معلومات الحساب:
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              الدور: <span className="font-medium">{profile.role}</span>
            </p>
            {profile.branch_id && (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                الفرع: <span className="font-medium">{profile.branch_id}</span>
              </p>
            )}
            {profile.warehouse_id && (
              <p className="text-xs text-gray-600 dark:text-gray-400">
                المخزن: <span className="font-medium">{profile.warehouse_id}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
