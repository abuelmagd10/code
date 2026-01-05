/**
 * 🧹 EXECUTE CLEANUP TEST COMPANY
 * =================================
 * تنفيذ تنظيف بيانات شركة "تست"
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// قراءة .env.local
try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (e) {}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ خطأ: SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY مطلوبان');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function executeCleanup() {
  console.log('🧹 CLEANUP TEST COMPANY DATA');
  console.log('=====================================\n');
  
  try {
    // 1. العثور على شركة "تست"
    console.log('🔍 البحث عن شركة "تست"...');
    const { data: companies, error: companyError } = await supabase
      .from('companies')
      .select('id, name')
      .or('name.eq.تست,name.ilike.%تست%')
      .limit(1);
    
    if (companyError) throw companyError;
    
    if (!companies || companies.length === 0) {
      console.error('❌ لم يتم العثور على شركة "تست"');
      process.exit(1);
    }
    
    const testCompanyId = companies[0].id;
    console.log(`✅ تم العثور على شركة "${companies[0].name}" - ID: ${testCompanyId}\n`);
    
    // 2. حذف سطور القيود المحاسبية
    console.log('🗑️  حذف سطور القيود المحاسبية...');
    const { data: journalEntries, error: jeError } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('company_id', testCompanyId)
      .in('reference_type', [
        'invoice', 'invoice_payment', 'invoice_reversal', 'credit_note',
        'bill', 'bill_payment', 'bill_reversal', 'vendor_credit',
        'sales_return', 'purchase_return'
      ]);
    
    if (jeError) throw jeError;
    
    const journalIds = (journalEntries || []).map(je => je.id);
    
    if (journalIds.length > 0) {
      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .delete()
        .in('journal_entry_id', journalIds);
      
      if (linesError) throw linesError;
      console.log(`   ✅ تم حذف سطور القيود`);
    } else {
      console.log(`   ℹ️  لا توجد سطور قيود للحذف`);
    }
    
    // 3. حذف القيود المحاسبية
    console.log('🗑️  حذف القيود المحاسبية...');
    if (journalIds.length > 0) {
      const { error: journalsError } = await supabase
        .from('journal_entries')
        .delete()
        .in('id', journalIds);
      
      if (journalsError) throw journalsError;
      console.log(`   ✅ تم حذف ${journalIds.length} قيد محاسبي`);
    } else {
      console.log(`   ℹ️  لا توجد قيود للحذف`);
    }
    
    // 4. حذف المدفوعات
    console.log('🗑️  حذف المدفوعات...');
    const { data: invoices, error: invError } = await supabase
      .from('invoices')
      .select('id')
      .eq('company_id', testCompanyId);
    
    const { data: bills, error: billError } = await supabase
      .from('bills')
      .select('id')
      .eq('company_id', testCompanyId);
    
    if (invError) throw invError;
    if (billError) throw billError;
    
    const invoiceIds = (invoices || []).map(i => i.id);
    const billIds = (bills || []).map(b => b.id);
    
    if (invoiceIds.length > 0 || billIds.length > 0) {
      const { error: paymentsError } = await supabase
        .from('payments')
        .delete()
        .eq('company_id', testCompanyId)
        .or(`invoice_id.in.(${invoiceIds.join(',')}),bill_id.in.(${billIds.join(',')})`);
      
      if (paymentsError && !paymentsError.message.includes('No rows')) {
        console.log(`   ⚠️  تحذير: ${paymentsError.message}`);
      } else {
        console.log(`   ✅ تم حذف المدفوعات`);
      }
    }
    
    // 5. حذف جميع حركات المخزون (شامل - جميع المستودعات والفروع)
    console.log('🗑️  حذف جميع حركات المخزون...');
    const { error: invTxError } = await supabase
      .from('inventory_transactions')
      .delete()
      .eq('company_id', testCompanyId);
    
    if (invTxError && !invTxError.message.includes('No rows')) {
      console.log(`   ⚠️  تحذير: ${invTxError.message}`);
    } else {
      console.log(`   ✅ تم حذف جميع حركات المخزون`);
    }
    
    // 6. حذف المرتجعات
    console.log('🗑️  حذف المرتجعات...');
    await supabase.from('sales_returns').delete().eq('company_id', testCompanyId);
    await supabase.from('purchase_returns').delete().eq('company_id', testCompanyId);
    await supabase.from('vendor_credits').delete().eq('company_id', testCompanyId);
    console.log(`   ✅ تم حذف المرتجعات`);
    
    // 7. حذف سطور الفواتير
    console.log('🗑️  حذف سطور الفواتير...');
    if (invoiceIds.length > 0) {
      await supabase.from('invoice_items').delete().in('invoice_id', invoiceIds);
    }
    if (billIds.length > 0) {
      await supabase.from('bill_items').delete().in('bill_id', billIds);
    }
    console.log(`   ✅ تم حذف سطور الفواتير`);
    
    // 8. حذف الفواتير
    console.log('🗑️  حذف الفواتير...');
    if (invoiceIds.length > 0) {
      await supabase.from('invoices').delete().in('id', invoiceIds);
      console.log(`   ✅ تم حذف ${invoiceIds.length} فاتورة بيع`);
    }
    if (billIds.length > 0) {
      await supabase.from('bills').delete().in('id', billIds);
      console.log(`   ✅ تم حذف ${billIds.length} فاتورة شراء`);
    }
    
    // 9. حذف أوامر البيع والشراء
    console.log('🗑️  حذف أوامر البيع والشراء...');
    const { data: salesOrders, error: soError } = await supabase
      .from('sales_orders')
      .select('id')
      .eq('company_id', testCompanyId);
    
    const { data: purchaseOrders, error: poError } = await supabase
      .from('purchase_orders')
      .select('id')
      .eq('company_id', testCompanyId);
    
    if (!soError && salesOrders && salesOrders.length > 0) {
      const soIds = salesOrders.map(so => so.id);
      await supabase.from('sales_order_items').delete().in('sales_order_id', soIds);
      await supabase.from('sales_orders').delete().in('id', soIds);
      console.log(`   ✅ تم حذف ${soIds.length} أمر بيع`);
    }
    
    if (!poError && purchaseOrders && purchaseOrders.length > 0) {
      const poIds = purchaseOrders.map(po => po.id);
      await supabase.from('purchase_order_items').delete().in('purchase_order_id', poIds);
      await supabase.from('purchase_orders').delete().in('id', poIds);
      console.log(`   ✅ تم حذف ${poIds.length} أمر شراء`);
    }
    
    // 10. حذف مخزون المنتجات في المستودعات (product_inventory)
    console.log('🗑️  حذف مخزون المنتجات في المستودعات...');
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id')
      .eq('company_id', testCompanyId);
    
    if (!productsError && products && products.length > 0) {
      const productIds = products.map(p => p.id);
      
      // حذف product_inventory
      const { error: piError } = await supabase
        .from('product_inventory')
        .delete()
        .in('product_id', productIds);
      
      if (piError && !piError.message.includes('does not exist')) {
        console.warn(`   ⚠️  تحذير في حذف product_inventory: ${piError.message}`);
      } else {
        console.log(`   ✅ تم حذف مخزون المنتجات في المستودعات`);
      }
    }
    
    // 11. حذف warehouse_stock
    console.log('🗑️  حذف مخزون المستودعات (warehouse_stock)...');
    const { error: wsError } = await supabase
      .from('warehouse_stock')
      .delete()
      .eq('company_id', testCompanyId);
    
    if (wsError && !wsError.message.includes('does not exist')) {
      console.warn(`   ⚠️  تحذير في حذف warehouse_stock: ${wsError.message}`);
    } else {
      console.log(`   ✅ تم حذف مخزون المستودعات`);
    }
    
    // 12. حذف inventory_write_offs
    console.log('🗑️  حذف إهلاكات المخزون...');
    const { data: writeOffs, error: woError } = await supabase
      .from('inventory_write_offs')
      .select('id')
      .eq('company_id', testCompanyId);
    
    if (!woError && writeOffs && writeOffs.length > 0) {
      const woIds = writeOffs.map(wo => wo.id);
      
      // حذف inventory_write_off_items
      const { error: woiError } = await supabase
        .from('inventory_write_off_items')
        .delete()
        .in('write_off_id', woIds);
      
      if (woiError && !woiError.message.includes('does not exist')) {
        console.warn(`   ⚠️  تحذير في حذف inventory_write_off_items: ${woiError.message}`);
      }
      
      // حذف inventory_write_offs
      await supabase
        .from('inventory_write_offs')
        .delete()
        .in('id', woIds);
      
      console.log(`   ✅ تم حذف ${woIds.length} إهلاك مخزون`);
    }
    
    // 13. إعادة تعيين المخزون إلى صفر لجميع المنتجات
    console.log('🔄 إعادة تعيين المخزون إلى صفر...');
    if (!productsError && products && products.length > 0) {
      const { error: updateError } = await supabase
        .from('products')
        .update({ quantity_on_hand: 0 })
        .eq('company_id', testCompanyId);
      
      if (updateError) {
        console.warn(`   ⚠️  تحذير في تحديث المخزون: ${updateError.message}`);
      } else {
        console.log(`   ✅ تم إعادة تعيين المخزون إلى صفر لـ ${products.length} منتج`);
      }
    }
    
    // 14. التحقق من النتيجة
    console.log('\n🔍 التحقق من النتيجة...\n');
    
    const { count: invoiceCount } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', testCompanyId);
    
    const { count: billCount } = await supabase
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', testCompanyId);
    
    const { count: journalCount } = await supabase
      .from('journal_entries')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', testCompanyId)
      .in('reference_type', [
        'invoice', 'invoice_payment', 'invoice_reversal', 'credit_note',
        'bill', 'bill_payment', 'bill_reversal', 'vendor_credit',
        'sales_return', 'purchase_return'
      ]);
    
    const { count: inventoryCount } = await supabase
      .from('inventory_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', testCompanyId);
    
    const { count: productStockCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', testCompanyId)
      .neq('quantity_on_hand', 0);
    
    console.log('📊 الملخص النهائي:');
    console.log(`   Invoices: ${invoiceCount || 0}`);
    console.log(`   Bills: ${billCount || 0}`);
    console.log(`   Journal Entries (Related): ${journalCount || 0}`);
    console.log(`   Inventory Transactions: ${inventoryCount || 0}`);
    console.log(`   Products with Stock ≠ 0: ${productStockCount || 0}`);
    
    if ((invoiceCount || 0) === 0 && (billCount || 0) === 0 && (journalCount || 0) === 0 && 
        (inventoryCount || 0) === 0 && (productStockCount || 0) === 0) {
      console.log('\n✅ ✅ ✅ تم تنظيف بيانات شركة "تست" بنجاح! ✅ ✅ ✅');
      console.log('🎉 شركة "تست" جاهزة للاختبار اليدوي!');
      process.exit(0);
    } else {
      console.log('\n⚠️  لا يزال يوجد بعض البيانات المتبقية');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ خطأ أثناء التنظيف:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  executeCleanup();
}

module.exports = { executeCleanup };

