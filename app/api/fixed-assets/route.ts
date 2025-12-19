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
    console.log('🚀 Starting fixed asset creation...')
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      console.error('❌ No active company found')
      return NextResponse.json({ error: 'No active company' }, { status: 400 })
    }
    console.log('✅ Company ID:', companyId)

    const body = await request.json()
    console.log('📋 Request body received:', JSON.stringify(body, null, 2))
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

    // Validate required fields
    console.log('🔍 Validating required fields...')
    if (!category_id || !name || !purchase_date || !depreciation_start_date || !purchase_cost || !useful_life_months || !asset_account_id || !accumulated_depreciation_account_id || !depreciation_expense_account_id) {
      console.error('❌ Missing required fields:', {
        category_id: !!category_id,
        name: !!name,
        purchase_date: !!purchase_date,
        depreciation_start_date: !!depreciation_start_date,
        purchase_cost: !!purchase_cost,
        useful_life_months: !!useful_life_months,
        asset_account_id: !!asset_account_id,
        accumulated_depreciation_account_id: !!accumulated_depreciation_account_id,
        depreciation_expense_account_id: !!depreciation_expense_account_id
      })
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    console.log('✅ All required fields present')

    // Generate asset code if not provided
    let finalAssetCode = asset_code
    if (!finalAssetCode) {
      console.log('🔢 Generating asset code...')
      const { data: lastAsset, error: lastAssetError } = await supabase
        .from('fixed_assets')
        .select('asset_code')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(1)

      if (lastAssetError) {
        console.error('❌ Error fetching last asset:', lastAssetError)
        throw lastAssetError
      }

      const lastNumber = lastAsset?.[0]?.asset_code ?
        parseInt(lastAsset[0].asset_code.replace(/\D/g, '')) || 0 : 0
      finalAssetCode = `FA-${String(lastNumber + 1).padStart(4, '0')}`
      console.log('✅ Generated asset code:', finalAssetCode)
    }

    // Insert asset
    console.log('💾 Inserting asset into database...')
    const assetData = {
      company_id: companyId,
      category_id,
      asset_code: finalAssetCode,
      name,
      description,
      serial_number,
      purchase_date,
      depreciation_start_date,
      purchase_cost: parseFloat(purchase_cost),
      salvage_value: parseFloat(salvage_value || 0),
      useful_life_months: parseInt(useful_life_months),
      depreciation_method: depreciation_method || 'straight_line',
      declining_balance_rate: parseFloat(declining_balance_rate || 0.2),
      asset_account_id,
      accumulated_depreciation_account_id,
      depreciation_expense_account_id,
      branch_id,
      cost_center_id,
      warehouse_id,
      status: 'draft'
    }
    console.log('📊 Asset data to insert:', JSON.stringify(assetData, null, 2))

    const { data: asset, error: assetError } = await supabase
      .from('fixed_assets')
      .insert(assetData)
      .select()
      .single()

    if (assetError) {
      console.error('❌ Asset insertion error:', JSON.stringify(assetError, null, 2))
      return NextResponse.json({
        error: 'Failed to create asset',
        details: assetError.message,
        code: assetError.code,
        hint: assetError.hint
      }, { status: 500 })
    }
    console.log('✅ Asset created successfully:', asset)

    // Generate depreciation schedule
    console.log('📅 Generating depreciation schedule...')
    try {
      const { error: scheduleError } = await supabase.rpc('generate_depreciation_schedule', {
        p_asset_id: asset.id
      })

      if (scheduleError) {
        console.error('❌ Error generating depreciation schedule:', JSON.stringify(scheduleError, null, 2))
        // Don't fail the entire operation if schedule generation fails
        // The asset is still created successfully
      } else {
        console.log('✅ Depreciation schedule generated successfully')
      }
    } catch (scheduleError: any) {
      console.error('❌ Error calling generate_depreciation_schedule:', scheduleError)
      // Continue without failing - asset is still valid
    }

    console.log('🎉 Fixed asset creation completed successfully!')
    return NextResponse.json({ data: asset }, { status: 201 })
  } catch (error: any) {
    console.error('💥 Unexpected error creating fixed asset:', error)
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      stack: error?.stack
    })
    return NextResponse.json({
      error: 'Failed to create asset',
      details: error?.message || 'Unknown error',
      code: error?.code,
      hint: error?.hint
    }, { status: 500 })
  }
}