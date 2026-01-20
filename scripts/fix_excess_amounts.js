// =====================================================
// معالجة المبالغ الزائدة مباشرة
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

async function createPrepaidAccount(companyId, companyName) {
  console.log(`\n📝 إنشاء حساب "مدفوعات مسبقة للموردين" للشركة: ${companyName}`);
  
  try {
    // البحث عن كود حساب متاح
    const { data: existingAccounts } = await supabase
      .from('chart_of_accounts')
      .select('account_code')
      .eq('company_id', companyId)
      .gte('account_code', '1200')
      .lt('account_code', '1300')
      .order('account_code', { ascending: true });
    
    let accountCode = '1200';
    if (existingAccounts && existingAccounts.length > 0) {
      const codes = existingAccounts.map(a => parseInt(a.account_code)).filter(c => !isNaN(c));
      for (let i = 1200; i < 1300; i++) {
        if (!codes.includes(i)) {
          accountCode = String(i).padStart(4, '0');
          break;
        }
      }
    }
    
    // التحقق من وجود الحساب
    const { data: existing } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('company_id', companyId)
      .or(`account_name.ilike.%مدفوعات مسبقة%,sub_type.eq.prepaid_expenses`)
      .limit(1);
    
    if (existing && existing.length > 0) {
      console.log(`   ✅ الحساب موجود بالفعل: ${existing[0].account_code} - ${existing[0].account_name}`);
      return existing[0].id;
    }
    
    // إنشاء الحساب
    const { data: newAccount, error: createError } = await supabase
      .from('chart_of_accounts')
      .insert({
        company_id: companyId,
        account_code: accountCode,
        account_name: 'مدفوعات مسبقة للموردين',
        account_type: 'asset',
        normal_balance: 'debit', // الأصول طبيعتها مدينة
        sub_type: 'prepaid_expenses',
        opening_balance: 0,
        is_active: true
      })
      .select()
      .single();
    
    if (createError) {
      console.error(`   ❌ خطأ في إنشاء الحساب:`, createError);
      return null;
    }
    
    console.log(`   ✅ تم إنشاء الحساب: ${accountCode} - ${newAccount.account_name} (ID: ${newAccount.id})`);
    return newAccount.id;
    
  } catch (error) {
    console.error(`   ❌ خطأ:`, error);
    return null;
  }
}

async function transferExcessToPrepaid() {
  console.log('\n💰 نقل المبالغ الزائدة إلى حساب "مدفوعات مسبقة للموردين"\n');
  
  try {
    // 1. جلب جميع الشركات
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name');
    
    if (!companies || companies.length === 0) {
      console.log('⚠️ لا توجد شركات');
      return;
    }
    
    let totalTransferred = 0;
    
    for (const company of companies) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`معالجة شركة: ${company.name}`);
      console.log('='.repeat(80));
      
      // حساب المدفوعات الزائدة
      const { data: bills } = await supabase
        .from('bills')
        .select('id, bill_number, total_amount, returned_amount, company_id')
        .eq('company_id', company.id);
      
      const billIds = bills?.map(b => b.id) || [];
      
      const { data: payments } = await supabase
        .from('payments')
        .select('id, bill_id, amount')
        .in('bill_id', billIds);
      
      const paymentsByBill = new Map();
      payments?.forEach(p => {
        if (!paymentsByBill.has(p.bill_id)) {
          paymentsByBill.set(p.bill_id, []);
        }
        paymentsByBill.get(p.bill_id).push(p);
      });
      
      let companyOverpayment = 0;
      const overpayments = [];
      
      bills?.forEach(bill => {
        const billPayments = paymentsByBill.get(bill.id) || [];
        const totalPaid = billPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const netAmount = bill.total_amount || 0;
        
        if (totalPaid > netAmount) {
          const excess = totalPaid - netAmount;
          companyOverpayment += excess;
          overpayments.push({
            billNumber: bill.bill_number,
            excess: excess
          });
        }
      });
      
      // حساب إشعارات الدائن الزائدة
      const { data: vendorCredits } = await supabase
        .from('vendor_credits')
        .select('supplier_id, total_amount')
        .eq('company_id', company.id)
        .in('status', ['approved', 'applied', 'open', 'partially_applied']);
      
      const { data: supplierBills } = await supabase
        .from('bills')
        .select('supplier_id, total_amount')
        .eq('company_id', company.id)
        .in('status', ['sent', 'received', 'paid', 'partially_paid']);
      
      const creditsBySupplier = new Map();
      vendorCredits?.forEach(vc => {
        const key = vc.supplier_id;
        if (!creditsBySupplier.has(key)) {
          creditsBySupplier.set(key, 0);
        }
        creditsBySupplier.set(key, creditsBySupplier.get(key) + (vc.total_amount || 0));
      });
      
      const billsBySupplier = new Map();
      supplierBills?.forEach(b => {
        const key = b.supplier_id;
        if (!billsBySupplier.has(key)) {
          billsBySupplier.set(key, 0);
        }
        billsBySupplier.set(key, billsBySupplier.get(key) + (b.total_amount || 0));
      });
      
      let companyVendorCreditsExcess = 0;
      creditsBySupplier.forEach((totalCredits, supplierId) => {
        const totalBills = billsBySupplier.get(supplierId) || 0;
        if (totalCredits > totalBills) {
          companyVendorCreditsExcess += (totalCredits - totalBills);
        }
      });
      
      const totalExcess = companyOverpayment + companyVendorCreditsExcess;
      
      if (totalExcess <= 0) {
        console.log(`   ℹ️ لا توجد مبالغ زائدة`);
        continue;
      }
      
      console.log(`\n   المدفوعات الزائدة: ${companyOverpayment.toFixed(2)}`);
      if (overpayments.length > 0) {
        overpayments.forEach(op => {
          console.log(`      - ${op.billNumber}: ${op.excess.toFixed(2)}`);
        });
      }
      
      console.log(`   إشعارات الدائن الزائدة: ${companyVendorCreditsExcess.toFixed(2)}`);
      console.log(`   الإجمالي: ${totalExcess.toFixed(2)}`);
      
      // إنشاء حساب "مدفوعات مسبقة"
      const prepaidAccountId = await createPrepaidAccount(company.id, company.name);
      
      if (!prepaidAccountId) {
        console.log(`   ⚠️ لم يتم إنشاء الحساب، تخطي هذه الشركة`);
        continue;
      }
      
      // جلب حساب AP
      const { data: apAccount } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('company_id', company.id)
        .eq('sub_type', 'accounts_payable')
        .eq('is_active', true)
        .limit(1)
        .single();
      
      if (!apAccount) {
        console.log(`   ⚠️ لم يتم العثور على حساب AP`);
        continue;
      }
      
      // إنشاء قيد محاسبي
      const { data: journalEntry, error: jeError } = await supabase
        .from('journal_entries')
        .insert({
          company_id: company.id,
          reference_type: 'adjustment',
          reference_id: require('crypto').randomUUID(),
          entry_date: new Date().toISOString().split('T')[0],
          description: 'نقل المبالغ الزائدة من AP إلى حساب مدفوعات مسبقة للموردين',
          status: 'posted'
        })
        .select()
        .single();
      
      if (jeError) {
        console.error(`   ❌ خطأ في إنشاء القيد المحاسبي:`, jeError);
        continue;
      }
      
      // Debit: مدفوعات مسبقة
      const { error: debitError } = await supabase
        .from('journal_entry_lines')
        .insert({
          journal_entry_id: journalEntry.id,
          account_id: prepaidAccountId,
          debit_amount: totalExcess,
          credit_amount: 0,
          description: 'نقل المبالغ الزائدة من AP'
        });
      
      if (debitError) {
        console.error(`   ❌ خطأ في إنشاء سطر Debit:`, debitError);
        continue;
      }
      
      // Credit: AP
      const { error: creditError } = await supabase
        .from('journal_entry_lines')
        .insert({
          journal_entry_id: journalEntry.id,
          account_id: apAccount.id,
          debit_amount: 0,
          credit_amount: totalExcess,
          description: 'نقل المبالغ الزائدة إلى حساب مدفوعات مسبقة'
        });
      
      if (creditError) {
        console.error(`   ❌ خطأ في إنشاء سطر Credit:`, creditError);
        continue;
      }
      
      console.log(`   ✅ تم نقل ${totalExcess.toFixed(2)} إلى حساب "مدفوعات مسبقة للموردين"`);
      totalTransferred += totalExcess;
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('النتيجة النهائية:');
    console.log(`   إجمالي المبالغ المنقولة: ${totalTransferred.toFixed(2)}`);
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ خطأ عام:', error);
  }
}

transferExcessToPrepaid();
