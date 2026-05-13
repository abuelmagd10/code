import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard, asyncAuditLog } from '@/lib/core'
import {
  updateServiceSchema,
  parseJsonBody,
  handleBookingApiError,
  BookingApiError,
} from '@/lib/services/booking-api'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/services/[id]
 * Fetch a single service with its schedules and assigned staff.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { companyId } = context!
    const { id } = await params

    const supabase = await createClient()

    const [{ data: service, error }, { data: schedules, error: schedErr }, { data: staffRows, error: staffErr }] =
      await Promise.all([
        supabase
          .from('services')
          .select('*')
          .eq('id', id)
          .eq('company_id', companyId)
          .maybeSingle(),
        supabase
          .from('service_schedules')
          .select('*')
          .eq('service_id', id)
          .eq('company_id', companyId)
          .order('day_of_week'),
        // employee_user_id has no hard FK to company_members (intentional), so we fetch separately
        supabase
          .from('service_staff')
          .select('*')
          .eq('service_id', id)
          .eq('company_id', companyId),
      ])

    if (error) throw error
    if (schedErr) throw schedErr
    if (staffErr) throw staffErr

    if (!service) {
      throw new BookingApiError(404, 'الخدمة غير موجودة أو غير مصرح بالوصول إليها')
    }

    // Enrich staff rows with company_members profile (email, role)
    let staff = staffRows ?? []
    if (staff.length > 0) {
      const userIds = [...new Set(staff.map((s: any) => s.employee_user_id))]
      const { data: members } = await supabase
        .from('company_members')
        .select('user_id, email, role')
        .eq('company_id', companyId)
        .in('user_id', userIds)
      if (members && members.length > 0) {
        const memberMap = Object.fromEntries(members.map((m: any) => [m.user_id, m]))
        staff = staff.map((s: any) => ({
          ...s,
          company_members: memberMap[s.employee_user_id] ?? null,
        }))
      }
    }

    return NextResponse.json({
      success: true,
      service: { ...service, schedules: schedules ?? [], staff },
    })
  } catch (error) {
    return handleBookingApiError(error)
  }
}

/**
 * PUT /api/services/[id]
 * Update a service via update_service_atomic RPC.
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { user, companyId } = context!
    const { id } = await params

    const body = await parseJsonBody(req, updateServiceSchema)

    const supabase = await createClient()

    const { data: result, error } = await supabase.rpc('update_service_atomic', {
      p_company_id:          companyId,
      p_service_id:          id,
      p_updated_by:          user.id,
      p_service_type:        body.service_type ?? null,
      p_duration_minutes:    body.duration_minutes ?? null,
      p_description:         body.description ?? null,
      p_category:            body.category ?? null,
      p_tax_rate:            body.tax_rate ?? null,
      p_commission_rate:     body.commission_rate ?? null,
      p_capacity:            body.capacity ?? null,
      p_buffer_minutes:      body.buffer_minutes ?? null,
      p_advance_booking_days: body.advance_booking_days ?? null,
      p_min_advance_hours:   body.min_advance_hours ?? null,
      p_cancel_before_hours: body.cancel_before_hours ?? null,
      p_cost_center_id:      body.cost_center_id ?? null,
      p_image_url:           body.image_url ?? null,
      p_color_code:          body.color_code ?? null,
      p_currency_code:       body.currency_code ?? null,
      p_is_bookable:         body.is_bookable ?? null,
      p_requires_approval:   body.requires_approval ?? null,
      p_notes:               body.notes ?? null,
      p_product_catalog_id:  body.product_catalog_id ?? null,
    })

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId:   user.id,
      userEmail: user.email,
      action:   'UPDATE',
      table:    'services',
      recordId: id,
      newData:  body,
    })

    return NextResponse.json({ success: true, service: result })
  } catch (error) {
    return handleBookingApiError(error)
  }
}
