/**
 * 🔒 API فواتير الشراء مع الحوكمة الإلزامية
 * 
 * GET /api/bills - جلب فواتير الشراء مع تطبيق الحوكمة
 * POST /api/bills - إنشاء فاتورة شراء جديدة مع الحوكمة
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  enforceGovernance,
  applyGovernanceFilters,
  validateGovernanceData,
  addGovernanceData
} from "@/lib/governance-middleware"
import { validateShippingProviderForBranch } from "@/lib/shipping-provider-branch"

/**
 * GET /api/bills
 * جلب فواتير الشراء مع تطبيق فلاتر الحوكمة
 */
export async function GET(request: NextRequest) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()

    const supabase = await createClient()
    
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || undefined
    
    // 2️⃣ بناء الاستعلام مع فلاتر الحوكمة
    let query = supabase
      .from("bills")
      .select(`
        *,
        suppliers:supplier_id (id, name, phone, city)
      `)

    if (status && status !== "all") {
      query = query.eq("status", status)
    }

    // 3️⃣ تطبيق فلاتر الحوكمة (إلزامي)
    query = applyGovernanceFilters(query, governance)
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
        total: (bills || []).length,
        role: governance.role,
        governance: {
          companyId: governance.companyId,
          branchIds: governance.branchIds,
          warehouseIds: governance.warehouseIds,
          costCenterIds: governance.costCenterIds
        }
      }
    })

  } catch (error: any) {
    console.error("[API /bills] Unexpected error:", error)
    return NextResponse.json({ 
      error: error.message, 
      error_ar: "حدث خطأ غير متوقع" 
    }, { 
      status: error.message.includes('Unauthorized') ? 401 : 403 
    })
  }
}

/**
 * POST /api/bills
 * إنشاء فاتورة شراء جديدة (معطل بحسب السياسة الجديدة)
 */
export async function POST(request: NextRequest) {
  return NextResponse.json({ 
    error: "Manual creation of Purchase Bills is disabled. Bills are automatically generated upon Purchase Order approval.", 
    error_ar: "إنشاء الفواتير اليدوي معطل. يتم إنشاء الفواتير تلقائياً عند اعتماد أوامر الشراء." 
  }, { status: 403 })
}
