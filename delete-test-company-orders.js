/**
 * 🗑️ حذف جميع أوامر البيع والفواتير في شركة "تست"
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

const env = {}
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [key, ...value] = line.split('=')
  if (key && value.length) env[key.trim()] = value.join('=').replace(/"/g, '').trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function deleteTestCompanyData() {
  console.log('🗑️ حذف جميع أوامر البيع والفواتير في شركة "تست"')
  
  try {
    // جلب شركة "تست"
    const { data: testCompany } = await supabase
      .from('companies')
      .select('id, name')
      .eq('name', 'تست')
      .single()

    if (!testCompany) {
      console.log('❌ لم يتم العثور على شركة "تست"')
      return
    }

    console.log(`✅ شركة تست: ${testCompany.id}`)

    // حذف الفواتير وعناصرها
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('company_id', testCompany.id)

    if (invoices && invoices.length > 0) {
      console.log(`🔍 العثور على ${invoices.length} فاتورة`)
      
      // حذف عناصر الفواتير
      const { error: itemsError } = await supabase
        .from('invoice_items')
        .delete()
        .in('invoice_id', invoices.map(i => i.id))

      if (itemsError) {
        console.error('❌ خطأ في حذف عناصر الفواتير:', itemsError)
      } else {
        console.log('✅ تم حذف عناصر الفواتير')
      }

      // حذف الفواتير
      const { error: invoicesError } = await supabase
        .from('invoices')
        .delete()
        .eq('company_id', testCompany.id)

      if (invoicesError) {
        console.error('❌ خطأ في حذف الفواتير:', invoicesError)
      } else {
        console.log('✅ تم حذف الفواتير')
      }
    }

    // حذف أوامر البيع وعناصرها
    const { data: salesOrders } = await supabase
      .from('sales_orders')
      .select('id, so_number')
      .eq('company_id', testCompany.id)

    if (salesOrders && salesOrders.length > 0) {
      console.log(`🔍 العثور على ${salesOrders.length} أمر بيع`)
      
      // حذف عناصر أوامر البيع
      const { error: soItemsError } = await supabase
        .from('sales_order_items')
        .delete()
        .in('sales_order_id', salesOrders.map(so => so.id))

      if (soItemsError) {
        console.error('❌ خطأ في حذف عناصر أوامر البيع:', soItemsError)
      } else {
        console.log('✅ تم حذف عناصر أوامر البيع')
      }

      // حذف أوامر البيع
      const { error: salesOrdersError } = await supabase
        .from('sales_orders')
        .delete()
        .eq('company_id', testCompany.id)

      if (salesOrdersError) {
        console.error('❌ خطأ في حذف أوامر البيع:', salesOrdersError)
      } else {
        console.log('✅ تم حذف أوامر البيع')
      }
    }

    console.log('🎉 تم حذف جميع أوامر البيع والفواتير من شركة "تست" بنجاح!')

  } catch (error) {
    console.error('❌ خطأ:', error)
  }
}

deleteTestCompanyData()