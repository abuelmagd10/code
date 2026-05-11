import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard, asyncAuditLog } from '@/lib/core'
import {
  addServiceStaffSchema,
  parseJsonBody,
  handleBookingApiError,
  BookingApiError,
} from '@/lib/services/booking-api'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/services/[id]/staff
 * List staff assigned to a service.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { companyId } = context!
    const { id } = await params

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('service_staff')
      .select('*, company_members(user_id, email, role, full_name)')
      .eq('service_id', id)
      .eq('company_id', companyId)

    if (error) throw error

    return NextResponse.json({ success: true, staff: data })
  } catch (error) {
    return handleBookingApiError(error)
  }
}

/**
 * POST /api/services/[id]/staff
 * Assign a staff member to a service.
 * Body: { employee_user_id, is_primary? }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { user, companyId } = context!
    const { id: serviceId } = await params

    const body = await parseJsonBody(req, addServiceStaffSchema)

    const supabase = await createClient()

    // Verify service belongs to company
    const { data: svc, error: svcErr } = await supabase
      .from('services')
      .select('id')
      .eq('id', serviceId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (svcErr) throw svcErr
    if (!svc) throw new BookingApiError(404, 'الخدمة غير موجودة')

    // If setting as primary, clear existing primary first
    if (body.is_primary) {
      await supabase
        .from('service_staff')
        .update({ is_primary: false })
        .eq('service_id', serviceId)
        .eq('company_id', companyId)
        .eq('is_primary', true)
    }

    const { data, error } = await supabase
      .from('service_staff')
      .upsert(
        {
          company_id:        companyId,
          service_id:        serviceId,
          employee_user_id:  body.employee_user_id,
          is_primary:        body.is_primary ?? false,
        },
        { onConflict: 'service_id,employee_user_id' }
      )
      .select()
      .single()

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId:    user.id,
      userEmail: user.email,
      action:    'CREATE',
      table:     'service_staff',
      recordId:  data.id,
      newData:   body,
    })

    return NextResponse.json({ success: true, staff: data }, { status: 201 })
  } catch (error) {
    return handleBookingApiError(error)
  }
}

/**
 * DELETE /api/services/[id]/staff?employee_user_id=xxx
 * Remove a staff member from a service.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { user, companyId } = context!
    const { id: serviceId } = await params
    const employeeUserId = req.nextUrl.searchParams.get('employee_user_id')

    if (!employeeUserId) {
      throw new BookingApiError(400, 'employee_user_id مطلوب في query string')
    }

    const supabase = await createClient()

    const { error } = await supabase
      .from('service_staff')
      .delete()
      .eq('service_id', serviceId)
      .eq('company_id', companyId)
      .eq('employee_user_id', employeeUserId)

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId:    user.id,
      userEmail: user.email,
      action:    'DELETE',
      table:     'service_staff',
      recordId:  serviceId,
      reason:    `Staff ${employeeUserId} removed from service`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleBookingApiError(error)
  }
}
