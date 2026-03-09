/**
 * 🔍 API التحقق من المطابقة الثلاثية
 * 
 * POST /api/bills/[id]/validate-matching - التحقق من المطابقة بين PO/GRN/Bill
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { enforceGovernance } from "@/lib/governance-middleware"
import { validateBillMatching } from "@/lib/three-way-matching"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1️⃣ تطبيق الحوكمة (إلزامي)
    const governance = await enforceGovernance()

    const { id } = await params

    const supabase = await createClient()

    // 2️⃣ التحقق من المطابقة
    const result = await validateBillMatching(supabase, id, governance.companyId)

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.errors?.[0] || "Validation failed",
        error_ar: "فشل التحقق من المطابقة"
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: {
        hasExceptions: result.hasExceptions,
        exceptions: result.exceptions,
        exceptionCount: result.exceptions.length
      }
    })

  } catch (error: any) {
    console.error("[API /bills/validate-matching] Unexpected error:", error)
    return NextResponse.json({
      error: error.message,
      error_ar: "حدث خطأ غير متوقع"
    }, {
      status: error.message.includes('Unauthorized') ? 401 : 403
    })
  }
}
