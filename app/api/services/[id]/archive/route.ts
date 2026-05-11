import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiGuard, asyncAuditLog } from '@/lib/core'
import { handleBookingApiError } from '@/lib/services/booking-api'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/services/[id]/archive
 * Archive (soft-delete) a service via archive_service_atomic RPC.
 * Blocks if the service has future active bookings.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { user, companyId } = context!
    const { id } = await params

    const supabase = await createClient()

    const { data: result, error } = await supabase.rpc('archive_service_atomic', {
      p_company_id: companyId,
      p_service_id: id,
      p_updated_by: user.id,
    })

    if (error) throw error

    asyncAuditLog({
      companyId,
      userId:   user.id,
      userEmail: user.email,
      action:   'DELETE',
      table:    'services',
      recordId: id,
      reason:   'Service archived by user',
    })

    return NextResponse.json({ success: true, result })
  } catch (error) {
    return handleBookingApiError(error)
  }
}
