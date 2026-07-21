/**
 * 🔒 API مرتجعات المبيعات مع الحوكمة الإلزامية
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  enforceGovernance,
  applyGovernanceFilters,
  validateGovernanceData,
  addGovernanceData
} from "@/lib/governance-middleware"

export async function GET(request: NextRequest) {
  try {
    const governance = await enforceGovernance()
    const supabase = await createClient()
    
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") || undefined
    
    let query = supabase
      .from("sales_returns")
      .select(`
        *,
        customers:customer_id (id, name, phone, city),
        invoices:invoice_id (id, invoice_number)
      `)

    if (status && status !== "all") {
      query = query.eq("status", status)
    }

    query = applyGovernanceFilters(query, governance)
    query = query.order("created_at", { ascending: false })

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      meta: {
        total: (data || []).length,
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
    return NextResponse.json({ 
      error: error.message 
    }, { 
      status: error.message.includes('Unauthorized') ? 401 : 403 
    })
  }
}

/**
 * RETIRED in v3.74.781 — this was a back door into the sales_returns table.
 *
 * It took the request body, applied governance scoping, and inserted it
 * straight into sales_returns. No return items. No inventory movement. No
 * journal entry. No FIFO restoration. No COGS reversal. No approval. A row
 * appeared saying goods had come back, and nothing in the ledger or the
 * warehouse agreed with it.
 *
 * Retired rather than repaired: the real path already exists and is atomic —
 * POST /api/sales-return-requests, then management approval, then
 * PATCH /api/sales-return-requests/[id]/warehouse-approve. A second way in is
 * the problem, not a missing feature.
 *
 * Authentication runs first and still answers 401, so an unauthenticated caller
 * learns nothing about what exists here.
 */
export async function POST(_request: NextRequest) {
  try {
    await enforceGovernance()

    return NextResponse.json({
      error: "GONE",
      message:
        "أُوقف هذا المسار. مرتجع المبيعات يمر بدورة الاعتماد: طلب مرتجع ← اعتماد إدارى ← استلام مخزنى. " +
        "استخدم /api/sales-return-requests.",
    }, { status: 410 })
  } catch (error: any) {
    return NextResponse.json({
      error: error.message
    }, {
      status: error.message.includes('Unauthorized') ? 401 : 403
    })
  }
}
