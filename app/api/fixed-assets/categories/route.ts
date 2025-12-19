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

    const { data, error } = await supabase
      .from('asset_categories')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name')

    if (error) throw error

    return NextResponse.json({ data: data || [] })
  } catch (error) {
    console.error('Error fetching asset categories:', error)
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
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
      code,
      name,
      description,
      default_useful_life_months,
      default_depreciation_method,
      default_asset_account_id,
      default_depreciation_account_id,
      default_expense_account_id
    } = body

    const { data, error } = await supabase
      .from('asset_categories')
      .insert({
        company_id: companyId,
        code: code.toUpperCase(),
        name,
        description,
        default_useful_life_months,
        default_depreciation_method,
        default_asset_account_id,
        default_depreciation_account_id,
        default_expense_account_id
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error('Error creating asset category:', error)
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
  }
}