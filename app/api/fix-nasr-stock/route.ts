import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/**
 * 🔧 API لإصلاح مخزون مدينة نصر
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const body = await req.json()
    const { company_id } = body

    if (!company_id) {
      return NextResponse.json({
        success: false,
        error: "يجب تحديد معرف الشركة"
      }, { status: 400 })
    }

    const results: any = {
      boom_product: null,
      nasr_warehouse: null,
      transactions: [],
      stock_analysis: {},
      fixed: false
    }

    // 1️⃣ جلب منتج boom
    const { data: product } = await supabase
      .from("products")
      .select("id, name, sku, quantity_on_hand")
      .eq("company_id", company_id)
      .eq("sku", "suk- 1001")
      .single()

    if (!product) {
      return NextResponse.json({
        success: false,
        error: "منتج boom غير موجود"
      }, { status: 404 })
    }

    results.boom_product = product

    // 2️⃣ جلب مخزن مدينة نصر
    const { data: warehouse } = await supabase
      .from("warehouses")
      .select("id, name")
      .eq("company_id", company_id)
      .ilike("name", "%مدينة نصر%")
      .single()

    if (!warehouse) {
      return NextResponse.json({
        success: false,
        error: "مخزن مدينة نصر غير موجود"
      }, { status: 404 })
    }

    results.nasr_warehouse = warehouse

    // 3️⃣ جلب جميع حركات المخزون
    const { data: transactions } = await supabase
      .from("inventory_transactions")
      .select("*")
      .eq("company_id", company_id)
      .eq("product_id", product.id)
      .eq("warehouse_id", warehouse.id)
      .order("created_at", { ascending: true })

    results.transactions = transactions || []

    // 4️⃣ حساب الرصيد
    let calculatedStock = 0
    const byType: Record<string, { count: number; total: number }> = {}

    for (const tx of transactions || []) {
      if (tx.is_deleted) continue

      calculatedStock += Number(tx.quantity_change || 0)

      const type = tx.transaction_type || 'unknown'
      if (!byType[type]) byType[type] = { count: 0, total: 0 }
      byType[type].count++
      byType[type].total += Number(tx.quantity_change || 0)
    }

    results.stock_analysis = {
      calculated: calculatedStock,
      system: product.quantity_on_hand,
      difference: calculatedStock - (product.quantity_on_hand || 0),
      by_type: byType,
      transactions_count: transactions?.length || 0
    }

    // 5️⃣ الإصلاح إذا كان هناك فرق
    if (calculatedStock !== product.quantity_on_hand) {
      const { error: updateError } = await supabase
        .from("products")
        .update({ quantity_on_hand: calculatedStock })
        .eq("id", product.id)

      if (updateError) throw updateError

      results.fixed = true
      results.old_quantity = product.quantity_on_hand
      results.new_quantity = calculatedStock
    }

    return NextResponse.json({
      success: true,
      results
    })

  } catch (error: any) {
    console.error("Error fixing nasr stock:", error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}

