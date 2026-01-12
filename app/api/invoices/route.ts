/**
 * 🔒 API الفواتير مع الحوكمة الإلزامية
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { 
  enforceGovernance, 
  applyGovernanceFilters,
  validateGovernanceData,
  addGovernanceData
} from "@/lib/governance-middleware"

export async function GET(request: NextRequest) {
  try {
    const governance = await enforceGovernance()
    const supabase = createClient(cookies())
    
    let query = supabase
      .from("invoices")
      .select("*, customers(name, phone)")

    query = applyGovernanceFilters(query, governance)
    query = query.order("invoice_date", { ascending: false })

    const { data: invoices, error: dbError } = await query

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: invoices || [],
      meta: {
        total: (invoices || []).length,
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
    
    const supabase = createClient(cookies())
    const { data, error } = await supabase
      .from("invoices")
      .insert(dataWithGovernance)
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      data,
      governance: {
        enforced: true,
        companyId: governance.companyId,
        branchId: dataWithGovernance.branch_id,
        warehouseId: dataWithGovernance.warehouse_id,
        costCenterId: dataWithGovernance.cost_center_id
      }
    }, { status: 201 })
    
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message 
    }, { 
      status: error.message.includes('Violation') ? 403 : 500 
    })
  }
}
