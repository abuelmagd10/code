import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getFirstAllowedPage } from "@/lib/authz"

/**
 * API للحصول على أول صفحة مسموح بها للمستخدم
 * يُستخدم بعد تسجيل الدخول للتوجيه الصحيح
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      return NextResponse.json({ path: "/auth/login" })
    }
    
    const path = await getFirstAllowedPage(supabase)
    return NextResponse.json({ path })
  } catch (err) {
    console.error("Error getting first allowed page:", err)
    // في حالة الخطأ، نوجه للـ dashboard كافتراضي
    return NextResponse.json({ path: "/dashboard" })
  }
}

