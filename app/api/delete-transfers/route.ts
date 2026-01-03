import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * 🗑️ API لحذف طلبات النقل وإرجاع المنتجات للمخازن المصدرة
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const results: any[] = []

  try {
    const body = await req.json()
    const { transfer_numbers } = body

    if (!Array.isArray(transfer_numbers) || transfer_numbers.length === 0) {
      return NextResponse.json({
        success: false,
        error: "يجب تحديد أرقام طلبات النقل"
      }, { status: 400 })
    }

    // جلب طلبات النقل
    const { data: transfers, error: fetchError } = await supabase
      .from("inventory_transfers")
      .select("*")
      .in("transfer_number", transfer_numbers)

    if (fetchError) throw fetchError

    if (!transfers || transfers.length === 0) {
      return NextResponse.json({
        success: false,
        error: "لم يتم العثور على طلبات النقل"
      }, { status: 404 })
    }

    // معالجة كل طلب نقل
    for (const transfer of transfers) {
      try {
        // 1️⃣ جلب بنود النقل
        const { data: items } = await supabase
          .from("inventory_transfer_items")
          .select("*")
          .eq("transfer_id", transfer.id)

        // 2️⃣ إرجاع المنتجات للمخزن المصدر (إذا كان النقل قد بدأ)
        if (transfer.status === "in_transit" || transfer.status === "received") {
          // حذف حركات transfer_out
          const { error: deleteOutError } = await supabase
            .from("inventory_transactions")
            .delete()
            .eq("reference_id", transfer.id)
            .eq("transaction_type", "transfer_out")

          if (deleteOutError) {
            console.error(`Error deleting transfer_out for ${transfer.transfer_number}:`, deleteOutError)
          }

          // حذف حركات transfer_in (إذا تم الاستلام)
          if (transfer.status === "received") {
            const { error: deleteInError } = await supabase
              .from("inventory_transactions")
              .delete()
              .eq("reference_id", transfer.id)
              .eq("transaction_type", "transfer_in")

            if (deleteInError) {
              console.error(`Error deleting transfer_in for ${transfer.transfer_number}:`, deleteInError)
            }
          }
        }

        // 3️⃣ حذف بنود النقل
        const { error: deleteItemsError } = await supabase
          .from("inventory_transfer_items")
          .delete()
          .eq("transfer_id", transfer.id)

        if (deleteItemsError) throw deleteItemsError

        // 4️⃣ حذف طلب النقل
        const { error: deleteTransferError } = await supabase
          .from("inventory_transfers")
          .delete()
          .eq("id", transfer.id)

        if (deleteTransferError) throw deleteTransferError

        results.push({
          transfer_number: transfer.transfer_number,
          status: "success",
          message: "تم الحذف بنجاح",
          items_count: items?.length || 0,
          was_in_transit: transfer.status === "in_transit" || transfer.status === "received"
        })

      } catch (error: any) {
        results.push({
          transfer_number: transfer.transfer_number,
          status: "error",
          error: error.message
        })
      }
    }

    const successCount = results.filter(r => r.status === "success").length
    const errorCount = results.filter(r => r.status === "error").length

    return NextResponse.json({
      success: true,
      summary: {
        total: transfers.length,
        succeeded: successCount,
        failed: errorCount
      },
      results
    })

  } catch (error: any) {
    console.error("Error deleting transfers:", error)
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 })
  }
}

