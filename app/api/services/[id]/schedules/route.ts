import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard, asyncAuditLog } from '@/lib/core'
import {
  upsertSchedulesSchema,
  parseJsonBody,
  handleBookingApiError,
  BookingApiError,
} from '@/lib/services/booking-api'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/services/[id]/schedules
 * List weekly schedules for a service.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { companyId } = context!
    const { id } = await params

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('service_schedules')
      .select('*')
      .eq('service_id', id)
      .eq('company_id', companyId)
      .order('day_of_week')

    if (error) throw error

    return NextResponse.json({ success: true, schedules: data })
  } catch (error) {
    return handleBookingApiError(error)
  }
}

/**
 * PUT /api/services/[id]/schedules
 * Replace all weekly schedules for a service (upsert by day_of_week).
 * Body: { schedules: [{ day_of_week, start_time, end_time, is_active }] }
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { user, companyId, member } = context!
    const { id: serviceId } = await params

    const body = await parseJsonBody(req, upsertSchedulesSchema)

    const supabase = await createClient()

    // Verify service belongs to company
    const { data: svc, error: svcErr } = await supabase
      .from('services')
      .select('id, branch_id')
      .eq('id', serviceId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (svcErr) throw svcErr
    if (!svc) throw new BookingApiError(404, 'الخدمة غير موجودة')

    // Validate unique day_of_week in request
    const days = body.schedules.map((s) => s.day_of_week)
    if (new Set(days).size !== days.length) {
      throw new BookingApiError(400, 'يوم مكرر في الجدول، كل يوم يُسمح له بسجل واحد فقط')
    }

    // Replace: delete existing, insert new
    const { error: delErr } = await supabase
      .from('service_schedules')
      .delete()
      .eq('service_id', serviceId)
      .eq('company_id', companyId)

    if (delErr) throw delErr

    const rows = body.schedules.map((s) => ({
      company_id:   companyId,
      branch_id:    svc.branch_id,
      service_id:   serviceId,
      day_of_week:  s.day_of_week,
      start_time:   s.start_time,
      end_time:     s.end_time,
      is_active:    s.is_active ?? true,
    }))

    const { data, error } = await supabase
      .from('service_schedules')
      .insert(rows)
      .select()

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId:    user.id,
      userEmail: user.email,
      action:    'UPDATE',
      table:     'service_schedules',
      recordId:  serviceId,
      newData:   { schedules: body.schedules },
    })

    return NextResponse.json({ success: true, schedules: data })
  } catch (error) {
    return handleBookingApiError(error)
  }
}
