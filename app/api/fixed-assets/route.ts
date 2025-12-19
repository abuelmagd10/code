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
    console.log('📨 Raw request headers:', Object.fromEntries(request.headers.entries()))

    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      console.error('❌ No active company found')
      return NextResponse.json({ error: 'No active company' }, { status: 400 })
    }
    console.log('✅ Company ID:', companyId)

    const body = await request.json()
    console.log('📋 Request body received:', JSON.stringify(body, null, 2))
    console.log('🔍 Body keys:', Object.keys(body))
    console.log('🔍 Body types:', Object.fromEntries(Object.entries(body).map(([k, v]) => [k, typeof v])))
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

    // Validate and convert data types
    console.log('🔄 Converting and validating data types...')
    const purchaseCostNum = parseFloat(purchase_cost)
    const salvageValueNum = parseFloat(salvage_value || '0')
    const usefulLifeMonthsNum = parseInt(useful_life_months)
    const decliningBalanceRateNum = parseFloat(declining_balance_rate || '0.2')

    // Validate numeric values
    if (isNaN(purchaseCostNum) || purchaseCostNum <= 0) {
      console.error('❌ Invalid purchase_cost:', purchase_cost, '->', purchaseCostNum)
      return NextResponse.json({ error: 'Invalid purchase cost' }, { status: 400 })
    }
    if (isNaN(salvageValueNum) || salvageValueNum < 0) {
      console.error('❌ Invalid salvage_value:', salvage_value, '->', salvageValueNum)
      return NextResponse.json({ error: 'Invalid salvage value' }, { status: 400 })
    }
    if (isNaN(usefulLifeMonthsNum) || usefulLifeMonthsNum <= 0) {
      console.error('❌ Invalid useful_life_months:', useful_life_months, '->', usefulLifeMonthsNum)
      return NextResponse.json({ error: 'Invalid useful life months' }, { status: 400 })
    }
    if (isNaN(decliningBalanceRateNum) || decliningBalanceRateNum <= 0 || decliningBalanceRateNum > 1) {
      console.error('❌ Invalid declining_balance_rate:', declining_balance_rate, '->', decliningBalanceRateNum)
      return NextResponse.json({ error: 'Invalid declining balance rate' }, { status: 400 })
    }

    // Validate UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(category_id)) {
      console.error('❌ Invalid category_id:', category_id)
      return NextResponse.json({ error: 'Invalid category ID' }, { status: 400 })
    }
    if (!uuidRegex.test(asset_account_id)) {
      console.error('❌ Invalid asset_account_id:', asset_account_id)
      return NextResponse.json({ error: 'Invalid asset account ID' }, { status: 400 })
    }
    if (!uuidRegex.test(accumulated_depreciation_account_id)) {
      console.error('❌ Invalid accumulated_depreciation_account_id:', accumulated_depreciation_account_id)
      return NextResponse.json({ error: 'Invalid accumulated depreciation account ID' }, { status: 400 })
    }
    if (!uuidRegex.test(depreciation_expense_account_id)) {
      console.error('❌ Invalid depreciation_expense_account_id:', depreciation_expense_account_id)
      return NextResponse.json({ error: 'Invalid depreciation expense account ID' }, { status: 400 })
    }

    // Validate dates
    const purchaseDate = new Date(purchase_date)
    const depreciationStartDate = new Date(depreciation_start_date)
    if (isNaN(purchaseDate.getTime())) {
      console.error('❌ Invalid purchase_date:', purchase_date)
      return NextResponse.json({ error: 'Invalid purchase date' }, { status: 400 })
    }
    if (isNaN(depreciationStartDate.getTime())) {
      console.error('❌ Invalid depreciation_start_date:', depreciation_start_date)
      return NextResponse.json({ error: 'Invalid depreciation start date' }, { status: 400 })
    }

    console.log('✅ All data validation passed')

    // Insert asset
    console.log('💾 Inserting asset into database...')
    const assetData = {
      company_id: companyId,
      category_id,
      asset_code: finalAssetCode,
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      serial_number: serial_number ? String(serial_number).trim() : null,
      purchase_date: purchaseDate.toISOString().split('T')[0], // YYYY-MM-DD format
      depreciation_start_date: depreciationStartDate.toISOString().split('T')[0],
      purchase_cost: purchaseCostNum,
      salvage_value: salvageValueNum,
      useful_life_months: usefulLifeMonthsNum,
      depreciation_method: depreciation_method || 'straight_line',
      declining_balance_rate: decliningBalanceRateNum,
      asset_account_id,
      accumulated_depreciation_account_id,
      depreciation_expense_account_id,
      branch_id: branch_id || null,
      cost_center_id: cost_center_id || null,
      warehouse_id: warehouse_id || null,
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