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
      // ⚠️ ERP Professional Pattern: Only post current month or past months
      // منع ترحيل الفترات المستقبلية (مثل Zoho, Odoo, ERPNext)
      const currentMonthStart = new Date()
      currentMonthStart.setDate(1)
      currentMonthStart.setHours(0, 0, 0, 0)
      
      // Get schedules to verify they're not future periods
      const { data: schedulesData, error: schedulesError } = await supabase
        .from('depreciation_schedules')
        .select('id, period_date, status')
        .eq('company_id', companyId)
        .eq('asset_id', id)
        .in('id', schedule_ids)
      
      if (schedulesError) throw schedulesError
      
      // Filter out future periods
      const validScheduleIds: string[] = []
      const futureScheduleIds: string[] = []
      
      for (const schedule of schedulesData || []) {
        const periodDate = new Date(schedule.period_date)
        periodDate.setHours(0, 0, 0, 0)
        
        if (periodDate > currentMonthStart) {
          futureScheduleIds.push(schedule.id)
        } else {
          validScheduleIds.push(schedule.id)
        }
      }
      
      if (futureScheduleIds.length > 0) {
        return NextResponse.json({ 
          error: 'Cannot post future depreciation periods. Only current month or past months can be posted.',
          future_periods: futureScheduleIds.length
        }, { status: 400 })
      }
      
      if (validScheduleIds.length === 0) {
        return NextResponse.json({ error: 'No valid schedules to post' }, { status: 400 })
      }
      
      // Post only valid (current/past) schedules
      for (const scheduleId of validScheduleIds) {
        const { error } = await supabase.rpc('post_depreciation', {
          p_schedule_id: scheduleId,
          p_user_id: user_id
        })

        if (error) throw error
      }

      return NextResponse.json({ 
        success: true, 
        posted_count: validScheduleIds.length 
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error processing depreciation action:', error)
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 })
  }
}