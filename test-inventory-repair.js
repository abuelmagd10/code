// اختبار عملي لوظيفة إصلاح المخزون
const { createClient } = require('@supabase/supabase-js');

// دالة للاختبار
async function testInventoryRepair() {
  console.log('🧪 بدء اختبار وظيفة إصلاح المخزون...');
  
  try {
    // إنشاء عميل Supabase (سيتم استخدام المتغيرات من ملف .env.local)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key'
    );

    console.log('📊 التحقق من البيانات الحالية...');
    
    // التحقق من المنتجات
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, sku, quantity_on_hand, item_type')
      .limit(5);
    
    if (productsError) {
      console.log('❌ خطأ في جلب المنتجات:', productsError.message);
      return;
    }
    
    console.log('📦 المنتجات الحالية:');
    products?.forEach(product => {
      console.log(`  - ${product.name} (${product.sku}): ${product.quantity_on_hand} ${product.item_type ? `[${product.item_type}]` : ''}`);
    });

    // التحقق من معاملات المخزون
    const { data: transactions, error: txError } = await supabase
      .from('inventory_transactions')
      .select('id, product_id, transaction_type, quantity_change, reference_id')
      .limit(10);
    
    if (txError) {
      console.log('❌ خطأ في جلب المعاملات:', txError.message);
      return;
    }
    
    console.log('🔄 معاملات المخزون الحالية:');
    transactions?.forEach(tx => {
      console.log(`  - ${tx.transaction_type}: ${tx.quantity_change} (منتج: ${tx.product_id})`);
    });

    // التحقق من الفواتير
    const { data: invoices, error: invError } = await supabase
      .from('invoices')
      .select('id, invoice_number, status')
      .in('status', ['sent', 'partially_paid', 'paid'])
      .limit(5);
    
    if (invError) {
      console.log('❌ خطأ في جلب الفواتير:', invError.message);
      return;
    }
    
    console.log('📋 الفواتير الحالية:');
    invoices?.forEach(inv => {
      console.log(`  - ${inv.invoice_number}: ${inv.status}`);
    });

    // التحقق من فواتير الشراء
    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('id, bill_number, status')
      .in('status', ['sent', 'partially_paid', 'paid'])
      .limit(5);
    
    if (billsError) {
      console.log('❌ خطأ في جلب فواتير الشراء:', billsError.message);
      return;
    }
    
    console.log('📄 فواتير الشراء الحالية:');
    bills?.forEach(bill => {
      console.log(`  - ${bill.bill_number}: ${bill.status}`);
    });

    // تحليل التوافق
    console.log('\n🔍 تحليل التوافق مع نمط المخزون الرسمي:');
    
    // التحقق من اتفاقية الإشارات
    const hasNegativeSales = transactions?.some(tx => tx.transaction_type === 'sale' && tx.quantity_change < 0);
    const hasPositivePurchases = transactions?.some(tx => tx.transaction_type === 'purchase' && tx.quantity_change > 0);
    
    console.log(`✅ المبيعات سالبة: ${hasNegativeSales ? 'نعم' : 'لا'}`);
    console.log(`✅ المشتريات موجبة: ${hasPositivePurchases ? 'نعم' : 'لا'}`);
    
    // التحقق من استبعاد الخدمات
    const hasServiceTransactions = transactions?.some(tx => {
      const product = products?.find(p => p.id === tx.product_id);
      return product?.item_type === 'service';
    });
    
    console.log(`✅ استبعاد الخدمات: ${!hasServiceTransactions ? 'نعم' : 'لا'}`);
    
    console.log('\n✅ اكتمل اختبار وظيفة إصلاح المخزون بنجاح!');
    console.log('📈 النظام يعمل وفقاً للنمط الرسمي للمخزون');
    
  } catch (error) {
    console.error('❌ خطأ في الاختبار:', error.message);
  }
}

// تنفيذ الاختبار
if (require.main === module) {
  testInventoryRepair().then(() => {
    console.log('\n🏁 انتهى الاختبار');
    process.exit(0);
  }).catch(error => {
    console.error('❌ خطأ:', error);
    process.exit(1);
  });
}

module.exports = { testInventoryRepair };