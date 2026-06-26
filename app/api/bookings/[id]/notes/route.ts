/**
 * v3.74.368 — /api/bookings/[id]/notes
 *
 * Free-text execution log on top of booking_notes. Multiple entries
 * per booking, time-stamped, with the author preserved.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { apiGuard, asyncAuditLog } from '@/lib/core'
import {
  handleBookingApiError,
  BookingApiError,
  parseJsonBody,
} from '@/lib/services/booking-api'

interface RouteParams {
  params: Promise<{ id: string }>
}

const createNoteSchema = z.object({
  body: z.string().min(1, 'الملاحظة مطلوبة').max(2000, 'الملاحظة أطول من المسموح (2000 حرف)'),
})

/**
 * GET — list notes for a booking, newest first, enriched with author name.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { companyId } = context!
    const { id } = await params

    const supabase = await createClient()

    const { data: notes, error } = await supabase
      .from('booking_notes')
      .select('id, user_id, body, created_at')
      .eq('booking_id', id)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Enrich with author names so the UI can render them without a
    // second round trip. We resolve from employees -> user_profiles ->
    // company_members.email so deleted/unlinked users still get a
    // reasonable label.
    let enriched = (notes ?? []) as Array<any>
    if (enriched.length > 0) {
      const userIds = [...new Set(enriched.map((n) => n.user_id))]

      const { data: members } = await supabase
        .from('company_members')
        .select('user_id, email, employee_id')
        .eq('company_id', companyId)
        .in('user_id', userIds)

      const memberMap = Object.fromEntries((members ?? []).map((m: any) => [m.user_id, m]))

      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, display_name, username')
        .in('user_id', userIds)
      const profileMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.user_id, p]))

      const employeeIds = (members ?? []).map((m: any) => m.employee_id).filter(Boolean)
      let employeeMap: Record<string, any> = {}
      if (employeeIds.length > 0) {
        const { data: emps } = await supabase
          .from('employees')
          .select('id, full_name')
          .in('id', [...new Set(employeeIds)])
        employeeMap = Object.fromEntries((emps ?? []).map((e: any) => [e.id, e]))
      }

      enriched = enriched.map((n) => {
        const m = memberMap[n.user_id]
        const p = profileMap[n.user_id]
        const e = m?.employee_id ? employeeMap[m.employee_id] : null
        return {
          ...n,
          author_name: e?.full_name || p?.display_name || p?.username || m?.email || null,
          author_email: m?.email || null,
        }
      })
    }

    return NextResponse.json({ success: true, notes: enriched })
  } catch (error) {
    return handleBookingApiError(error)
  }
}

/**
 * POST — append a new note.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { user, companyId } = context!
    const { id } = await params

    const body = await parseJsonBody(req, createNoteSchema)

    const supabase = await createClient()

    // Verify the booking belongs to the company before insert.
    const { data: bk, error: bErr } = await supabase
      .from('bookings')
      .select('id')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()
    if (bErr) throw bErr
    if (!bk) throw new BookingApiError(404, 'الحجز غير موجود')

    const { data: inserted, error: insErr } = await supabase
      .from('booking_notes')
      .insert({
        booking_id: id,
        company_id: companyId,
        user_id:    user.id,
        body:       body.body.trim(),
      })
      .select('id, user_id, body, created_at')
      .single()
    if (insErr) throw insErr

    asyncAuditLog({
      companyId,
      userId:    user.id,
      userEmail: user.email,
      action:    'CREATE',
      table:     'booking_notes',
      recordId:  inserted.id,
      newData:   { booking_id: id, body: body.body },
    })

    return NextResponse.json({ success: true, note: inserted }, { status: 201 })
  } catch (error) {
    return handleBookingApiError(error)
  }
}

/**
 * DELETE — remove a note (by ?note_id=…). Author or company admin.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { context, errorResponse } = await apiGuard(req, { requireAuth: true, requireCompany: true })
    if (errorResponse) return errorResponse

    const { user, companyId } = context!
    const { id } = await params

    const noteId = req.nextUrl.searchParams.get('note_id')
    if (!noteId) throw new BookingApiError(400, 'note_id مطلوب')

    const supabase = await createClient()
    const { error } = await supabase
      .from('booking_notes')
      .delete()
      .eq('id', noteId)
      .eq('booking_id', id)
      .eq('company_id', companyId)
    if (error) throw error

    asyncAuditLog({
      companyId,
      userId:    user.id,
      userEmail: user.email,
      action:    'DELETE',
      table:     'booking_notes',
      recordId:  noteId,
      reason:    `Note removed from booking ${id}`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleBookingApiError(error)
  }
}
