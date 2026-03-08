import React from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { canAdvancedAction, type AdvancedAction } from "@/lib/authz"

interface PermissionGuardProps {
    resource: string
    action: AdvancedAction
    children: React.ReactNode
    fallback?: React.ReactNode
}

/**
 * مكون للتحقق من صلاحيات الأفعال المتقدمة قبل عرض المحتوى
 * مفيد لإخفاء أو تعطيل الأزرار التي لا يملك المستخدم صلاحية عليها
 */
export function PermissionGuard({
    resource,
    action,
    children,
    fallback = null
}: PermissionGuardProps) {
    const supabase = useSupabase()
    const [isAllowed, setIsAllowed] = React.useState<boolean | null>(null)

    React.useEffect(() => {
        let isMounted = true

        const checkPerm = async () => {
            try {
                const allowed = await canAdvancedAction(supabase, resource, action)
                if (isMounted) {
                    setIsAllowed(allowed)
                }
            } catch (err) {
                console.error(`Permission check failed for ${resource}:${action}`, err)
                if (isMounted) setIsAllowed(false)
            }
        }

        checkPerm()

        // الاستماع لأي تحديثات في الصلاحيات
        const handler = () => {
            checkPerm()
        }

        window.addEventListener("permissions_updated", handler)
        return () => {
            isMounted = false
            window.removeEventListener("permissions_updated", handler)
        }
    }, [supabase, resource, action])

    // حالة التحميل (عدم تحديد الصلاحية بعد)
    if (isAllowed === null) {
        return <div className="opacity-50 pointer-events-none">{children}</div>
    }

    return isAllowed ? <>{children}</> : <>{fallback}</>
}
