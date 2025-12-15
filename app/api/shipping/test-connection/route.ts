// =============================================
// API: Test Shipping Provider Connection
// اختبار الاتصال بشركة الشحن
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createShippingAdapter } from '@/lib/shipping/index'
import { secureApiRequest } from '@/lib/api-security'
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError, notFoundError } from '@/lib/api-error-handler'

export async function POST(request: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      permissions: ['shipping:write']
    })

    if (error) return error
    if (!user || !companyId) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    }
    // === نهاية التحصين الأمني ===

    const supabase = await createClient()

    const body = await request.json()
    const { provider_id, provider_config } = body

    let providerData

    if (provider_id) {
      // جلب بيانات شركة الشحن من قاعدة البيانات
      const { data, error } = await supabase
        .from('shipping_providers')
        .select('*')
        .eq('id', provider_id)
        .eq('company_id', companyId)
        .single()

      if (error || !data) {
        return notFoundError('شركة الشحن', 'Provider not found')
      }
      providerData = data
    } else if (provider_config) {
      // استخدام البيانات المرسلة مباشرة (للاختبار قبل الحفظ)
      providerData = provider_config
    } else {
      return badRequestError('معرف شركة الشحن أو بيانات الإعداد مطلوبة', ['provider_id', 'provider_config'])
    }

    // إنشاء الـ Adapter
    const adapter = createShippingAdapter(providerData)

    // اختبار الاتصال
    const result = await adapter.testConnection()

    return apiSuccess({
      success: result.success,
      message: result.message,
      provider: providerData.provider_name,
      environment: providerData.environment || 'sandbox',
    })
  } catch (error: any) {
    console.error('Test connection error:', error)
    return internalError('فشل اختبار الاتصال', error instanceof Error ? error.message : 'Unknown error')
  }
}

