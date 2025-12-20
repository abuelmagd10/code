const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkAndFixStatus() {
  try {
    console.log('🔍 فحص الحالة الحالية...')
    
    const companyId = '3a663f6b-0689-4952-93c1-6d958c737089'
    
    // فحص الحالة الحالية
    const { data: current } = await supabase
      .from('sales_orders')
      .select('status, total_amount')
      .eq('company_id', companyId)
      .eq('so_number', 'SO-0001')
      .single()
    
    console.log('الحالة الحالية:', current)
    
    // جرب حالات مختلفة
    const statusesToTry = ['returned', 'completed', 'cancelled', 'closed']
    
    for (const status of statusesToTry) {
      console.log(`\n🔄 جرب تحديث إلى: ${status}`)
      
      const { data, error } = await supabase
        .from('sales_orders')
        .update({ status })
        .eq('company_id', companyId)
        .eq('so_number', 'SO-0001')
        .select()

      if (error) {
        console.log(`❌ فشل ${status}:`, error.message)
      } else {
        console.log(`✅ نجح ${status}:`, data[0].status)
        break
      }
    }

  } catch (error) {
    console.error('❌ خطأ عام:', error)
  }
}

checkAndFixStatus()