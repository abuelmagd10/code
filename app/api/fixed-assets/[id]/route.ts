import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 })
    }

    const { id } = await params
    const { data, error } = await supabase
      .from('fixed_assets')
      .select(`
        *,
        asset_categories(name, code),
        branches(name, branch_name),
        cost_centers(cost_center_name),
        depreciation_schedules(*)
      `)
      .eq('company_id', companyId)
      .eq('id', id)
      .single()

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching fixed asset:', error)
    return NextResponse.json({ error: 'Failed to fetch asset' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 })
    }

    const { id } = await params
    const body = await request.json()
    const {
      category_id,
      asset_code,
      name,
      description,
      serial_number,
      purchase_date,
      depreciation_start_date,
      purchase_cost,
      salvage_value,
      useful_life_months,
      depreciation_method,
      declining_balance_rate,
      asset_account_id,
      accumulated_depreciation_account_id,
      depreciation_expense_account_id,
      branch_id,
      cost_center_id,
      warehouse_id,
      status
    } = body

    // Update asset
    const { data: asset, error: assetError } = await supabase
      .from('fixed_assets')
      .update({
        category_id,
        asset_code,
        name,
        description,
        serial_number,
        purchase_date,
        depreciation_start_date,
        purchase_cost,
        salvage_value,
        useful_life_months,
        depreciation_method,
        declining_balance_rate,
        asset_account_id,
        accumulated_depreciation_account_id,
        depreciation_expense_account_id,
        branch_id,
        cost_center_id,
        warehouse_id,
        status
      })
      .eq('company_id', companyId)
      .eq('id', id)
      .select()
      .single()

    if (assetError) throw assetError

    // Regenerate depreciation schedule if needed
    if (status === 'active' && asset.status === 'draft') {
      await supabase.rpc('generate_depreciation_schedule', {
        p_asset_id: id
      })
    }

    return NextResponse.json({ data: asset })
  } catch (error) {
    console.error('Error updating fixed asset:', error)
    return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 })
    }

    const { id } = await params
    // Check if asset has posted depreciation
    const { data: schedules } = await supabase
      .from('depreciation_schedules')
      .select('status')
      .eq('asset_id', id)
      .eq('status', 'posted')

    if (schedules && schedules.length > 0) {
      return NextResponse.json({ error: 'Cannot delete asset with posted depreciation' }, { status: 400 })
    }

    // Delete depreciation schedules first
    await supabase
      .from('depreciation_schedules')
      .delete()
      .eq('asset_id', id)

    // Delete asset
    const { error } = await supabase
      .from('fixed_assets')
      .delete()
      .eq('company_id', companyId)
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting fixed asset:', error)
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 })
  }
}