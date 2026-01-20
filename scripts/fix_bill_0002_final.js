// =====================================================
// إصلاح قيد BILL-0002 - النسخة النهائية
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

async function fixBill0002Final() {
  console.log('\n🔧 إصلاح قيد BILL-0002 - النسخة النهائية\n');
  
  try {
    // جلب شركة "تست"
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name')
      .ilike('name', '%تست%')
      .limit(1);
    
    if (!companies || companies.length === 0) {
      console.log('⚠️ لم يتم العثور على شركة "تست"');
      return;
    }
    
    const companyId = companies[0].id;
    console.log(`📄 شركة: ${companies[0].name} (ID: ${companyId})\n`);
    
    // جلب قيد BILL-0002
    const { data: bill2Entry } = await supabase
      .from('journal_entries')
      .select('id, entry_date, description, reference_type, reference_id')
      .eq('company_id', companyId)
      .ilike('description', '%BILL-0002%')
      .eq('reference_type', 'bill')
      .limit(1)
      .single();
    
    if (!bill2Entry) {
      console.log('   ⚠️ لم يتم العثور على قيد BILL-0002');
      return;
    }
    
    console.log(`   📌 قيد ID: ${bill2Entry.id}`);
    console.log(`   الوصف: ${bill2Entry.description}\n`);
    
    // جلب سطور القيد
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('id, account_id, debit_amount, credit_amount, description')
      .eq('journal_entry_id', bill2Entry.id);
    
    // جلب الحسابات
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name, account_type')
      .eq('company_id', companyId)
      .eq('is_active', true);
    
    const accountsMap = new Map(accounts?.map(acc => [acc.id, acc]) || []);
    
    console.log('   السطور الحالية:');
    lines?.forEach(line => {
      const acc = accountsMap.get(line.account_id);
      const accName = acc ? `${acc.account_code} - ${acc.account_name}` : 'غير معروف';
      console.log(`      ${accName}: Debit ${line.debit_amount}, Credit ${line.credit_amount}`);
    });
    
    // البحث عن سطر Credit للأصول المتداولة (1100)
    const asset1100Account = accounts?.find(acc => acc.account_code === '1100');
    const wrongLine = lines?.find(l => l.account_id === asset1100Account?.id && l.credit_amount > 0);
    
    if (!wrongLine) {
      console.log('\n   ✅ لا يوجد سطر خاطئ - القيد صحيح');
      return;
    }
    
    console.log(`\n   📌 وجد سطر خاطئ: Credit ${wrongLine.credit_amount} لحساب "الأصول المتداولة"`);
    
    // البحث عن سطر AP
    const apAccount = accounts?.find(acc => acc.account_code.startsWith('211'));
    const apLine = lines?.find(l => {
      const acc = accountsMap.get(l.account_id);
      return acc && acc.account_code.startsWith('211') && l.credit_amount > 0;
    });
    
    if (!apLine) {
      console.log('   ⚠️ لم يتم العثور على سطر AP');
      return;
    }
    
    console.log(`   📌 سطر AP الحالي: Credit ${apLine.credit_amount}`);
    
    // حساب المبلغ الجديد
    const newAPCredit = Number(apLine.credit_amount || 0) + Number(wrongLine.credit_amount || 0);
    console.log(`   📌 سطر AP الجديد: Credit ${newAPCredit}\n`);
    
    // تنفيذ الإصلاح باستخدام RPC أو SQL مباشرة
    // سنستخدم طريقة مباشرة: تحديث AP ثم حذف السطر الخاطئ
    
    console.log('   🔧 بدء الإصلاح...\n');
    
    // الخطوة 1: تحديث AP Credit
    console.log('   1. تحديث AP Credit...');
    const { error: updateError } = await supabase
      .from('journal_entry_lines')
      .update({
        credit_amount: newAPCredit,
        description: 'الذمم الدائنة (الموردين) - إصلاح'
      })
      .eq('id', apLine.id);
    
    if (updateError) {
      console.error(`      ❌ خطأ: ${updateError.message}`);
      console.log('\n   💡 الحل: يجب تنفيذ SQL script يدوياً في Supabase SQL Editor');
      console.log('   الملف: scripts/fix_bill_0002_with_trigger_disable.sql');
      return;
    }
    
    console.log(`      ✅ تم تحديث AP Credit من ${apLine.credit_amount} إلى ${newAPCredit}`);
    
    // الخطوة 2: حذف السطر الخاطئ
    console.log('   2. حذف السطر الخاطئ...');
    const { error: deleteError } = await supabase
      .from('journal_entry_lines')
      .delete()
      .eq('id', wrongLine.id);
    
    if (deleteError) {
      console.error(`      ❌ خطأ: ${deleteError.message}`);
      console.log('\n   ⚠️ تم تحديث AP لكن فشل حذف السطر الخاطئ');
      console.log('   💡 يجب حذف السطر يدوياً أو تنفيذ SQL script');
      return;
    }
    
    console.log(`      ✅ تم حذف السطر الخاطئ\n`);
    
    // التحقق من النتيجة
    console.log('   🔍 التحقق من النتيجة...');
    const { data: finalLines } = await supabase
      .from('journal_entry_lines')
      .select('id, account_id, debit_amount, credit_amount, description')
      .eq('journal_entry_id', bill2Entry.id);
    
    console.log('\n   السطور النهائية:');
    finalLines?.forEach(line => {
      const acc = accountsMap.get(line.account_id);
      const accName = acc ? `${acc.account_code} - ${acc.account_name}` : 'غير معروف';
      console.log(`      ${accName}: Debit ${line.debit_amount}, Credit ${line.credit_amount}`);
    });
    
    // حساب التوازن
    const totalDebit = finalLines?.reduce((sum, l) => sum + (l.debit_amount || 0), 0) || 0;
    const totalCredit = finalLines?.reduce((sum, l) => sum + (l.credit_amount || 0), 0) || 0;
    const balance = totalDebit - totalCredit;
    
    console.log(`\n   إجمالي Debit: ${totalDebit.toFixed(2)}`);
    console.log(`   إجمالي Credit: ${totalCredit.toFixed(2)}`);
    console.log(`   الفرق: ${balance.toFixed(2)}`);
    
    if (Math.abs(balance) < 0.01) {
      console.log(`   ✅ القيد متوازن`);
    } else {
      console.log(`   ⚠️ القيد غير متوازن`);
    }
    
    console.log('\n   ✅ تم إصلاح قيد BILL-0002 بنجاح!');
    
  } catch (error) {
    console.error('❌ خطأ عام:', error);
    console.log('\n   💡 الحل البديل: تنفيذ SQL script يدوياً في Supabase SQL Editor');
    console.log('   الملف: scripts/fix_bill_0002_with_trigger_disable.sql');
  }
}

fixBill0002Final();
