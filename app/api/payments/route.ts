/**
 * 🔒 API المدفوعات مع الحوكمة الإلزامية
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

    let query = supabase
      .from("payments")
      .select("*, customers(name), invoices(invoice_number)")

    query = applyGovernanceFilters(query, governance)
    query = query.order("payment_date", { ascending: false })

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

export async function POST(request: NextRequest) {
  try {
    const governance = await enforceGovernance()
    const body = await request.json()
    const dataWithGovernance = addGovernanceData(body, governance)
    validateGovernanceData(dataWithGovernance, governance)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // ✅ استخدام الخدمة الذرية (Atomic Service)
    const { AccountingTransactionService } = await import("@/lib/accounting-transaction-service")
    const service = new AccountingTransactionService(supabase)

    // تحويل البيانات لتناسب الخدمة (مع التأكد من الأنواع)
    const paymentPayload = {
      company_id: governance.companyId,
      branch_id: dataWithGovernance.branch_id, // Governance enforced
      cost_center_id: dataWithGovernance.cost_center_id,
      warehouse_id: dataWithGovernance.warehouse_id,
      invoice_id: dataWithGovernance.invoice_id,
      customer_id: dataWithGovernance.customer_id,
      amount: Number(dataWithGovernance.amount),
      payment_date: dataWithGovernance.payment_date,
      payment_method: dataWithGovernance.payment_method,
      reference: dataWithGovernance.reference || '',
      notes: dataWithGovernance.notes || '',
      account_id: dataWithGovernance.account_id // Optional
    }

    const result = await service.postPaymentAtomic(paymentPayload, user?.id)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: {
        id: result.payment_ids?.[0], // Reconstruct minimal expected data
        ...dataWithGovernance
      },
      governance: {
        enforced: true,
        companyId: governance.companyId,
        branchId: dataWithGovernance.branch_id,
        warehouseId: dataWithGovernance.warehouse_id,
        costCenterId: dataWithGovernance.cost_center_id
      },
      atomic_result: result
    }, { status: 201 })

  } catch (error: any) {
    console.error("Payment API Error:", error)
    return NextResponse.json({
      error: error.message
    }, {
      status: error.message.includes('Violation') ? 403 : 500
    })
  }
}
