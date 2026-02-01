/**
 * 🔒 API الموردين مع الحوكمة الإلزامية
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  enforceGovernance,
  applyGovernanceFilters,
  addGovernanceData,
  validateGovernanceData
} from "@/lib/governance-middleware"

export async function GET(request: NextRequest) {
  try {
    const governance = await enforceGovernance()
    const supabase = await createClient()
    
    let query = supabase.from("suppliers").select("*")
    query = applyGovernanceFilters(query, governance)
    query = query.order("name")

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      meta: { total: (data || []).length, role: governance.role }
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message }, 
      { status: error.message.includes('Unauthorized') ? 401 : 403 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const governance = await enforceGovernance()
    const body = await request.json()
    
    const data = addGovernanceData(body, governance)
    validateGovernanceData(data, governance)
    
    const supabase = await createClient()
    const { data: result, error } = await supabase
      .from("suppliers")
      .insert(data)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: result }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message }, 
      { status: error.message.includes('Violation') ? 403 : 500 }
    )
  }
}

