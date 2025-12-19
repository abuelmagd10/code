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
      .from('depreciation_schedules')
      .select('*')
      .eq('company_id', companyId)
      .eq('asset_id', id)
      .order('period_number')

    if (error) throw error

    return NextResponse.json({ data: data || [] })
  } catch (error) {
    console.error('Error fetching depreciation schedules:', error)
    return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 })
  }
}

export async function POST(
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
    const { action, schedule_ids, user_id } = body

    if (action === 'approve') {
      // Approve schedules
      const { error } = await supabase
        .from('depreciation_schedules')
        .update({
          status: 'approved',
          approved_by: user_id,
          approved_at: new Date().toISOString()
        })
        .eq('company_id', companyId)
        .eq('asset_id', id)
        .in('id', schedule_ids)
        .eq('status', 'pending')

      if (error) throw error

      return NextResponse.json({ success: true })
    }

    if (action === 'post') {
      // Post depreciation
      for (const scheduleId of schedule_ids) {
        const { error } = await supabase.rpc('post_depreciation', {
          p_schedule_id: scheduleId,
          p_user_id: user_id
        })

        if (error) throw error
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error processing depreciation action:', error)
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 })
  }
}