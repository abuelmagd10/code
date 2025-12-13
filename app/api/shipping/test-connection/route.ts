// =============================================
// API: Test Shipping Provider Connection
// اختبار الاتصال بشركة الشحن
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
    const { provider_id, provider_config } = body

    let providerData

    if (provider_id) {
      // جلب بيانات شركة الشحن من قاعدة البيانات
      const { data, error } = await supabase
        .from('shipping_providers')
        .select('*')
        .eq('id', provider_id)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
      }
      providerData = data
    } else if (provider_config) {
      // استخدام البيانات المرسلة مباشرة (للاختبار قبل الحفظ)
      providerData = provider_config
    } else {
      return NextResponse.json({ error: 'Missing provider_id or provider_config' }, { status: 400 })
    }

    // إنشاء الـ Adapter
    const adapter = createShippingAdapter(providerData)

    // اختبار الاتصال
    const result = await adapter.testConnection()

    return NextResponse.json({
      success: result.success,
      message: result.message,
      provider: providerData.provider_name,
      environment: providerData.environment || 'sandbox',
    })
  } catch (error) {
    console.error('Test connection error:', error)
    return NextResponse.json({
      success: false,
      error: 'Connection test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

