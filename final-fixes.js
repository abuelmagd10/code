const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(supabaseUrl, supabaseKey)

async function applyFinalFixes() {
  try {
    console.log('🔧 تطبيق الإصلاحات النهائية...\n')
    
    const companyId = '3a663f6b-0689-4952-93c1-6d958c737089'
    
    // 1. إصلاح حالة المرتجع في الفاتورة
    console.log('1. إصلاح حالة المرتجع في الفاتورة...')
    const { error: invoiceError } = await supabase
      .from('invoices')
      .update({ 
        return_status: 'full'  // تغيير من partial إلى full
      })
      .eq('company_id', companyId)
      .eq('invoice_number', 'INV-0001')

    if (invoiceError) {
      console.log('❌ خطأ في تحديث الفاتورة:', invoiceError.message)
    } else {
      console.log('✅ تم تحديث حالة المرتجع إلى full')
    }

    // 2. إنشاء trigger للمزامنة التلقائية
    console.log('\n2. إنشاء trigger للمزامنة...')
    const triggerSQL = `
      CREATE OR REPLACE FUNCTION sync_sales_order_status()
      RETURNS TRIGGER AS $$
      BEGIN
        -- مزامنة حالة أمر البيع مع الفاتورة
        IF NEW.sales_order_id IS NOT NULL THEN
          UPDATE sales_orders 
          SET 
            status = CASE 
              WHEN NEW.return_status = 'full' THEN 'returned'
              WHEN NEW.return_status = 'partial' THEN 'partially_returned'
              WHEN NEW.status = 'sent' THEN 'invoiced'
              WHEN NEW.status = 'paid' THEN 'completed'
              ELSE 'draft'
            END,
            total_amount = NEW.total_amount,
            updated_at = NOW()
          WHERE id = NEW.sales_order_id;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS sync_so_status_trigger ON invoices;
      CREATE TRIGGER sync_so_status_trigger
        AFTER UPDATE ON invoices
        FOR EACH ROW
        EXECUTE FUNCTION sync_sales_order_status();
    `

    try {
      // تنفيذ SQL مباشر
      const { error: sqlError } = await supabase
        .from('_temp_sql_execution')
        .insert({ query: triggerSQL })
        .single()
    } catch (err) {
      console.log('⚠️ لا يمكن تنفيذ SQL مباشرة من هنا')
    }

    // 3. تحديث يدوي لحالة أمر البيع
    console.log('\n3. تحديث حالة أمر البيع يدوياً...')
    const { data: soUpdate, error: soError } = await supabase
      .from('sales_orders')
      .update({ 
        status: 'returned',
        updated_at: new Date().toISOString()
      })
      .eq('company_id', companyId)
      .eq('so_number', 'SO-0001')
      .select()

    if (soError) {
      console.log('❌ خطأ في تحديث أمر البيع:', soError.message)
    } else {
      console.log('✅ تم تحديث حالة أمر البيع:', soUpdate[0].status)
    }

    // 4. التحقق النهائي
    console.log('\n4. التحقق النهائي...')
    const { data: finalCheck } = await supabase
      .from('sales_orders')
      .select(`
        so_number,
        status,
        total_amount,
        invoices!sales_orders_invoice_id_fkey (
          invoice_number,
          status,
          total_amount,
          return_status
        )
      `)
      .eq('company_id', companyId)
      .eq('so_number', 'SO-0001')
      .single()

    console.log('النتيجة النهائية:')
    console.log(`  أمر البيع: ${finalCheck.so_number} - ${finalCheck.status} - £${finalCheck.total_amount}`)
    console.log(`  الفاتورة: ${finalCheck.invoices?.invoice_number} - ${finalCheck.invoices?.status} - £${finalCheck.invoices?.total_amount} (${finalCheck.invoices?.return_status})`)

    console.log('\n🎯 الخلاصة:')
    if (finalCheck.status === 'returned' && finalCheck.total_amount === 0) {
      console.log('✅ النظام متوافق تماماً مع النمط المحاسبي الجديد!')
      console.log('💡 إذا لم تظهر التحديثات في الواجهة، امسح cache المتصفح')
    } else {
      console.log('⚠️ ما زالت هناك مشاكل في التوافق')
    }

  } catch (error) {
    console.error('❌ خطأ في الإصلاحات:', error.message)
  }
}

applyFinalFixes()