import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { validateWriteOffItems, type WriteOffItemValidation } from "@/lib/write-off-governance"

/**
 * 🧾 API Endpoint: التحقق من صحة عملية الإهلاك قبل الحفظ
 * Governance Rule: منع إهلاك المخزون بدون رصيد فعلي
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // التحقق من المصادقة
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { isValid: false, errors: [{ message: "Unauthorized" }] },
        { status: 401 }
      )
    }

    // الحصول على company ID
    const companyId = await getActiveCompanyId(supabase)
    
    if (!companyId) {
      return NextResponse.json(
        { isValid: false, errors: [{ message: "Company ID is required" }] },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
      items,
      warehouse_id,
      branch_id,
      cost_center_id,
    }: {
      items: Array<{
        product_id: string
        product_name?: string
        product_sku?: string
        quantity: number
        warehouse_id?: string | null
        branch_id?: string | null
        cost_center_id?: string | null
      }>
      warehouse_id?: string | null
      branch_id?: string | null
      cost_center_id?: string | null
    } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { isValid: false, errors: [{ message: "Items are required" }] },
        { status: 400 }
      )
    }

    // تحويل items إلى WriteOffItemValidation format
    const validationItems: WriteOffItemValidation[] = items.map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      product_sku: item.product_sku,
      quantity: Number(item.quantity || 0),
      warehouse_id: item.warehouse_id || warehouse_id || null,
      branch_id: item.branch_id || branch_id || null,
      cost_center_id: item.cost_center_id || cost_center_id || null,
    }))

    // 🧾 Governance Rule: التحقق من الرصيد المتاح
    console.log(`[write-off/validate] Validating ${validationItems.length} items for warehouse ${warehouse_id}, branch ${branch_id}`)
    const result = await validateWriteOffItems(
      supabase,
      companyId,
      validationItems,
      warehouse_id || null,
      branch_id || null,
      cost_center_id || null
    )
    console.log(`[write-off/validate] Validation result: isValid=${result.isValid}, errors=${result.errors.length}`)

    return NextResponse.json(result)
  } catch (err: any) {
    console.error("Error validating write-off items:", err)
    return NextResponse.json(
      {
        isValid: false,
        errors: [{ message: err.message || "Failed to validate write-off items" }],
      },
      { status: 500 }
    )
  }
}
