/**
 * GET /api/billing/invoices/[id]/pdf
 *
 * Returns a short-lived signed URL (5 min) for the invoice PDF in
 * Supabase Storage. Only the owner of the company can fetch it.
 *
 * If the PDF was never generated (e.g. webhook failed), this route will
 * attempt a one-time regeneration from the stored pricing_snapshot.
 */

import { NextRequest } from 'next/server'
import { requireOwnerOrAdmin } from '@/lib/api-security'
import { apiError, apiSuccess, internalError, HTTP_STATUS } from '@/lib/api-error-handler'
import { createClient } from '@supabase/supabase-js'
import { getInvoiceSignedUrl, regenerateInvoicePdf } from '@/lib/billing/invoice-generator'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, 'لم يتم العثور على الشركة', 'company_not_found')
    }

    const { id: invoiceId } = await context.params
    if (!invoiceId) {
      return apiError(HTTP_STATUS.BAD_REQUEST, 'معرف الفاتورة مطلوب', 'missing_invoice_id')
    }

    // Verify the invoice belongs to the requesting company
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: invoice, error: fetchErr } = await admin
      .from('billing_invoices')
      .select('id, company_id, invoice_number, pdf_url')
      .eq('id', invoiceId)
      .maybeSingle()

    if (fetchErr || !invoice) {
      return apiError(HTTP_STATUS.NOT_FOUND, 'الفاتورة غير موجودة', 'invoice_not_found')
    }

    if (invoice.company_id !== companyId) {
      return apiError(HTTP_STATUS.FORBIDDEN, 'لا تملك صلاحية الوصول لهذه الفاتورة', 'forbidden')
    }

    // If pdf_url is missing, regenerate first
    if (!invoice.pdf_url) {
      const regen = await regenerateInvoicePdf(invoiceId)
      if (!regen.success) {
        return internalError('تعذر توليد ملف PDF', regen.error || 'regenerate_failed')
      }
    }

    const { url, error: signErr } = await getInvoiceSignedUrl(invoiceId, 300)
    if (signErr || !url) {
      return internalError('تعذر إنشاء رابط التحميل', signErr || 'signed_url_failed')
    }

    return apiSuccess({
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      url,
      expires_in_seconds: 300,
    })
  } catch (e: any) {
    return internalError('خطأ فى جلب الفاتورة', e.message)
  }
}
