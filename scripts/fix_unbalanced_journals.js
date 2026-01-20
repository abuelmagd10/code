// =====================================================
// إصلاح القيود المحاسبية غير المتوازنة
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

async function fixUnbalancedJournals() {
  console.log('\n🔧 إصلاح القيود المحاسبية غير المتوازنة\n');
  
  try {
    // جلب جميع القيود
    const { data: journalEntries } = await supabase
      .from('journal_entries')
      .select('id, company_id, reference_type, reference_id, entry_date, description, status')
      .is('deleted_at', null);
    
    if (!journalEntries || journalEntries.length === 0) {
      console.log('⚠️ لا توجد قيود محاسبية');
      return;
    }
    
    const jeIds = journalEntries.map(je => je.id);
    
    // جلب جميع سطور القيود
    const { data: journalLines } = await supabase
      .from('journal_entry_lines')
      .select('journal_entry_id, account_id, debit_amount, credit_amount, description')
      .in('journal_entry_id', jeIds);
    
    // حساب التوازن لكل قيد
    const entryBalances = new Map();
    
    journalEntries.forEach(je => {
      entryBalances.set(je.id, {
        entry: je,
        total_debit: 0,
        total_credit: 0,
        imbalance: 0,
        lines: []
      });
    });
    
    journalLines?.forEach(line => {
      const balance = entryBalances.get(line.journal_entry_id);
      if (balance) {
        balance.total_debit += line.debit_amount || 0;
        balance.total_credit += line.credit_amount || 0;
        balance.lines.push(line);
        balance.imbalance = Math.abs(balance.total_debit - balance.total_credit);
      }
    });
    
    // فلترة القيود غير المتوازنة
    const unbalancedEntries = Array.from(entryBalances.values())
      .filter(b => b.imbalance > 0.01);
    
    console.log(`📊 عدد القيود غير المتوازنة: ${unbalancedEntries.length}\n`);
    
    let fixedCount = 0;
    let errorCount = 0;
    
    for (const balance of unbalancedEntries) {
      const je = balance.entry;
      const imbalance = balance.total_debit - balance.total_credit;
      
      try {
        // جلب حساب الشركة (لإضافة سطر Credit أو Debit)
        const { data: companyAccounts } = await supabase
          .from('chart_of_accounts')
          .select('id, account_code, account_name, account_type')
          .eq('company_id', je.company_id)
          .eq('is_active', true)
          .limit(10);
        
        // تحديد الحساب المناسب لإصلاح عدم التوازن
        let adjustmentAccountId = null;
        
        if (imbalance > 0) {
          // المدين أكبر من الدائن - نحتاج حساب Credit
          // البحث عن حساب مصروفات أو أصل
          const expenseAccount = companyAccounts?.find(a => 
            a.account_type === 'expense' || 
            (a.account_type === 'asset' && a.account_code.startsWith('11'))
          );
          adjustmentAccountId = expenseAccount?.id;
        } else {
          // الدائن أكبر من المدين - نحتاج حساب Debit
          // البحث عن حساب إيرادات أو التزام
          const incomeAccount = companyAccounts?.find(a => 
            a.account_type === 'income' || 
            (a.account_type === 'liability' && a.account_code.startsWith('21'))
          );
          adjustmentAccountId = incomeAccount?.id;
        }
        
        if (!adjustmentAccountId) {
          console.log(`⚠️ لم يتم العثور على حساب مناسب لإصلاح القيد ${je.id}`);
          errorCount++;
          continue;
        }
        
        // إضافة سطر لتسوية القيد
        const adjustmentAmount = Math.abs(imbalance);
        
        if (imbalance > 0) {
          // إضافة Credit
          const { error: creditError } = await supabase
            .from('journal_entry_lines')
            .insert({
              journal_entry_id: je.id,
              account_id: adjustmentAccountId,
              debit_amount: 0,
              credit_amount: adjustmentAmount,
              description: 'إصلاح: تسوية قيد غير متوازن'
            });
          
          if (creditError) {
            console.error(`❌ خطأ في إضافة Credit للقيد ${je.id}:`, creditError);
            errorCount++;
            continue;
          }
        } else {
          // إضافة Debit
          const { error: debitError } = await supabase
            .from('journal_entry_lines')
            .insert({
              journal_entry_id: je.id,
              account_id: adjustmentAccountId,
              debit_amount: adjustmentAmount,
              credit_amount: 0,
              description: 'إصلاح: تسوية قيد غير متوازن'
            });
          
          if (debitError) {
            console.error(`❌ خطأ في إضافة Debit للقيد ${je.id}:`, debitError);
            errorCount++;
            continue;
          }
        }
        
        fixedCount++;
        console.log(`✅ تم إصلاح القيد ${je.id} (عدم التوازن: ${adjustmentAmount.toFixed(2)})`);
        
      } catch (error) {
        console.error(`❌ خطأ في معالجة القيد ${je.id}:`, error);
        errorCount++;
      }
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('النتيجة النهائية:');
    console.log(`   ✅ تم إصلاح: ${fixedCount} قيد`);
    console.log(`   ❌ فشل إصلاح: ${errorCount} قيد`);
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ خطأ عام:', error);
  }
}

fixUnbalancedJournals();
