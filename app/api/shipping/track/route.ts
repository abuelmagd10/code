// =============================================
// API: Track Shipment
// تتبع شحنة من شركة الشحن
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createShippingAdapter } from '@/lib/shipping/index'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // التحقق من المستخدم
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { shipment_id } = body

    if (!shipment_id) {
      return NextResponse.json({ error: 'Missing shipment_id' }, { status: 400 })
    }

    // جلب بيانات الشحنة مع شركة الشحن
    const { data: shipment, error: shipmentError } = await supabase
      .from('shipments')
      .select('*, shipping_providers(*)')
      .eq('id', shipment_id)
      .single()

    if (shipmentError || !shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    if (!shipment.tracking_number) {
      return NextResponse.json({ error: 'No tracking number available' }, { status: 400 })
    }

    const provider = shipment.shipping_providers
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
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

      return NextResponse.json({
        success: true,
        current_status: result.current_status,
        internal_status: internalStatus,
        location: result.location,
        updated_at: result.updated_at,
        estimated_delivery: result.estimated_delivery,
        events: result.events,
      })
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
      }, { status: 400 })
    }
  } catch (error) {
    console.error('Track shipment error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

