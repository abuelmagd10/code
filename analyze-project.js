const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(supabaseUrl, supabaseKey)

async function analyzeProject() {
  try {
    const companyId = '3a663f6b-0689-4952-93c1-6d958c737089'
    
    console.log('🔍 تحليل شامل للمشروع...\n')

    // 1. فحص جدول sales_orders
    console.log('📋 1. جدول أوامر البيع:')
    const { data: salesOrders } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('company_id', companyId)
      .limit(5)
    
    console.log('عدد أوامر البيع:', salesOrders?.length || 0)
    if (salesOrders?.[0]) {
      console.log('عينة من البيانات:', {
        so_number: salesOrders[0].so_number,
        total: salesOrders[0].total,
        status: salesOrders[0].status,
        invoice_id: salesOrders[0].invoice_id
      })
    }

    // 2. فحص جدول invoices
    console.log('\n📋 2. جدول الفواتير:')
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('company_id', companyId)
      .eq('invoice_number', 'INV-0001')
      .single()
    
    if (invoices) {
      console.log('فاتورة INV-0001:', {
        total_amount: invoices.total_amount,
        returned_amount: invoices.returned_amount,
        status: invoices.status,
        sales_order_id: invoices.sales_order_id
      })
    }

    // 3. فحص العلاقة بين الأمر والفاتورة
    console.log('\n🔗 3. العلاقة بين الأمر والفاتورة:')
    const { data: relationship } = await supabase
      .from('sales_orders')
      .select(`
        so_number,
        total,
        status,
        invoices!sales_orders_invoice_id_fkey (
          invoice_number,
          total_amount,
          status
        )
      `)
      .eq('company_id', companyId)
      .eq('so_number', 'SO-0001')
      .single()
    
    console.log('العلاقة:', relationship)

    // 4. فحص RLS policies
    console.log('\n🛡️ 4. فحص سياسات الأمان (RLS):')
    const { data: policies } = await supabase
      .rpc('get_table_policies', { table_name: 'sales_orders' })
      .catch(() => null)
    
    if (policies) {
      console.log('عدد السياسات:', policies.length)
    }

    // 5. فحص triggers
    console.log('\n⚙️ 5. فحص Triggers:')
    const { data: triggers } = await supabase
      .rpc('get_table_triggers', { table_name: 'sales_orders' })
      .catch(() => null)
    
    if (triggers) {
      console.log('عدد Triggers:', triggers.length)
    }

    // 6. فحص المستخدم الحالي والصلاحيات
    console.log('\n👤 6. فحص المستخدم والصلاحيات:')
    const { data: user } = await supabase.auth.getUser()
    console.log('المستخدم:', user?.user?.id || 'غير محدد')

    // 7. محاولة تحديث مباشر
    console.log('\n🔧 7. محاولة تحديث مباشر:')
    const { data: updateResult, error: updateError } = await supabase
      .from('sales_orders')
      .update({ 
        total: 0.01,  // قيمة مؤقتة للاختبار
        updated_at: new Date().toISOString()
      })
      .eq('company_id', companyId)
      .eq('so_number', 'SO-0001')
      .select()

    if (updateError) {
      console.log('❌ خطأ في التحديث:', updateError.message)
      console.log('التفاصيل:', updateError)
    } else {
      console.log('✅ تم التحديث بنجاح:', updateResult)
      
      // إعادة القيمة إلى 0
      await supabase
        .from('sales_orders')
        .update({ total: 0 })
        .eq('company_id', companyId)
        .eq('so_number', 'SO-0001')
    }

    // 8. فحص cache أو views
    console.log('\n📊 8. فحص البيانات النهائية:')
    const { data: finalCheck } = await supabase
      .from('sales_orders')
      .select('so_number, total, status, updated_at')
      .eq('company_id', companyId)
      .eq('so_number', 'SO-0001')
      .single()
    
    console.log('البيانات النهائية:', finalCheck)

  } catch (error) {
    console.error('❌ خطأ في التحليل:', error)
  }
}

analyzeProject()