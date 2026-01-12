import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 
  enforceGovernance, 
  applyGovernanceFilters,
  validateGovernanceData,
  addGovernanceData
} from '@/lib/governance-middleware'

/**
 * مثال: GET /api/sales-orders
 * قراءة أوامر البيع مع تطبيق فلاتر الحوكمة
 */
export async function GET(request: NextRequest) {
  try {
    const governance = await enforceGovernance()
    const supabase = await createClient()
    
    let query = supabase
      .from('sales_orders')
      .select('*')
    
    query = applyGovernanceFilters(query, governance)
    
    const { data, error } = await query
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ data })
    
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message }, 
      { status: error.message.includes('Unauthorized') ? 401 : 403 }
    )
  }
}

/**
 * مثال: POST /api/sales-orders
 * إنشاء أمر بيع مع التحقق من الحوكمة
 */
export async function POST(request: NextRequest) {
  try {
    const governance = await enforceGovernance()
    const body = await request.json()
    const dataWithGovernance = addGovernanceData(body, governance)
    validateGovernanceData(dataWithGovernance, governance)
    
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('sales_orders')
      .insert(dataWithGovernance)
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ data }, { status: 201 })
    
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message }, 
      { status: error.message.includes('Violation') ? 403 : 500 }
    )
  }
}

/**
 * مثال: PUT /api/sales-orders/[id]
 * تحديث أمر بيع مع التحقق من الحوكمة
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const governance = await enforceGovernance()
    const body = await request.json()
    const supabase = await createClient()
    
    let checkQuery = supabase
      .from('sales_orders')
      .select('id')
      .eq('id', params.id)
    
    checkQuery = applyGovernanceFilters(checkQuery, governance)
    
    const { data: existing, error: checkError } = await checkQuery.single()
    
    if (checkError || !existing) {
      return NextResponse.json(
        { error: 'Record not found or access denied' }, 
        { status: 404 }
      )
    }
    
    if (body.company_id || body.branch_id || body.warehouse_id || body.cost_center_id) {
      const dataWithGovernance = {
        company_id: body.company_id || governance.companyId,
        branch_id: body.branch_id,
        warehouse_id: body.warehouse_id,
        cost_center_id: body.cost_center_id
      }
      validateGovernanceData(dataWithGovernance, governance)
    }
    
    const { data, error } = await supabase
      .from('sales_orders')
      .update(body)
      .eq('id', params.id)
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ data })
    
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message }, 
      { status: 500 }
    )
  }
}

/**
 * مثال: DELETE /api/sales-orders/[id]
 * حذف أمر بيع مع التحقق من الحوكمة
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const governance = await enforceGovernance()
    const supabase = await createClient()
    
    let query = supabase
      .from('sales_orders')
      .delete()
      .eq('id', params.id)
    
    query = applyGovernanceFilters(query, governance)
    
    const { error } = await query
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ message: 'Deleted successfully' })
    
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message }, 
      { status: 500 }
    )
  }
}
