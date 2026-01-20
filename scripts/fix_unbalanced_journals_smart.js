// =====================================================
// إصلاح القيود المحاسبية غير المتوازنة بطريقة ذكية
// فحص نوع القيد وإصلاحه وفقاً للنمط المحاسبي الصحيح
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
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type, sub_type')
    .eq('company_id', companyId)
    .eq('is_active', true);
  
  const mapping = {
    inventory: null,
    accounts_payable: null,
    vat_input: null,
    cogs: null,
    expense: null
  };
  
  accounts?.forEach(acc => {
    if (acc.sub_type === 'inventory' || (acc.account_type === 'asset' && acc.account_code.startsWith('114'))) {
      mapping.inventory = acc.id;
    } else if (acc.sub_type === 'accounts_payable' || (acc.account_type === 'liability' && acc.account_code.startsWith('211'))) {
      mapping.accounts_payable = acc.id;
    } else if (acc.sub_type === 'vat_input' || (acc.account_name.includes('ضريبة') && acc.account_name.includes('مدخلات'))) {
      mapping.vat_input = acc.id;
    } else if (acc.sub_type === 'cogs' || (acc.account_type === 'expense' && acc.account_code.startsWith('51'))) {
      mapping.cogs = acc.id;
    } else if (acc.account_type === 'expense' && acc.account_code.startsWith('50')) {
      mapping.expense = acc.id;
    }
  });
  
  return mapping;
}

async function fixBillJournal(je, lines, mapping) {
  // النمط المحاسبي لقيود فواتير الشراء:
  // Debit: المخزون (subtotal)
  // Debit: VAT Input (tax_amount)
  // Debit: الشحن (shipping_charge)
  // Credit: Accounts Payable (total_amount)
  
  const { data: bill } = await supabase
    .from('bills')
    .select('subtotal, tax_amount, total_amount, shipping_charge')
    .eq('id', je.reference_id)
    .single();
  
  if (!bill) {
    return { success: false, error: 'Bill not found' };
  }
  
  const subtotal = Number(bill.subtotal || 0);
  const taxAmount = Number(bill.tax_amount || 0);
  const shippingAmount = Number(bill.shipping_charge || 0);
  const totalAmount = Number(bill.total_amount || 0);
  
  // حساب المبالغ الحالية
  let currentDebit = 0;
  let currentCredit = 0;
  let hasInventoryDebit = false;
  let hasVATDebit = false;
  let hasShippingDebit = false;
  let hasAPCredit = false;
  
  lines.forEach(line => {
    currentDebit += line.debit_amount || 0;
    currentCredit += line.credit_amount || 0;
    
    if (line.account_id === mapping.inventory && line.debit_amount > 0) {
      hasInventoryDebit = true;
    }
    if (line.account_id === mapping.vat_input && line.debit_amount > 0) {
      hasVATDebit = true;
    }
    if (line.account_id === mapping.accounts_payable && line.credit_amount > 0) {
      hasAPCredit = true;
    }
  });
  
  const expectedDebit = subtotal + taxAmount + shippingAmount;
  const expectedCredit = totalAmount;
  const imbalance = expectedDebit - expectedCredit;
  
  const fixes = [];
  
  // إصلاح Debit: المخزون
  if (!hasInventoryDebit && subtotal > 0 && mapping.inventory) {
    fixes.push({
      account_id: mapping.inventory,
      debit_amount: subtotal,
      credit_amount: 0,
      description: 'المخزون (أصل)'
    });
  }
  
  // إصلاح Debit: VAT Input
  if (!hasVATDebit && taxAmount > 0 && mapping.vat_input) {
    fixes.push({
      account_id: mapping.vat_input,
      debit_amount: taxAmount,
      credit_amount: 0,
      description: 'ضريبة القيمة المضافة (مدخلات)'
    });
  }
  
  // إصلاح Credit: Accounts Payable
  if (!hasAPCredit && totalAmount > 0 && mapping.accounts_payable) {
    fixes.push({
      account_id: mapping.accounts_payable,
      debit_amount: 0,
      credit_amount: totalAmount,
      description: 'الذمم الدائنة (الموردين)'
    });
  } else if (hasAPCredit && Math.abs(currentCredit - expectedCredit) > 0.01) {
    // تحديث AP Credit إذا كان المبلغ غير صحيح
    const apLine = lines.find(l => l.account_id === mapping.accounts_payable && l.credit_amount > 0);
    if (apLine) {
      // حذف السطر القديم وإضافة سطر جديد
      await supabase
        .from('journal_entry_lines')
        .delete()
        .eq('id', apLine.id);
      
      fixes.push({
        account_id: mapping.accounts_payable,
        debit_amount: 0,
        credit_amount: totalAmount,
        description: 'الذمم الدائنة (الموردين) - إصلاح'
      });
    }
  }
  
  // إضافة سطور الإصلاح
  for (const fix of fixes) {
    const { error } = await supabase
      .from('journal_entry_lines')
      .insert({
        journal_entry_id: je.id,
        ...fix
      });
    
    if (error) {
      return { success: false, error: error.message };
    }
  }
  
  return { success: true, fixes: fixes.length };
}

async function fixSalesReturnCOGSJournal(je, lines, mapping) {
  // النمط المحاسبي لقيود COGS للمرتجعات:
  // Debit: المخزون (Inventory)
  // Credit: COGS (عكس التكلفة)
  
  const totalDebit = lines.reduce((sum, l) => sum + (l.debit_amount || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (l.credit_amount || 0), 0);
  
  const imbalance = totalDebit - totalCredit;
  
  if (Math.abs(imbalance) < 0.01) {
    return { success: true, fixes: 0 };
  }
  
  // إذا كان Debit أكبر من Credit، نحتاج Credit للـ COGS
  if (imbalance > 0 && mapping.cogs) {
    const { error } = await supabase
      .from('journal_entry_lines')
      .insert({
        journal_entry_id: je.id,
        account_id: mapping.cogs,
        debit_amount: 0,
        credit_amount: imbalance,
        description: 'عكس تكلفة البضاعة المرتجعة'
      });
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true, fixes: 1 };
  }
  
  return { success: false, error: 'Cannot fix sales return COGS journal' };
}

async function fixVendorCreditJournal(je, lines, mapping) {
  // النمط المحاسبي لقيود Vendor Credit:
  // Debit: Accounts Payable
  // Credit: المخزون/المصروفات
  
  const totalDebit = lines.reduce((sum, l) => sum + (l.debit_amount || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (l.credit_amount || 0), 0);
  
  const imbalance = totalDebit - totalCredit;
  
  if (Math.abs(imbalance) < 0.01) {
    return { success: true, fixes: 0 };
  }
  
  // إذا كان Debit أكبر من Credit، نحتاج Credit للمخزون
  if (imbalance > 0 && mapping.inventory) {
    const { error } = await supabase
      .from('journal_entry_lines')
      .insert({
        journal_entry_id: je.id,
        account_id: mapping.inventory,
        debit_amount: 0,
        credit_amount: imbalance,
        description: 'إشعار دائن مورد - إصلاح'
      });
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true, fixes: 1 };
  }
  
  return { success: false, error: 'Cannot fix vendor credit journal' };
}

async function fixInventoryAdjustmentJournal(je, lines, mapping) {
  // النمط المحاسبي لقيود تسوية المخزون:
  // Debit: المصروفات (الخسارة)
  // Credit: المخزون (الفرق)
  
  const totalDebit = lines.reduce((sum, l) => sum + (l.debit_amount || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (l.credit_amount || 0), 0);
  
  const imbalance = totalDebit - totalCredit;
  
  if (Math.abs(imbalance) < 0.01) {
    return { success: true, fixes: 0 };
  }
  
  // إذا كان Debit أكبر من Credit، نحتاج Credit للمخزون
  if (imbalance > 0 && mapping.inventory) {
    const { error } = await supabase
      .from('journal_entry_lines')
      .insert({
        journal_entry_id: je.id,
        account_id: mapping.inventory,
        debit_amount: 0,
        credit_amount: imbalance,
        description: 'تسوية المخزون - إصلاح'
      });
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true, fixes: 1 };
  }
  
  return { success: false, error: 'Cannot fix inventory adjustment journal' };
}

async function fixUnbalancedJournalsSmart() {
  console.log('\n🔧 إصلاح القيود المحاسبية غير المتوازنة بطريقة ذكية\n');
  
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
      .select('id, journal_entry_id, account_id, debit_amount, credit_amount, description')
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
    const fixesByType = {};
    
    // تجميع حسب الشركة
    const entriesByCompany = new Map();
    unbalancedEntries.forEach(balance => {
      const companyId = balance.entry.company_id;
      if (!entriesByCompany.has(companyId)) {
        entriesByCompany.set(companyId, []);
      }
      entriesByCompany.get(companyId).push(balance);
    });
    
    for (const [companyId, companyEntries] of entriesByCompany) {
      console.log(`\nمعالجة شركة: ${companyId} (${companyEntries.length} قيد غير متوازن)`);
      
      // جلب خريطة الحسابات
      const mapping = await getAccountMapping(companyId);
      
      for (const balance of companyEntries) {
        const je = balance.entry;
        const lines = balance.lines;
        
        try {
          let result = { success: false, error: 'Unknown journal type' };
          
          // إصلاح حسب نوع القيد
          if (je.reference_type === 'bill') {
            result = await fixBillJournal(je, lines, mapping);
          } else if (je.reference_type === 'sales_return_cogs') {
            result = await fixSalesReturnCOGSJournal(je, lines, mapping);
          } else if (je.reference_type === 'vendor_credit') {
            result = await fixVendorCreditJournal(je, lines, mapping);
          } else if (je.reference_type === 'inventory_adjustment') {
            result = await fixInventoryAdjustmentJournal(je, lines, mapping);
          } else {
            console.log(`   ⚠️ نوع قيد غير معروف: ${je.reference_type} (ID: ${je.id})`);
            errorCount++;
            continue;
          }
          
          if (result.success) {
            fixedCount++;
            const type = je.reference_type;
            fixesByType[type] = (fixesByType[type] || 0) + 1;
            console.log(`   ✅ تم إصلاح قيد ${je.reference_type} (ID: ${je.id}) - ${result.fixes} سطر إصلاح`);
          } else {
            errorCount++;
            console.log(`   ❌ فشل إصلاح قيد ${je.reference_type} (ID: ${je.id}): ${result.error}`);
          }
          
        } catch (error) {
          console.error(`   ❌ خطأ في معالجة القيد ${je.id}:`, error);
          errorCount++;
        }
      }
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('النتيجة النهائية:');
    console.log(`   ✅ تم إصلاح: ${fixedCount} قيد`);
    console.log(`   ❌ فشل إصلاح: ${errorCount} قيد`);
    console.log('\nالإصلاحات حسب النوع:');
    Object.entries(fixesByType).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count} قيد`);
    });
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ خطأ عام:', error);
  }
}

fixUnbalancedJournalsSmart();
