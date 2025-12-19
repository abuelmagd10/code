import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status')
    const categoryId = searchParams.get('category_id')

    let query = supabase
      .from('fixed_assets')
      .select(`
        *,
        asset_categories(name, code),
        branches(name, branch_name),
        cost_centers(cost_center_name)
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (categoryId && categoryId !== 'all') {
      query = query.eq('category_id', categoryId)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,asset_code.ilike.%${search}%`)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ data: data || [] })
  } catch (error) {
    console.error('Error fetching fixed assets:', error)
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 })
    }

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
      warehouse_id
    } = body

    // Generate asset code if not provided
    let finalAssetCode = asset_code
    if (!finalAssetCode) {
      const { data: lastAsset } = await supabase
        .from('fixed_assets')
        .select('asset_code')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(1)

      const lastNumber = lastAsset?.[0]?.asset_code ?
        parseInt(lastAsset[0].asset_code.replace(/\D/g, '')) || 0 : 0
      finalAssetCode = `FA-${String(lastNumber + 1).padStart(4, '0')}`
    }

    // Insert asset
    const { data: asset, error: assetError } = await supabase
      .from('fixed_assets')
      .insert({
        company_id: companyId,
        category_id,
        asset_code: finalAssetCode,
        name,
        description,
        serial_number,
        purchase_date,
        depreciation_start_date,
        purchase_cost,
        salvage_value: salvage_value || 0,
        useful_life_months,
        depreciation_method: depreciation_method || 'straight_line',
        declining_balance_rate: declining_balance_rate || 0.2,
        asset_account_id,
        accumulated_depreciation_account_id,
        depreciation_expense_account_id,
        branch_id,
        cost_center_id,
        warehouse_id,
        status: 'draft'
      })
      .select()
      .single()

    if (assetError) {
      console.error('Asset insertion error:', assetError)
      return NextResponse.json({
        error: 'Failed to create asset',
        details: assetError.message
      }, { status: 500 })
    }

    // Generate depreciation schedule
    try {
      const { error: scheduleError } = await supabase.rpc('generate_depreciation_schedule', {
        p_asset_id: asset.id
      })

      if (scheduleError) {
        console.error('Error generating depreciation schedule:', scheduleError)
        // Don't fail the entire operation if schedule generation fails
        // The asset is still created successfully
      }
    } catch (scheduleError) {
      console.error('Error calling generate_depreciation_schedule:', scheduleError)
      // Continue without failing - asset is still valid
    }

    return NextResponse.json({ data: asset }, { status: 201 })
  } catch (error) {
    console.error('Error creating fixed asset:', error)
    return NextResponse.json({ error: 'Failed to create asset' }, { status: 500 })
  }
}