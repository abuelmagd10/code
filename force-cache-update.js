const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(supabaseUrl, supabaseKey)

async function forceUpdate() {
  try {
    const companyId = '3a663f6b-0689-4952-93c1-6d958c737089'
    
    console.log('🔄 إجبار تحديث cache...')
    
    const { data, error } = await supabase
      .from('sales_orders')
      .update({ 
        updated_at: new Date().toISOString(),
        so_number: 'SO-0001-UPDATED'  // تغيير مؤقت
      })
      .eq('company_id', companyId)
      .eq('so_number', 'SO-0001')
      .select()

    if (!error) {
      // إعادة الرقم الأصلي
      await supabase
        .from('sales_orders')
        .update({ 
          so_number: 'SO-0001',
          updated_at: new Date().toISOString()
        })
        .eq('id', data[0].id)
      
      console.log('✅ تم إجبار التحديث')
      console.log('📊 الحالة:', data[0].status)
    }

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

forceUpdate()