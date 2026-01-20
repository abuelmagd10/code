/**
 * 🗑️ DELETE ALL INVOICES, ORDERS, PAYMENTS & JOURNALS - TEST COMPANY
 * ===================================================================
 * حذف جميع الفواتير والأوامر والمدفوعات والقيود لشركة الاختبار
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

async function deleteAllInvoicesOrdersPaymentsJournals() {
  console.log('🗑️  حذف جميع الفواتير والأوامر والمدفوعات والقيود');
  console.log('==================================================\n');
  
  try {
    // 1. العثور على شركة الاختبار
    console.log('🔍 البحث عن شركة الاختبار...');
    const { data: companies, error: companyError } = await supabase
      .from('companies')
      .select('id, name')
      .or('name.ilike.%تست%,name.ilike.%test%')
      .limit(1);
    
    if (companyError) throw companyError;
    
    if (!companies || companies.length === 0) {
      console.error('❌ لم يتم العثور على شركة الاختبار');
      process.exit(1);
    }
    
    const testCompanyId = companies[0].id;
    console.log(`✅ تم العثور على شركة "${companies[0].name}" - ID: ${testCompanyId}\n`);
    
    // 2. جمع معرفات الفواتير والأوامر
    console.log('📊 جمع البيانات...');
    
    const { data: invoices, error: invError } = await supabase
      .from('invoices')
      .select('id')
      .eq('company_id', testCompanyId);
    
    if (invError) throw invError;
    
    const { data: bills, error: billError } = await supabase
      .from('bills')
      .select('id')
      .eq('company_id', testCompanyId);
    
    if (billError) throw billError;
    
    const { data: salesOrders, error: soError } = await supabase
      .from('sales_orders')
      .select('id')
      .eq('company_id', testCompanyId);
    
    if (soError) throw soError;
    
    const { data: purchaseOrders, error: poError } = await supabase
      .from('purchase_orders')
      .select('id')
      .eq('company_id', testCompanyId);
    
    if (poError) throw poError;
    
    const invoiceIds = (invoices || []).map(i => i.id);
    const billIds = (bills || []).map(b => b.id);
    const salesOrderIds = (salesOrders || []).map(so => so.id);
    const purchaseOrderIds = (purchaseOrders || []).map(po => po.id);
    
    console.log(`   - الفواتير: ${invoiceIds.length}`);
    console.log(`   - فواتير المشتريات: ${billIds.length}`);
    console.log(`   - أوامر البيع: ${salesOrderIds.length}`);
    console.log(`   - أوامر الشراء: ${purchaseOrderIds.length}\n`);
    
    // 3. جمع معرفات القيود المحاسبية المرتبطة
    console.log('🔍 البحث عن القيود المحاسبية المرتبطة...');
    
    const referenceTypes = [
      'invoice', 'invoice_payment', 'invoice_reversal', 'credit_note',
      'bill', 'bill_payment', 'bill_reversal', 'vendor_credit',
      'sales_order', 'sales_order_payment',
      'purchase_order', 'purchase_order_payment'
    ];
    
    const allReferenceIds = [...invoiceIds, ...billIds, ...salesOrderIds, ...purchaseOrderIds];
    
    let journalEntries = [];
    let jeError = null;
    
    if (allReferenceIds.length > 0) {
      // البحث عن القيود المرتبطة بالفواتير والأوامر
      const { data: journals, error: err } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('company_id', testCompanyId)
        .in('reference_type', referenceTypes)
        .in('reference_id', allReferenceIds);
      
      if (err && !err.message.includes('No rows')) {
        jeError = err;
      } else if (journals) {
        journalEntries = journals;
      }
    }
    
    if (jeError) throw jeError;
    
    const journalEntryIds = journalEntries.map(je => je.id);
    console.log(`   - القيود المحاسبية المرتبطة: ${journalEntryIds.length}\n`);
    
    // 4. جمع معرفات المدفوعات المرتبطة
    console.log('🔍 البحث عن المدفوعات المرتبطة...');
    
    let payments = [];
    let payError = null;
    
    // البحث عن المدفوعات المرتبطة بالفواتير
    if (invoiceIds.length > 0) {
      const { data: invPayments, error: err1 } = await supabase
        .from('payments')
        .select('id')
        .eq('company_id', testCompanyId)
        .in('invoice_id', invoiceIds);
      
      if (err1 && !err1.message.includes('No rows')) {
        payError = err1;
      } else if (invPayments) {
        payments = [...payments, ...invPayments];
      }
    }
    
    // البحث عن المدفوعات المرتبطة بفواتير المشتريات
    if (billIds.length > 0 && !payError) {
      const { data: billPayments, error: err2 } = await supabase
        .from('payments')
        .select('id')
        .eq('company_id', testCompanyId)
        .in('bill_id', billIds);
      
      if (err2 && !err2.message.includes('No rows')) {
        payError = err2;
      } else if (billPayments) {
        payments = [...payments, ...billPayments];
      }
    }
    
    // البحث عن المدفوعات المرتبطة بأوامر الشراء
    if (purchaseOrderIds.length > 0 && !payError) {
      const { data: poPayments, error: err3 } = await supabase
        .from('payments')
        .select('id')
        .eq('company_id', testCompanyId)
        .in('purchase_order_id', purchaseOrderIds);
      
      if (err3 && !err3.message.includes('No rows')) {
        payError = err3;
      } else if (poPayments) {
        payments = [...payments, ...poPayments];
      }
    }
    
    // إزالة التكرارات
    const uniquePaymentIds = [...new Set(payments.map(p => p.id))];
    
    if (payError) throw payError;
    
    const paymentIds = uniquePaymentIds;
    console.log(`   - المدفوعات المرتبطة: ${paymentIds.length}\n`);
    
    // =============================================
    // بدء عملية الحذف
    // =============================================
    
    console.log('🗑️  بدء عملية الحذف...\n');
    
    // 5. تعطيل Trigger مؤقتاً للسماح بحذف القيود المنشورة
    console.log('⏸️  تعطيل Trigger للحماية...');
    let triggerDisabled = false;
    
    try {
      // محاولة تعطيل الـ trigger عبر RPC
      const { error: rpcError } = await supabase.rpc('exec_sql', {
        sql_query: 'ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_posted_journal_modification;'
      });
      
      if (rpcError) {
        // إذا لم تكن RPC متاحة، نستخدم طريقة بديلة
        console.log('   ⚠️  تعذر تعطيل Trigger عبر RPC');
        console.log('   💡 يرجى تنفيذ الأمر التالي في Supabase SQL Editor:');
        console.log('   ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_posted_journal_modification;');
        console.log('   ⚠️  سيتم محاولة الحذف مباشرة (قد يفشل إذا كان القيد محمياً)\n');
      } else {
        triggerDisabled = true;
        console.log('   ✅ تم تعطيل Trigger\n');
      }
    } catch (err) {
      console.log(`   ⚠️  تعذر تعطيل Trigger: ${err.message}`);
      console.log('   💡 يرجى تنفيذ الأمر التالي في Supabase SQL Editor:');
      console.log('   ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_posted_journal_modification;');
      console.log('   ⚠️  سيتم محاولة الحذف مباشرة (قد يفشل إذا كان القيد محمياً)\n');
    }
    
    // 6. تحديث حالة القيود إلى draft أولاً (إذا كانت posted)
    if (journalEntryIds.length > 0) {
      console.log('🔄 تحديث حالة القيود إلى draft...');
      const { error: updateError } = await supabase
        .from('journal_entries')
        .update({ status: 'draft' })
        .in('id', journalEntryIds)
        .eq('status', 'posted');
      
      if (updateError && !updateError.message.includes('No rows')) {
        console.log(`   ⚠️  تحذير: ${updateError.message}`);
      } else {
        console.log(`   ✅ تم تحديث حالة القيود إلى draft\n`);
      }
    }
    
    // 7. حذف سطور القيود المحاسبية
    if (journalEntryIds.length > 0) {
      console.log('🗑️  حذف سطور القيود المحاسبية...');
      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .delete()
        .in('journal_entry_id', journalEntryIds);
      
      if (linesError) throw linesError;
      console.log(`   ✅ تم حذف سطور القيود\n`);
    }
    
    // 8. حذف القيود المحاسبية
    if (journalEntryIds.length > 0) {
      console.log('🗑️  حذف القيود المحاسبية...');
      const { error: journalsError } = await supabase
        .from('journal_entries')
        .delete()
        .in('id', journalEntryIds);
      
      if (journalsError) {
        console.log(`   ⚠️  خطأ في حذف القيود: ${journalsError.message}`);
        console.log('   💡 يرجى التأكد من تعطيل الـ trigger في Supabase SQL Editor');
        throw journalsError;
      }
      console.log(`   ✅ تم حذف ${journalEntryIds.length} قيد محاسبي\n`);
    }
    
    // 8.5. إعادة تفعيل Trigger
    if (triggerDisabled) {
      console.log('▶️  إعادة تفعيل Trigger...');
      try {
        await supabase.rpc('exec_sql', {
          sql_query: 'ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;'
        });
        console.log('   ✅ تم إعادة تفعيل Trigger\n');
      } catch (err) {
        console.log(`   ⚠️  تعذر إعادة تفعيل Trigger: ${err.message}`);
        console.log('   💡 يرجى تنفيذ الأمر التالي في Supabase SQL Editor:');
        console.log('   ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;\n');
      }
    }
    
    // 7. حذف المدفوعات
    if (paymentIds.length > 0) {
      console.log('🗑️  حذف المدفوعات...');
      const { error: paymentsError } = await supabase
        .from('payments')
        .delete()
        .in('id', paymentIds);
      
      if (paymentsError) throw paymentsError;
      console.log(`   ✅ تم حذف ${paymentIds.length} دفعة\n`);
    }
    
    // 8. حذف عناصر الفواتير
    if (invoiceIds.length > 0) {
      console.log('🗑️  حذف عناصر فواتير البيع...');
      const { error: itemsError } = await supabase
        .from('invoice_items')
        .delete()
        .in('invoice_id', invoiceIds);
      
      if (itemsError) throw itemsError;
      console.log(`   ✅ تم حذف عناصر فواتير البيع\n`);
    }
    
    // 9. حذف الفواتير
    if (invoiceIds.length > 0) {
      console.log('🗑️  حذف فواتير البيع...');
      const { error: invDeleteError } = await supabase
        .from('invoices')
        .delete()
        .in('id', invoiceIds);
      
      if (invDeleteError) throw invDeleteError;
      console.log(`   ✅ تم حذف ${invoiceIds.length} فاتورة بيع\n`);
    }
    
    // 10. حذف عناصر فواتير المشتريات
    if (billIds.length > 0) {
      console.log('🗑️  حذف عناصر فواتير المشتريات...');
      const { error: billItemsError } = await supabase
        .from('bill_items')
        .delete()
        .in('bill_id', billIds);
      
      if (billItemsError) throw billItemsError;
      console.log(`   ✅ تم حذف عناصر فواتير المشتريات\n`);
    }
    
    // 13. حذف فواتير المشتريات
    if (billIds.length > 0) {
      console.log('🗑️  حذف فواتير المشتريات...');
      const { error: billDeleteError } = await supabase
        .from('bills')
        .delete()
        .in('id', billIds);
      
      if (billDeleteError) throw billDeleteError;
      console.log(`   ✅ تم حذف ${billIds.length} فاتورة شراء\n`);
    }
    
    // 12. حذف عناصر أوامر البيع
    if (salesOrderIds.length > 0) {
      console.log('🗑️  حذف عناصر أوامر البيع...');
      const { error: soItemsError } = await supabase
        .from('sales_order_items')
        .delete()
        .in('sales_order_id', salesOrderIds);
      
      if (soItemsError) throw soItemsError;
      console.log(`   ✅ تم حذف عناصر أوامر البيع\n`);
    }
    
    // 15. حذف أوامر البيع
    if (salesOrderIds.length > 0) {
      console.log('🗑️  حذف أوامر البيع...');
      const { error: soDeleteError } = await supabase
        .from('sales_orders')
        .delete()
        .in('id', salesOrderIds);
      
      if (soDeleteError) throw soDeleteError;
      console.log(`   ✅ تم حذف ${salesOrderIds.length} أمر بيع\n`);
    }
    
    // 16. حذف عناصر أوامر الشراء
    if (purchaseOrderIds.length > 0) {
      console.log('🗑️  حذف عناصر أوامر الشراء...');
      const { error: poItemsError } = await supabase
        .from('purchase_order_items')
        .delete()
        .in('purchase_order_id', purchaseOrderIds);
      
      if (poItemsError) throw poItemsError;
      console.log(`   ✅ تم حذف عناصر أوامر الشراء\n`);
    }
    
    // 17. حذف أوامر الشراء
    if (purchaseOrderIds.length > 0) {
      console.log('🗑️  حذف أوامر الشراء...');
      const { error: poDeleteError } = await supabase
        .from('purchase_orders')
        .delete()
        .in('id', purchaseOrderIds);
      
      if (poDeleteError) throw poDeleteError;
      console.log(`   ✅ تم حذف ${purchaseOrderIds.length} أمر شراء\n`);
    }
    
    // =============================================
    // التحقق النهائي
    // =============================================
    
    console.log('🔍 التحقق النهائي...\n');
    
    const { count: remainingInvoices } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', testCompanyId);
    
    const { count: remainingBills } = await supabase
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', testCompanyId);
    
    const { count: remainingSalesOrders } = await supabase
      .from('sales_orders')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', testCompanyId);
    
    const { count: remainingPurchaseOrders } = await supabase
      .from('purchase_orders')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', testCompanyId);
    
    const { count: remainingPayments } = await supabase
      .from('payments')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', testCompanyId)
      .or('invoice_id.not.is.null,bill_id.not.is.null,purchase_order_id.not.is.null');
    
    const { count: remainingJournals } = await supabase
      .from('journal_entries')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', testCompanyId)
      .in('reference_type', referenceTypes);
    
    console.log('📊 الملخص النهائي:');
    console.log(`   - الفواتير المتبقية: ${remainingInvoices || 0}`);
    console.log(`   - فواتير المشتريات المتبقية: ${remainingBills || 0}`);
    console.log(`   - أوامر البيع المتبقية: ${remainingSalesOrders || 0}`);
    console.log(`   - أوامر الشراء المتبقية: ${remainingPurchaseOrders || 0}`);
    console.log(`   - المدفوعات المرتبطة المتبقية: ${remainingPayments || 0}`);
    console.log(`   - القيود المحاسبية المرتبطة المتبقية: ${remainingJournals || 0}\n`);
    
    if ((remainingInvoices || 0) === 0 && 
        (remainingBills || 0) === 0 && 
        (remainingSalesOrders || 0) === 0 && 
        (remainingPurchaseOrders || 0) === 0 && 
        (remainingPayments || 0) === 0 && 
        (remainingJournals || 0) === 0) {
      console.log('✅ ✅ ✅ تم حذف جميع الفواتير والأوامر والمدفوعات والقيود بنجاح! ✅ ✅ ✅');
      process.exit(0);
    } else {
      console.log('⚠️  لا يزال يوجد بعض البيانات المتبقية');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ خطأ أثناء الحذف:', error.message);
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  deleteAllInvoicesOrdersPaymentsJournals();
}

module.exports = { deleteAllInvoicesOrdersPaymentsJournals };
