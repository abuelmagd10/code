/**
 * 🔒 API إشعارات مدين العملاء مع الحوكمة الإلزامية
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
      .from("customer_debit_notes")
      .select(`
        *,
        customers:customer_id (id, name, phone, city)
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

export async function POST(request: NextRequest) {
  try {
    const governance = await enforceGovernance()
    const body = await request.json()
    const dataWithGovernance = addGovernanceData(body, governance)
    validateGovernanceData(dataWithGovernance, governance)

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("customer_debit_notes")
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
