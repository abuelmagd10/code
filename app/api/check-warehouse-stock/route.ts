import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * 🔍 API لفحص حركات المخزون لمنتج معين في مخزن معين
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const body = await req.json()
    const { product_sku, warehouse_name, company_id } = body

    if (!product_sku || !warehouse_name || !company_id) {
      return NextResponse.json({
        success: false,
        error: "يجب تحديد SKU المنتج واسم المخزن ومعرف الشركة"
      }, { status: 400 })
    }

    // 1️⃣ جلب المنتج
    const { data: product } = await supabase
      .from("products")
      .select("id, name, sku, quantity_on_hand")
      .eq("company_id", company_id)
      .eq("sku", product_sku)
      .single()

    if (!product) {
      return NextResponse.json({
        success: false,
        error: "المنتج غير موجود"
      }, { status: 404 })
    }

    // 2️⃣ جلب المخزن
    const { data: warehouse } = await supabase
      .from("warehouses")
      .select("id, name, branch_id")
      .eq("company_id", company_id)
      .ilike("name", `%${warehouse_name}%`)
      .single()

    if (!warehouse) {
      return NextResponse.json({
        success: false,
        error: "المخزن غير موجود"
      }, { status: 404 })
    }

    if (!warehouse.branch_id) {
      return NextResponse.json({
        success: false,
        error: "المخزن غير مربوط بفرع"
      }, { status: 400 })
    }

    const { data: branchDefaults } = await supabase
      .from("branches")
      .select("default_cost_center_id")
      .eq("company_id", company_id)
      .eq("id", warehouse.branch_id)
      .single()

    if (!branchDefaults?.default_cost_center_id) {
      return NextResponse.json({
        success: false,
        error: "الفرع غير مُكوَّن بمركز تكلفة افتراضي"
      }, { status: 400 })
    }

    // 3️⃣ جلب جميع حركات المخزون لهذا المنتج في هذا المخزن
    const { data: transactions } = await supabase
      .from("inventory_transactions")
      .select("*")
      .eq("company_id", company_id)
      .eq("branch_id", warehouse.branch_id)
      .eq("cost_center_id", branchDefaults.default_cost_center_id)
      .eq("product_id", product.id)
      .eq("warehouse_id", warehouse.id)
      .order("created_at", { ascending: true })

    // 4️⃣ حساب الرصيد
    let calculatedStock = 0
    const transactionsSummary = (transactions || []).map((tx: any) => {
      calculatedStock += Number(tx.quantity_change || 0)
      return {
        id: tx.id,
        transaction_type: tx.transaction_type,
        quantity_change: tx.quantity_change,
        running_balance: calculatedStock,
        reference_id: tx.reference_id,
        created_at: tx.created_at,
        is_deleted: tx.is_deleted
      }
    })

    // 5️⃣ تجميع حسب نوع الحركة
    const byType: Record<string, { count: number; total: number }> = {}
    for (const tx of transactions || []) {
      if (tx.is_deleted) continue
      const type = tx.transaction_type || 'unknown'
      if (!byType[type]) byType[type] = { count: 0, total: 0 }
      byType[type].count++
      byType[type].total += Number(tx.quantity_change || 0)
    }

    return NextResponse.json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        system_quantity: product.quantity_on_hand
      },
      warehouse: {
        id: warehouse.id,
        name: warehouse.name
      },
      stock: {
        calculated: calculatedStock,
        system: product.quantity_on_hand,
        difference: calculatedStock - (product.quantity_on_hand || 0)
      },
      transactions_count: transactions?.length || 0,
      transactions_summary: transactionsSummary,
      by_type: byType
    })

  } catch (error: any) {
    console.error("Error checking warehouse stock:", error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}
