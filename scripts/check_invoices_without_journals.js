// =====================================================
// التحقق من الفواتير بدون قيود محاسبية وإنشاء القيود الصحيحة
// =====================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hfvsbsizokxontflgdyn.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function getAccountMapping(companyId) {
  // جلب خريطة الحسابات للشركة
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type, sub_type')
    .eq('company_id', companyId)
    .eq('is_active', true);
  
  const mapping = {
    accounts_receivable: null,
    sales_revenue: null,
    vat_output: null
  };
  
  accounts?.forEach(acc => {
    if (acc.sub_type === 'accounts_receivable') {
      mapping.accounts_receivable = acc.id;
    } else if (acc.sub_type === 'sales_revenue' || (acc.account_type === 'income' && acc.account_code.startsWith('41'))) {
      mapping.sales_revenue = acc.id;
    } else if (acc.sub_type === 'vat_output' || (acc.account_name.includes('ضريبة') && acc.account_name.includes('مخرجات'))) {
      mapping.vat_output = acc.id;
    }
  });
  
  return mapping;
}

async function checkInvoicesWithoutJournals() {
  console.log('\n🔍 التحقق من الفواتير بدون قيود محاسبية\n');
  
  try {
    // جلب الفواتير بدون قيود
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, status, subtotal, tax_amount, total_amount, shipping, company_id, branch_id, cost_center_id')
      .in('status', ['sent', 'paid', 'partially_paid']);
    
    if (!invoices || invoices.length === 0) {
      console.log('⚠️ لا توجد فواتير');
      return;
    }
    
    const invoiceIds = invoices.map(i => i.id);
    
    // جلب القيود المحاسبية للفواتير
    const { data: journalEntries } = await supabase
      .from('journal_entries')
      .select('reference_id')
      .eq('reference_type', 'invoice')
      .in('reference_id', invoiceIds)
      .is('deleted_at', null);
    
    const invoicesWithJournals = new Set(journalEntries?.map(j => j.reference_id) || []);
    const invoicesWithoutJournals = invoices.filter(i => !invoicesWithJournals.has(i.id));
    
    console.log(`📊 إجمالي الفواتير: ${invoices.length}`);
    console.log(`   الفواتير مع قيود: ${invoicesWithJournals.size}`);
    console.log(`   الفواتير بدون قيود: ${invoicesWithoutJournals.length}\n`);
    
    if (invoicesWithoutJournals.length === 0) {
      console.log('✅ جميع الفواتير لديها قيود محاسبية');
      return;
    }
    
    // تجميع الفواتير حسب الشركة
    const invoicesByCompany = new Map();
    invoicesWithoutJournals.forEach(inv => {
      if (!invoicesByCompany.has(inv.company_id)) {
        invoicesByCompany.set(inv.company_id, []);
      }
      invoicesByCompany.get(inv.company_id).push(inv);
    });
    
    // جلب أسماء الشركات
    const companyIds = Array.from(invoicesByCompany.keys());
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name')
      .in('id', companyIds);
    
    const companiesMap = new Map(companies?.map(c => [c.id, c]) || []);
    
    console.log('='.repeat(80));
    console.log('الفواتير بدون قيود محاسبية:');
    console.log('='.repeat(80));
    
    invoicesByCompany.forEach((companyInvoices, companyId) => {
      const company = companiesMap.get(companyId);
      console.log(`\n📄 شركة: ${company?.name || 'غير معروف'} (${companyInvoices.length} فاتورة)`);
      
      companyInvoices.forEach((inv, idx) => {
        const netAmount = inv.subtotal || 0;
        const vatAmount = inv.tax_amount || 0;
        const shippingAmount = inv.shipping || 0;
        const totalAmount = inv.total_amount || 0;
        
        console.log(`\n   ${idx + 1}. ${inv.invoice_number}`);
        console.log(`      التاريخ: ${inv.invoice_date}`);
        console.log(`      الحالة: ${inv.status}`);
        console.log(`      الصافي: ${netAmount.toFixed(2)}`);
        console.log(`      الضريبة: ${vatAmount.toFixed(2)}`);
        console.log(`      الشحن: ${shippingAmount.toFixed(2)}`);
        console.log(`      الإجمالي: ${totalAmount.toFixed(2)}`);
        console.log(`      النمط المحاسبي المتوقع:`);
        console.log(`         Debit: العملاء (Accounts Receivable) = ${totalAmount.toFixed(2)}`);
        console.log(`         Credit: إيرادات المبيعات = ${netAmount.toFixed(2)}`);
        if (vatAmount > 0) {
          console.log(`         Credit: ضريبة القيمة المضافة = ${vatAmount.toFixed(2)}`);
        }
        if (shippingAmount > 0) {
          console.log(`         Credit: إيراد الشحن = ${shippingAmount.toFixed(2)}`);
        }
      });
    });
    
    return invoicesWithoutJournals;
    
  } catch (error) {
    console.error('❌ خطأ:', error);
    return [];
  }
}

async function createMissingInvoiceJournals() {
  console.log('\n🔧 إنشاء القيود المحاسبية للفواتير المفقودة\n');
  
  try {
    // جلب الفواتير بدون قيود
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, status, subtotal, tax_amount, total_amount, shipping, company_id, branch_id, cost_center_id')
      .in('status', ['sent', 'paid', 'partially_paid']);
    
    if (!invoices || invoices.length === 0) {
      console.log('⚠️ لا توجد فواتير');
      return;
    }
    
    const invoiceIds = invoices.map(i => i.id);
    
    const { data: journalEntries } = await supabase
      .from('journal_entries')
      .select('reference_id')
      .eq('reference_type', 'invoice')
      .in('reference_id', invoiceIds)
      .is('deleted_at', null);
    
    const invoicesWithJournals = new Set(journalEntries?.map(j => j.reference_id) || []);
    const invoicesWithoutJournals = invoices.filter(i => !invoicesWithJournals.has(i.id));
    
    if (invoicesWithoutJournals.length === 0) {
      console.log('✅ جميع الفواتير لديها قيود محاسبية');
      return;
    }
    
    console.log(`📊 عدد الفواتير التي تحتاج قيود: ${invoicesWithoutJournals.length}\n`);
    
    let createdCount = 0;
    let errorCount = 0;
    
    // تجميع حسب الشركة
    const invoicesByCompany = new Map();
    invoicesWithoutJournals.forEach(inv => {
      if (!invoicesByCompany.has(inv.company_id)) {
        invoicesByCompany.set(inv.company_id, []);
      }
      invoicesByCompany.get(inv.company_id).push(inv);
    });
    
    for (const [companyId, companyInvoices] of invoicesByCompany) {
      console.log(`\nمعالجة شركة: ${companyId} (${companyInvoices.length} فاتورة)`);
      
      // جلب خريطة الحسابات
      const mapping = await getAccountMapping(companyId);
      
      if (!mapping.accounts_receivable || !mapping.sales_revenue) {
        console.log(`   ⚠️ حسابات محاسبية مفقودة للشركة ${companyId}`);
        console.log(`      Accounts Receivable: ${mapping.accounts_receivable ? '✅' : '❌'}`);
        console.log(`      Sales Revenue: ${mapping.sales_revenue ? '✅' : '❌'}`);
        errorCount += companyInvoices.length;
        continue;
      }
      
      for (const invoice of companyInvoices) {
        try {
          const netAmount = invoice.subtotal || 0;
          const vatAmount = invoice.tax_amount || 0;
          const shippingAmount = invoice.shipping || 0;
          const totalAmount = invoice.total_amount || 0;
          
          // إنشاء القيد المحاسبي
          const { data: journalEntry, error: jeError } = await supabase
            .from('journal_entries')
            .insert({
              company_id: invoice.company_id,
              reference_type: 'invoice',
              reference_id: invoice.id,
              entry_date: invoice.invoice_date,
              description: `إيراد المبيعات - ${invoice.invoice_number}`,
              branch_id: invoice.branch_id,
              cost_center_id: invoice.cost_center_id,
              status: 'posted'
            })
            .select()
            .single();
          
          if (jeError) {
            console.error(`   ❌ خطأ في إنشاء القيد للفاتورة ${invoice.invoice_number}:`, jeError);
            errorCount++;
            continue;
          }
          
          // Debit: العملاء
          const { error: debitError } = await supabase
            .from('journal_entry_lines')
            .insert({
              journal_entry_id: journalEntry.id,
              account_id: mapping.accounts_receivable,
              debit_amount: totalAmount,
              credit_amount: 0,
              description: 'مستحق من العميل'
            });
          
          if (debitError) {
            console.error(`   ❌ خطأ في إنشاء سطر Debit:`, debitError);
            errorCount++;
            continue;
          }
          
          // Credit: إيرادات المبيعات
          if (netAmount > 0) {
            const { error: revenueError } = await supabase
              .from('journal_entry_lines')
              .insert({
                journal_entry_id: journalEntry.id,
                account_id: mapping.sales_revenue,
                debit_amount: 0,
                credit_amount: netAmount,
                description: 'إيراد المبيعات'
              });
            
            if (revenueError) {
              console.error(`   ❌ خطأ في إنشاء سطر Revenue:`, revenueError);
              errorCount++;
              continue;
            }
          }
          
          // Credit: ضريبة القيمة المضافة
          if (vatAmount > 0 && mapping.vat_output) {
            const { error: vatError } = await supabase
              .from('journal_entry_lines')
              .insert({
                journal_entry_id: journalEntry.id,
                account_id: mapping.vat_output,
                debit_amount: 0,
                credit_amount: vatAmount,
                description: 'ضريبة القيمة المضافة'
              });
            
            if (vatError) {
              console.error(`   ⚠️ خطأ في إنشاء سطر VAT (غير حرج):`, vatError);
            }
          }
          
          // Credit: إيراد الشحن
          if (shippingAmount > 0) {
            const { error: shippingError } = await supabase
              .from('journal_entry_lines')
              .insert({
                journal_entry_id: journalEntry.id,
                account_id: mapping.sales_revenue,
                debit_amount: 0,
                credit_amount: shippingAmount,
                description: 'إيراد الشحن'
              });
            
            if (shippingError) {
              console.error(`   ⚠️ خطأ في إنشاء سطر Shipping (غير حرج):`, shippingError);
            }
          }
          
          createdCount++;
          console.log(`   ✅ تم إنشاء قيد للفاتورة ${invoice.invoice_number}`);
          
        } catch (error) {
          console.error(`   ❌ خطأ في معالجة الفاتورة ${invoice.invoice_number}:`, error);
          errorCount++;
        }
      }
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('النتيجة النهائية:');
    console.log(`   ✅ تم إنشاء: ${createdCount} قيد`);
    console.log(`   ❌ فشل إنشاء: ${errorCount} قيد`);
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ خطأ عام:', error);
  }
}

async function main() {
  await checkInvoicesWithoutJournals();
  console.log('\n');
  await createMissingInvoiceJournals();
}

main();
