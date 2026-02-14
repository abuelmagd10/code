import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) return NextResponse.json({ error: 'No active company' }, { status: 400 })

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'register'

    if (type === 'register') {
      const { data, error } = await supabase
        .from('fixed_assets')
        .select(`
          *,
          asset_categories(name),
          branches(name),
          cost_centers(cost_center_name)
        `)
        .eq('company_id', companyId)
        .order('asset_code')

      if (error) throw error
      return NextResponse.json(data)
    }

    if (type === 'transactions') {
      const { data, error } = await supabase
        .from('asset_transactions')
        .select(`
          *,
          fixed_assets(name, asset_code)
        `)
        .eq('company_id', companyId) // Ensure asset_transactions has company_id
        .order('transaction_date', { ascending: false })
        .limit(100)

      if (error) throw error
      return NextResponse.json(data)
    }

    return NextResponse.json([])
  } catch (error) {
    console.error('Error fetching reports:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
