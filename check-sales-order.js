const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSalesOrder() {
  try {
    console.log('🔍 فحص أمر البيع SO-0001 في شركة foodcana...')
    
    const companyId = '3a663f6b-0689-4952-93c1-6d958c737089'
    
    // جلب أمر البيع
    const { data: salesOrder, error } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('company_id', companyId)
      .eq('so_number', 'SO-0001')
      .single()

    if (error) {
      console.error('❌ خطأ:', error)
      return
    }

    console.log('📊 بيانات أمر البيع الحالية:')
    console.log({
      so_number: salesOrder.so_number,
      subtotal: salesOrder.subtotal,
      tax_amount: salesOrder.tax_amount,
      total: salesOrder.total,
      status: salesOrder.status,
      created_at: salesOrder.created_at
    })

    // التحقق من cache أو مشاكل العرض
    if (salesOrder.total == 0) {
      console.log('✅ أمر البيع محدث بشكل صحيح في قاعدة البيانات')
      console.log('⚠️ المشكلة قد تكون في cache المتصفح أو العرض')
      console.log('💡 جرب: Ctrl+F5 لتحديث الصفحة بدون cache')
    } else {
      console.log('🔧 تحديث أمر البيع...')
      
      const { error: updateError } = await supabase
        .from('sales_orders')
        .update({
          subtotal: 0,
          tax_amount: 0,
          total: 0,
          status: 'fully_returned'
        })
        .eq('id', salesOrder.id)

      if (updateError) {
        console.error('❌ خطأ في التحديث:', updateError)
      } else {
        console.log('✅ تم تحديث أمر البيع بنجاح')
      }
    }

  } catch (error) {
    console.error('❌ خطأ عام:', error)
  }
}

checkSalesOrder()