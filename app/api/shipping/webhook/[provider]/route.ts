// =============================================
// API: Shipping Webhook Handler
// معالج Webhooks من شركات الشحن
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyWebhookSignature, createShippingAdapter } from '@/lib/shipping/index'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  // استخدام Service Role للـ Webhooks (لا يوجد مستخدم) - created inside function to avoid build-time errors
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  const { provider: providerCode } = await params
  const requestId = `WH-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

  try {
    // قراءة البيانات
    const rawBody = await request.text()
    const body = JSON.parse(rawBody)
    const signature = request.headers.get('x-signature') || 
                      request.headers.get('x-webhook-signature') ||
                      request.headers.get('authorization') || ''

    // استخراج رقم التتبع من البيانات (يختلف حسب الشركة)
    const trackingNumber = extractTrackingNumber(providerCode, body)

    if (!trackingNumber) {
      return NextResponse.json({ error: 'Missing tracking number' }, { status: 400 })
    }

    // البحث عن الشحنة
    const { data: shipment, error: shipmentError } = await supabase
      .from('shipments')
      .select('*, shipping_providers(*)')
      .or(`tracking_number.eq.${trackingNumber},awb_number.eq.${trackingNumber}`)
      .single()

    if (shipmentError || !shipment) {
      // تسجيل الـ Webhook حتى لو لم نجد الشحنة
      await logWebhook(supabase, requestId, null, null, null, body, signature, false, 'Shipment not found')
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    const provider = shipment.shipping_providers

    // التحقق من التوقيع إذا كان متوفراً
    let signatureValid = true
    if (provider?.webhook_secret && signature) {
      signatureValid = verifyWebhookSignature(rawBody, signature, provider.webhook_secret)
      if (!signatureValid) {
        await logWebhook(supabase, requestId, shipment.company_id, provider.id, shipment.id, body, signature, false, 'Invalid signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    // معالجة البيانات
    const adapter = createShippingAdapter(provider)
    const statusData = extractStatusData(providerCode, body)
    const internalStatus = adapter.mapProviderStatus(statusData.status_code || statusData.status)

    // تحديث الشحنة
    const updateData: any = {
      provider_status: statusData.status,
      provider_status_code: statusData.status_code,
      provider_updated_at: new Date().toISOString(),
    }

    if (internalStatus && internalStatus !== shipment.status) {
      updateData.status = internalStatus
    }

    if (internalStatus === 'delivered') {
      updateData.delivery_date = statusData.timestamp || new Date().toISOString()
      updateData.delivered_to = statusData.delivered_to
    }

    await supabase
      .from('shipments')
      .update(updateData)
      .eq('id', shipment.id)

    // إضافة سجل الحالة
    await supabase.from('shipment_status_logs').insert({
      company_id: shipment.company_id,
      shipment_id: shipment.id,
      internal_status: internalStatus,
      provider_status: statusData.status,
      provider_status_code: statusData.status_code,
      source: 'webhook',
      location: statusData.location,
      raw_data: body,
    })

    // تسجيل الـ Webhook
    await logWebhook(supabase, requestId, shipment.company_id, provider.id, shipment.id, body, signature, signatureValid, null)

    return NextResponse.json({ success: true, request_id: requestId })
  } catch (error: any) {
    console.error('Webhook error:', error)
    
    // تسجيل الخطأ في shipping_webhook_logs
    try {
      // محاولة استخراج المعلومات المتاحة لتسجيل الخطأ
      let companyId: string | null = null
      let providerId: string | null = null
      let shipmentId: string | null = null
      let body: any = null
      let signature = ''
      
      try {
        // محاولة قراءة body إذا كان متاحاً
        const rawBody = await request.clone().text()
        body = JSON.parse(rawBody)
        signature = request.headers.get('x-signature') || 
                   request.headers.get('x-webhook-signature') ||
                   request.headers.get('authorization') || ''
        
        // محاولة البحث عن shipment إذا كان trackingNumber متاحاً
        const trackingNumber = extractTrackingNumber(providerCode, body)
        if (trackingNumber) {
          const { data: shipment } = await supabase
            .from('shipments')
            .select('id, company_id, shipping_provider_id')
            .or(`tracking_number.eq.${trackingNumber},awb_number.eq.${trackingNumber}`)
            .single()
          
          if (shipment) {
            companyId = shipment.company_id
            providerId = shipment.shipping_provider_id
            shipmentId = shipment.id
          }
        }
      } catch (parseError) {
        // إذا فشل parsing، نستخدم null
        console.error('Error parsing body in catch block:', parseError)
      }
      
      // تسجيل الخطأ في قاعدة البيانات
      await logWebhook(
        supabase,
        requestId,
        companyId,
        providerId,
        shipmentId,
        body,
        signature,
        false,
        error?.message || 'Webhook processing failed'
      )
    } catch (logError) {
      // إذا فشل تسجيل الخطأ، نكتفي بتسجيله في console
      console.error('Failed to log webhook error to database:', logError)
    }
    
    return NextResponse.json({
      error: 'Webhook processing failed',
      request_id: requestId,
    }, { status: 500 })
  }
}

// تسجيل الـ Webhook
async function logWebhook(
  supabase: ReturnType<typeof createClient>,
  requestId: string,
  companyId: string | null,
  providerId: string | null,
  shipmentId: string | null,
  body: any,
  signature: string,
  signatureValid: boolean,
  errorMessage: string | null
) {
  await supabase.from('shipping_webhook_logs').insert({
    request_id: requestId,
    company_id: companyId,
    provider_id: providerId,
    shipment_id: shipmentId,
    request_body: body,
    signature,
    signature_valid: signatureValid,
    processed: !errorMessage,
    error_message: errorMessage,
    processed_at: errorMessage ? null : new Date().toISOString(),
  })
}

// استخراج رقم التتبع حسب شركة الشحن
function extractTrackingNumber(provider: string, body: any): string | null {
  switch (provider.toLowerCase()) {
    case 'aramex': return body.ShipmentNumber || body.TrackingNumber
    case 'bosta': return body.trackingNumber || body.data?.trackingNumber
    case 'smsa': return body.awbNo || body.trackingNumber
    case 'dhl': return body.shipmentTrackingNumber || body.awb
    default: return body.tracking_number || body.trackingNumber || body.awb
  }
}

// استخراج بيانات الحالة حسب شركة الشحن
function extractStatusData(provider: string, body: any): any {
  switch (provider.toLowerCase()) {
    case 'aramex':
      return {
        status: body.UpdateDescription,
        status_code: body.UpdateCode,
        location: body.UpdateLocation,
        timestamp: body.UpdateDateTime,
      }
    case 'bosta':
      return {
        status: body.state?.value || body.status,
        status_code: body.state?.code,
        location: body.hub?.name,
        timestamp: body.timestamp,
        delivered_to: body.receiverName,
      }
    default:
      return {
        status: body.status || body.state,
        status_code: body.status_code || body.code,
        location: body.location,
        timestamp: body.timestamp || body.updated_at,
      }
  }
}

