// =============================================
// API: Create Shipment
// إنشاء شحنة جديدة عبر شركة الشحن
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createShippingAdapter, type CreateShipmentRequest } from '@/lib/shipping/index'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // التحقق من المستخدم
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { shipment_id, provider_id, shipment_data } = body

    if (!shipment_id || !provider_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // جلب بيانات شركة الشحن
    const { data: provider, error: providerError } = await supabase
      .from('shipping_providers')
      .select('*')
      .eq('id', provider_id)
      .single()

    if (providerError || !provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    // جلب بيانات الشحنة
    const { data: shipment, error: shipmentError } = await supabase
      .from('shipments')
      .select('*, invoices(*, customers(*))')
      .eq('id', shipment_id)
      .single()

    if (shipmentError || !shipment) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    // تحديث حالة الشحنة إلى "جاري الإنشاء"
    await supabase
      .from('shipments')
      .update({ status: 'pending', api_attempts: (shipment.api_attempts || 0) + 1 })
      .eq('id', shipment_id)

    // إنشاء الـ Adapter
    const adapter = createShippingAdapter(provider)

    // تجهيز بيانات الشحنة
    const createRequest: CreateShipmentRequest = shipment_data || {
      shipper: {
        name: provider.extra_config?.shipper_name || 'Company',
        phone: provider.extra_config?.shipper_phone || '',
        address: provider.extra_config?.shipper_address || '',
        city: provider.extra_config?.shipper_city || '',
        country: provider.extra_config?.shipper_country || 'Egypt',
      },
      consignee: {
        name: shipment.recipient_name || shipment.invoices?.customers?.name || '',
        phone: shipment.recipient_phone || shipment.invoices?.customers?.phone || '',
        address: shipment.recipient_address || shipment.invoices?.customers?.address || '',
        city: shipment.recipient_city || shipment.invoices?.customers?.city || '',
        country: shipment.recipient_country || 'Egypt',
      },
      shipment: {
        weight: shipment.weight || 1,
        dimensions: shipment.dimensions,
        description: shipment.notes || 'Package',
        reference: shipment.shipment_number,
        cod_amount: shipment.invoices?.total_amount,
      },
    }

    // استدعاء API شركة الشحن
    const result = await adapter.createShipment(createRequest)

    if (result.success) {
      // تحديث الشحنة بالبيانات من شركة الشحن
      await supabase
        .from('shipments')
        .update({
          status: 'created',
          tracking_number: result.tracking_number,
          awb_number: result.awb_number,
          label_url: result.label_url,
          tracking_url: result.tracking_url,
          shipping_cost: result.shipping_cost,
          api_response: result.raw_response,
          last_api_error: null,
        })
        .eq('id', shipment_id)

      // إضافة سجل الحالة
      await supabase.from('shipment_status_logs').insert({
        company_id: shipment.company_id,
        shipment_id: shipment_id,
        internal_status: 'created',
        provider_status: 'Created',
        source: 'api',
        notes: 'Shipment created via API',
        raw_data: result.raw_response,
        created_by: user.id,
      })

      return NextResponse.json({
        success: true,
        tracking_number: result.tracking_number,
        awb_number: result.awb_number,
        label_url: result.label_url,
        tracking_url: result.tracking_url,
      })
    } else {
      // تسجيل الخطأ
      await supabase
        .from('shipments')
        .update({
          status: 'failed',
          last_api_error: result.error?.message || 'Unknown error',
          api_response: result.raw_response,
        })
        .eq('id', shipment_id)

      return NextResponse.json({
        success: false,
        error: result.error,
      }, { status: 400 })
    }
  } catch (error) {
    console.error('Create shipment error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

