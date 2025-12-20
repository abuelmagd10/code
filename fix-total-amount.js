const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(supabaseUrl, supabaseKey)

async function fixTotalAmount() {
  try {
    console.log('🔧 إصلاح total_amount...')
    
    const companyId = '3a663f6b-0689-4952-93c1-6d958c737089'
    
    const { data, error } = await supabase
      .from('sales_orders')
      .update({ 
        total_amount: 0  // هذا هو العمود الصحيح!
      })
      .eq('company_id', companyId)
      .eq('so_number', 'SO-0001')
      .select()

    if (error) {
      console.error('❌ خطأ:', error)
    } else {
      console.log('✅ تم إصلاح total_amount بنجاح!')
      console.log('📊 البيانات المحدثة:', {
        so_number: data[0].so_number,
        total: data[0].total,
        total_amount: data[0].total_amount,
        status: data[0].status
      })
    }

  } catch (error) {
    console.error('❌ خطأ عام:', error)
  }
}

fixTotalAmount()