import { NextRequest } from 'next/server'
import { requireOwnerOrAdmin } from '@/lib/api-security'
import { apiError, apiSuccess, internalError, HTTP_STATUS } from '@/lib/api-error-handler'
import { getSeatTransactions } from '@/lib/billing/seat-service'

export async function GET(req: NextRequest) {
  try {
    const { companyId, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId) return apiError(HTTP_STATUS.NOT_FOUND, 'لم يتم العثور على الشركة', 'company_not_found')

    const transactions = await getSeatTransactions(companyId)
    return apiSuccess(transactions)
  } catch (e: any) {
    return internalError('خطأ في جلب سجل المعاملات', e.message)
  }
}
