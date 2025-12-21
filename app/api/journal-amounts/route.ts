import { createClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"
import { NextRequest, NextResponse } from "next/server"




export async function GET(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, branchId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: "reports", action: "read" },
      allowedRoles: ['owner', 'admin', 'accountant']
    })

    if (error) return error
    // === نهاية التحصين الأمني ===

    const supabase = createClient()

    const { searchParams } = new URL(req.url)
    const idsParam = String(searchParams.get("ids") || "")
    const ids = idsParam.split(",").map(s => s.trim()).filter(Boolean)
    if (ids.length === 0) return NextResponse.json({
      success: true,
      data: []
    })

    const { data, error: dbError } = await supabase
      .from("journal_entry_lines")
      .select("journal_entry_id, debit_amount, credit_amount, chart_of_accounts!inner(sub_type), journal_entries!inner(company_id, branch_id)")
      .in("journal_entry_id", ids)
      .eq("journal_entries.company_id", companyId)

    if (dbError) {
      return serverError(`خطأ في جلب بيانات القيود: ${dbError.message}`)
    }

    const sumDebit: Record<string, number> = {}
    const sumCredit: Record<string, number> = {}
    const netCash: Record<string, number> = {}
    for (const l of data || []) {
      const eid = String((l as any).journal_entry_id)
      const d = Number((l as any).debit_amount || 0)
      const c = Number((l as any).credit_amount || 0)
      sumDebit[eid] = (sumDebit[eid] || 0) + d
      sumCredit[eid] = (sumCredit[eid] || 0) + c
      const st = String(((l as any).chart_of_accounts || {}).sub_type || '').toLowerCase()
      if (st === 'cash' || st === 'bank') {
        netCash[eid] = (netCash[eid] || 0) + (d - c)
      }
    }
    const allIds = Array.from(new Set([...(data || []).map((l: any) => String(l.journal_entry_id))]))
    const result = allIds.map((eid) => {
      const cashDelta = Number(netCash[eid] || 0)
      if (cashDelta !== 0) {
        return { 
          journal_entry_id: eid, 
          amount: cashDelta, 
          net_amount: cashDelta,
          basis: 'cash' 
        }
      }
      
      const debit = Number(sumDebit[eid] || 0)
      const credit = Number(sumCredit[eid] || 0)
      const netAmount = debit - credit
      
      if (Math.abs(netAmount) < 0.01) {
        // Balanced entry (debit = credit)
        // amount: actual amount for display (e.g., 138.89 for depreciation)
        // net_amount: 0 to indicate equilibrium for calculations
        const actualAmount = Math.max(debit, credit)
        return { 
          journal_entry_id: eid, 
          amount: actualAmount,  // Display amount
          net_amount: 0,         // Net difference (semantic meaning)
          basis: 'balanced' 
        }
      }
      // Unbalanced entry - net amount is the same as display amount
      return { 
        journal_entry_id: eid, 
        amount: netAmount, 
        net_amount: netAmount,
        basis: 'net' 
      }
    })
    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب مبالغ القيود: ${e?.message}`)
  }
}
