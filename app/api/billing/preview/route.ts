/**
 * GET /api/billing/preview
 * Returns live pricing preview for given seat count + billing period
 *
 * Query params:
 *   - seats: number (1-1000)
 *   - period: 'monthly' | 'annual'
 *   - currency: ISO code (auto-detected from company if omitted)
 *   - country: ISO country code (auto-detected if omitted)
 *   - coupon: optional promo code
 */
import { NextRequest } from 'next/server'
import { getPricePreview } from '@/lib/billing/pricing-engine'
import { apiError, apiSuccess, internalError, HTTP_STATUS } from '@/lib/api-error-handler'
import { requireOwnerOrAdmin } from '@/lib/api-security'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { user, companyId, error: authErr } = await requireOwnerOrAdmin(req)
    if (authErr) return authErr
    if (!companyId) {
      return apiError(HTTP_STATUS.NOT_FOUND, 'لم يتم العثور على الشركة', 'company_not_found')
    }

    const url = new URL(req.url)
    const seats = parseInt(url.searchParams.get('seats') || '1', 10)
    const period = (url.searchParams.get('period') || 'monthly') as 'monthly' | 'annual'
    let currency = url.searchParams.get('currency') || ''
    let country = url.searchParams.get('country') || ''
    const coupon = url.searchParams.get('coupon') || undefined

    if (seats < 1 || seats > 1000) {
      return apiError(HTTP_STATUS.BAD_REQUEST, 'Seats must be between 1 and 1000', 'invalid_seats')
    }
    if (period !== 'monthly' && period !== 'annual') {
      return apiError(HTTP_STATUS.BAD_REQUEST, 'period must be monthly or annual', 'invalid_period')
    }

    // Auto-detect currency + country from company if not provided
    if (!currency || !country) {
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      const { data: company } = await admin
        .from('companies')
        .select('base_currency, country')
        .eq('id', companyId)
        .maybeSingle()
      if (!currency) currency = company?.base_currency || 'USD'
      if (!country) country = company?.country || 'EG'  // default Egypt
    }

    const preview = await getPricePreview(seats, period, currency, country, coupon)
    return apiSuccess(preview)
  } catch (e: any) {
    return internalError('فشل فى حساب السعر', e.message)
  }
}
