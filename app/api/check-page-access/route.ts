import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { canAccessPage } from "@/lib/authz"
import { getResourceFromPath } from "@/lib/permissions-context"

/**
 * API للتحقق من صلاحية الوصول لصفحة معينة
 * يُستخدم بعد تحديث الصلاحيات للتحقق من الصفحة الحالية
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      return NextResponse.json({ allowed: false, reason: "not_authenticated" })
    }
    
    const searchParams = request.nextUrl.searchParams
    const path = searchParams.get("path")
    
    if (!path) {
      return NextResponse.json({ allowed: false, reason: "no_path" })
    }
    
    // الحصول على resource من path
    const resource = getResourceFromPath(path)
    
    // التحقق من الصلاحية
    const canAccess = await canAccessPage(supabase, resource)
    
    return NextResponse.json({ 
      allowed: canAccess, 
      resource,
      path 
    })
  } catch (err) {
    console.error("Error checking page access:", err)
    return NextResponse.json({ 
      allowed: false, 
      reason: "error",
      error: err instanceof Error ? err.message : "unknown_error"
    })
  }
}
