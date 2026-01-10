/**
 * 🔒 API فواتير الشراء مع نظام التحكم في الرؤية الموحد
 * 
 * GET /api/bills - جلب فواتير الشراء مع تطبيق قواعد الرؤية
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { applyDataVisibilityFilter } from "@/lib/data-visibility-control"

/**
 * GET /api/bills
 * جلب فواتير الشراء مع تطبيق قواعد الرؤية
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // 1️⃣ التحقق من المصادقة
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized", error_ar: "غير مصرح" }, { status: 401 })
    }

    // 2️⃣ جلب الشركة النشطة
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: "No company found", error_ar: "لا توجد شركة" }, { status: 400 })
    }

    // 3️⃣ تطبيق نظام التحكم في الرؤية
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || undefined
    
    let query = supabase
      .from("bills")
      .select(`
        *,
        suppliers:supplier_id (id, name, phone, city)
      `)
      .eq("company_id", companyId)

    // تطبيق فلاتر إضافية
    if (status && status !== "all") {
      query = query.eq("status", status)
    }

    // 4️⃣ تطبيق قواعد الرؤية
    query = await applyDataVisibilityFilter(supabase, query, "bills", user.id, companyId)
    
    // ترتيب حسب التاريخ
    query = query.order("created_at", { ascending: false })

    const { data: bills, error: dbError } = await query

    if (dbError) {
      console.error("[API /bills] Database error:", dbError)
      return NextResponse.json({ 
        error: dbError.message, 
        error_ar: "خطأ في جلب فواتير الشراء" 
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: bills || [],
      meta: {
        total: (bills || []).length
      }
    })

  } catch (error: any) {
    console.error("[API /bills] Unexpected error:", error)
    return NextResponse.json({ 
      error: error.message, 
      error_ar: "حدث خطأ غير متوقع" 
    }, { status: 500 })
  }
}