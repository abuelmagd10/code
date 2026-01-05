/**
 * 🔍 INSPECT SENT INVOICES WITH JOURNALS
 * =======================================
 * فحص تفصيلي للفواتير Sent التي لديها قيود محاسبية
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// قراءة .env.local إذا كان موجوداً
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
} catch (e) {
  // تجاهل الأخطاء
}

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

async function inspectSentInvoices() {
  console.log('🔍 INSPECTING SENT INVOICES WITH JOURNALS');
  console.log('==========================================\n');
  
  try {
    // جلب جميع فواتير Sent
    const { data: sentInvoices, error: invError } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, total_amount, paid_amount, invoice_date, customer_id')
      .eq('status', 'sent');
    
    if (invError) throw invError;
    
    console.log(`📊 إجمالي فواتير Sent: ${sentInvoices?.length || 0}\n`);
    
    if (!sentInvoices || sentInvoices.length === 0) {
      console.log('✅ لا توجد فواتير Sent');
      return;
    }
    
    // جلب جميع القيود المرتبطة بهذه الفواتير
    const invoiceIds = sentInvoices.map(inv => inv.id);
    const { data: journals, error: jeError } = await supabase
      .from('journal_entries')
      .select(`
        id,
        reference_id,
        reference_type,
        entry_date,
        description,
        status,
        journal_entry_lines (
          id,
          account_id,
          debit_amount,
          credit_amount,
          description
        )
      `)
      .in('reference_id', invoiceIds)
      .eq('reference_type', 'invoice');
    
    if (jeError) throw jeError;
    
    // تجميع القيود حسب الفاتورة
    const invoicesWithJournals = {};
    (journals || []).forEach(je => {
      if (!invoicesWithJournals[je.reference_id]) {
        invoicesWithJournals[je.reference_id] = [];
      }
      invoicesWithJournals[je.reference_id].push(je);
    });
    
    // عرض النتائج
    const problematicInvoices = sentInvoices.filter(inv => invoicesWithJournals[inv.id]);
    
    console.log(`❌ فواتير Sent مع قيود: ${problematicInvoices.length}\n`);
    
    if (problematicInvoices.length > 0) {
      console.log('📋 التفاصيل:\n');
      
      for (const inv of problematicInvoices) {
        const journalEntries = invoicesWithJournals[inv.id] || [];
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`فاتورة: ${inv.invoice_number}`);
        console.log(`ID: ${inv.id}`);
        console.log(`الحالة: ${inv.status}`);
        console.log(`الإجمالي: ${inv.total_amount}`);
        console.log(`المدفوع: ${inv.paid_amount}`);
        console.log(`التاريخ: ${inv.invoice_date}`);
        console.log(`عدد القيود: ${journalEntries.length}`);
        
        journalEntries.forEach((je, idx) => {
          console.log(`\n  قيد #${idx + 1}:`);
          console.log(`    ID: ${je.id}`);
          console.log(`    النوع: ${je.reference_type}`);
          console.log(`    التاريخ: ${je.entry_date}`);
          console.log(`    الوصف: ${je.description || 'N/A'}`);
          console.log(`    الحالة: ${je.status}`);
          
          const lines = je.journal_entry_lines || [];
          console.log(`    السطور: ${lines.length}`);
          
          let totalDebit = 0;
          let totalCredit = 0;
          
          lines.forEach((line, lineIdx) => {
            const debit = parseFloat(line.debit_amount) || 0;
            const credit = parseFloat(line.credit_amount) || 0;
            totalDebit += debit;
            totalCredit += credit;
            
            console.log(`      ${lineIdx + 1}. Dr: ${debit.toFixed(2)}, Cr: ${credit.toFixed(2)} - ${line.description || 'N/A'}`);
          });
          
          console.log(`    المجموع: Dr: ${totalDebit.toFixed(2)}, Cr: ${totalCredit.toFixed(2)}`);
          console.log(`    التوازن: ${Math.abs(totalDebit - totalCredit) < 0.01 ? '✅ متوازن' : '❌ غير متوازن'}`);
        });
      }
    }
    
    // حفظ التقرير
    const report = {
      timestamp: new Date().toISOString(),
      totalSentInvoices: sentInvoices.length,
      problematicInvoices: problematicInvoices.length,
      invoices: problematicInvoices.map(inv => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        status: inv.status,
        total_amount: inv.total_amount,
        paid_amount: inv.paid_amount,
        invoice_date: inv.invoice_date,
        journal_entries: (invoicesWithJournals[inv.id] || []).map(je => ({
          id: je.id,
          entry_date: je.entry_date,
          description: je.description,
          status: je.status,
          lines: (je.journal_entry_lines || []).map(line => ({
            account_id: line.account_id,
            debit_amount: line.debit_amount,
            credit_amount: line.credit_amount,
            description: line.description
          }))
        }))
      }))
    };
    
    const reportPath = path.join(__dirname, '..', `SENT_INVOICES_INSPECTION_${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 الملخص');
    console.log('='.repeat(60));
    console.log(`إجمالي فواتير Sent: ${sentInvoices.length}`);
    console.log(`فواتير Sent مع قيود: ${problematicInvoices.length} ❌`);
    console.log(`فواتير Sent بدون قيود: ${sentInvoices.length - problematicInvoices.length} ✅`);
    console.log(`\nالتقرير محفوظ في: ${reportPath}\n`);
    
    return report;
    
  } catch (error) {
    console.error('\n❌ خطأ أثناء الفحص:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  inspectSentInvoices();
}

module.exports = { inspectSentInvoices };

