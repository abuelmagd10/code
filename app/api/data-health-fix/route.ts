import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// API لإصلاح مشاكل صحة البيانات تلقائياً
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!company) return NextResponse.json({ error: "no company" }, { status: 401 })

    const body = await request.json()
    const { fix_type } = body
    const companyId = company.id
    const results: any = { fixed: 0, errors: [] }

    switch (fix_type) {
      // ======================================
      // 1. مزامنة أرصدة المخزون
      // ======================================
      case "sync_stock": {
        const { data, error } = await supabase.rpc("sync_all_stock_quantities", {
          p_company_id: companyId
        })
        if (error) throw error
        results.fixed = data?.fixed_count || 0
        results.message = `تم مزامنة ${results.fixed} منتج`
        break
      }

      // ======================================
      // 2. حذف حركات المخزون للفواتير الملغاة
      // ======================================
      case "remove_orphan_transactions": {
        const { data, error } = await supabase.rpc("remove_cancelled_invoice_sale_transactions", {
          p_company_id: companyId
        })
        if (error) throw error
        results.fixed = data?.deleted_count || 0
        results.message = `تم حذف ${results.fixed} حركة خاطئة`
        break
      }

      // ======================================
      // 3. إصلاح قيود المرتجعات الخاطئة
      // ======================================
      case "fix_return_entries": {
        const { data, error } = await supabase.rpc("fix_wrong_return_account_entries", {
          p_company_id: companyId
        })
        if (error) throw error
        results.fixed = data?.fixed_count || 0
        results.message = `تم إصلاح ${results.fixed} قيد`
        break
      }

      default:
        return NextResponse.json({ error: "نوع الإصلاح غير معروف" }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      fix_type,
      ...results
    })
  } catch (error: any) {
    console.error("Fix error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

