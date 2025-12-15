// =============================================
// API: Track Shipment
// تتبع شحنة من شركة الشحن
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
      requirePermission: { resource: 'shipping', action: 'read' }
    })

    if (error) return error
    if (!user || !companyId) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    }
    // === نهاية التحصين الأمني ===

    const supabase = await createClient()

    const body = await request.json()
    const { shipment_id } = body

    if (!shipment_id) {
      return badRequestError('معرف الشحنة مطلوب', ['shipment_id'])
    }

    // جلب بيانات الشحنة مع شركة الشحن
    const { data: shipment, error: shipmentError } = await supabase
      .from('shipments')
      .select('*, shipping_providers(*)')
      .eq('id', shipment_id)
      .eq('company_id', companyId)
      .single()

    if (shipmentError || !shipment) {
      return notFoundError('الشحنة', 'Shipment not found')
    }

    if (!shipment.tracking_number) {
      return badRequestError('لا يوجد رقم تتبع متاح', ['shipment_id'])
    }

    const provider = shipment.shipping_providers
    if (!provider) {
      return notFoundError('شركة الشحن', 'Provider not found')
    }

    // إنشاء الـ Adapter
    const adapter = createShippingAdapter(provider)

    // استدعاء API التتبع
    const result = await adapter.trackShipment({
      tracking_number: shipment.tracking_number,
      awb_number: shipment.awb_number,
    })

    if (result.success) {
      // تحويل حالة شركة الشحن للحالة الداخلية
      const internalStatus = adapter.mapProviderStatus(result.status_code || result.current_status || '')

      // تحديث الشحنة
      const updateData: any = {
        provider_status: result.current_status,
        provider_status_code: result.status_code,
        provider_updated_at: new Date().toISOString(),
      }

      // تحديث الحالة الداخلية إذا تغيرت
      if (internalStatus && internalStatus !== shipment.status) {
        updateData.status = internalStatus
      }

      // إذا تم التسليم
      if (internalStatus === 'delivered') {
        updateData.delivery_date = result.delivered_at || new Date().toISOString()
        updateData.delivered_to = result.delivered_to
      }

      await supabase
        .from('shipments')
        .update(updateData)
        .eq('id', shipment_id)

      // إضافة سجل الحالة إذا تغيرت
      if (result.current_status !== shipment.provider_status) {
        await supabase.from('shipment_status_logs').insert({
          company_id: shipment.company_id,
          shipment_id: shipment_id,
          internal_status: internalStatus,
          provider_status: result.current_status,
          provider_status_code: result.status_code,
          source: 'api',
          location: result.location,
          raw_data: result.raw_response,
          created_by: user.id,
        })
      }

      return apiSuccess({
        success: true,
        current_status: result.current_status,
        internal_status: internalStatus,
        location: result.location,
        updated_at: result.updated_at,
        estimated_delivery: result.estimated_delivery,
        events: result.events,
      })
    } else {
      return apiError(HTTP_STATUS.BAD_REQUEST, 'فشل تتبع الشحنة', result.error?.message || 'Unknown error')
    }
  } catch (error: any) {
    console.error('Track shipment error:', error)
    return internalError('حدث خطأ أثناء تتبع الشحنة', error instanceof Error ? error.message : 'Unknown error')
  }
}

