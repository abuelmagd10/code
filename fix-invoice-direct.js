const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(supabaseUrl, supabaseKey)

async function fixInvoice() {
  try {
    console.log('🔍 فحص قاعدة البيانات...')
    
    // فحص جدول الشركات
    const { data: companies, error: compError } = await supabase
      .from('companies')
      .select('id, name')
      .ilike('name', '%food%')

    console.log('🏢 الشركات الموجودة:', companies)

    if (companies && companies.length > 0) {
      const company = companies[0]
      console.log('✅ تم العثور على الشركة:', company)
      
      // البحث عن الفواتير في هذه الشركة
      const { data: invoices, error: invError } = await supabase
        .from('invoices')
        .select('*')
        .eq('company_id', company.id)
        .eq('invoice_number', 'INV-0001')

      console.log('📝 الفواتير:', invoices)
      
      if (invoices && invoices.length > 0) {
        const invoice = invoices[0]
        console.log('✅ تم العثور على الفاتورة:', {
          id: invoice.id,
          total: invoice.total_amount,
          returned: invoice.returned_amount
        })
        
        // تحديث الفاتورة
        const { data: updated, error: updateError } = await supabase
          .from('invoices')
          .update({
            subtotal: 0,
            total_amount: 0,
            returned_amount: 20000,
            return_status: 'full'
          })
          .eq('id', invoice.id)
          .select()

        if (updateError) {
          console.error('❌ خطأ في التحديث:', updateError)
        } else {
          console.log('✅ تم تحديث الفاتورة بنجاح!')
          console.log('📊 النتيجة:', updated)
        }
      } else {
        console.log('❌ لم يتم العثور على الفاتورة INV-0001')
      }
    } else {
      console.log('❌ لم يتم العثور على شركة foodcana')
    }

  } catch (error) {
    console.error('❌ خطأ عام:', error)
  }
}

fixInvoice()