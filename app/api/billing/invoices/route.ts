/**
 * GET /api/billing/invoices
 * Lists invoices for the authenticated company (most recent first).
 * Used by the Customer Portal (Phase C).
 *
 * Query params:
 *   - limit:  number (default 25, max 100)
 *   - offset: number (default 0)
 *   - status: optional filter ('paid' | 'pending' | 'failed' | 'draft' | 'void')
 */

import { NextRequest } from 'next/server'
import { requireOwnerOrAdmin } from '@/lib/api-security'
import { apiError, apiSuccess, internalError, HTTP_STATUS } from '@/lib/api-error-handler'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, 'لم يتم العثور على الشركة', 'company_not_found')
    }

    const url = new URL(req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '25', 10), 100)
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0)
    const statusFilter = url.searchParams.get('status') || undefined

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    let query = admin
      .from('billing_invoices')
      .select(
        'id, invoice_number, invoice_type, status, currency, total, total_usd, ' +
        'tax_rate, tax_amount, seats_count, billing_period, ' +
        'paymob_transaction_id, paid_at, period_start, period_end, ' +
        'pdf_url, created_at',
        { count: 'exact' }
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    const { data, error: fetchErr, count } = await query

    if (fetchErr) {
      return internalError('خطأ فى جلب الفواتير', fetchErr.message)
    }

    return apiSuccess({
      invoices: data || [],
      total: count ?? 0,
      limit,
      offset,
    })
  } catch (e: any) {
    return internalError('خطأ فى جلب الفواتير', e.message)
  }
}
