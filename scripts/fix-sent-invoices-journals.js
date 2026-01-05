/**
 * 🔧 FIX SENT INVOICES WITH JOURNALS
 * ===================================
 * إصلاح المشكلة: حذف القيود المحاسبية من فواتير Sent
 * 
 * ⚠️ تحذير: هذا السكربت يحذف القيود المحاسبية من فواتير Sent
 * لأن فواتير Sent يجب ألا يكون لها قيود (Cash Basis)
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

const FIX_REPORT = {
  timestamp: new Date().toISOString(),
  status: 'IN_PROGRESS',
  invoices: [],
  deletedJournals: [],
  errors: [],
  summary: {
    totalInvoices: 0,
    fixedInvoices: 0,
    deletedJournalEntries: 0,
    deletedJournalLines: 0
  }
};

async function fixSentInvoices() {
  console.log('🔧 FIXING SENT INVOICES WITH JOURNALS');
  console.log('=====================================\n');
  console.log('⚠️  تحذير: هذا السكربت سيحذف القيود المحاسبية من فواتير Sent\n');
  
  try {
    // 1. جلب جميع فواتير Sent
    const { data: sentInvoices, error: invError } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, total_amount, paid_amount')
      .eq('status', 'sent');
    
    if (invError) throw invError;
    
    console.log(`📊 إجمالي فواتير Sent: ${sentInvoices?.length || 0}\n`);
    
    if (!sentInvoices || sentInvoices.length === 0) {
      console.log('✅ لا توجد فواتير Sent');
      FIX_REPORT.status = 'COMPLETED';
      return;
    }
    
    FIX_REPORT.summary.totalInvoices = sentInvoices.length;
    
    // 2. جلب جميع القيود المرتبطة بهذه الفواتير
    const invoiceIds = sentInvoices.map(inv => inv.id);
    const { data: journals, error: jeError } = await supabase
      .from('journal_entries')
      .select('id, reference_id, reference_type, description')
      .in('reference_id', invoiceIds)
      .eq('reference_type', 'invoice');
    
    if (jeError) throw jeError;
    
    if (!journals || journals.length === 0) {
      console.log('✅ لا توجد قيود محاسبية للفواتير Sent');
      FIX_REPORT.status = 'COMPLETED';
      return;
    }
    
    console.log(`📋 عدد القيود المراد حذفها: ${journals.length}\n`);
    
    // 3. حذف سطور القيود أولاً
    const journalIds = journals.map(je => je.id);
    console.log('🗑️  حذف سطور القيود...');
    
    const { error: linesError } = await supabase
      .from('journal_entry_lines')
      .delete()
      .in('journal_entry_id', journalIds);
    
    if (linesError) {
      console.error(`❌ خطأ في حذف سطور القيود: ${linesError.message}`);
      FIX_REPORT.errors.push({
        step: 'delete_lines',
        error: linesError.message
      });
    } else {
      FIX_REPORT.summary.deletedJournalLines = journalIds.length;
      console.log(`✅ تم حذف سطور القيود`);
    }
    
    // 4. تحديث حالة القيود إلى draft أولاً (إذا كانت posted)
    console.log('🔄 تحديث حالة القيود إلى draft...');
    
    const { error: updateError } = await supabase
      .from('journal_entries')
      .update({ status: 'draft' })
      .in('id', journalIds)
      .eq('status', 'posted');
    
    if (updateError) {
      console.log(`⚠️  تحذير: ${updateError.message}`);
    } else {
      console.log(`✅ تم تحديث حالة القيود إلى draft`);
    }
    
    // 5. حذف القيود
    console.log('🗑️  حذف القيود...');
    
    const { error: journalsError } = await supabase
      .from('journal_entries')
      .delete()
      .in('id', journalIds);
    
    if (journalsError) {
      console.error(`❌ خطأ في حذف القيود: ${journalsError.message}`);
      console.log(`\n💡 محاولة حذف مباشرة بدون تحديث الحالة...`);
      
      // محاولة أخرى: حذف مباشرة
      let deletedCount = 0;
      for (const journalId of journalIds) {
        const { error: delError } = await supabase
          .from('journal_entries')
          .delete()
          .eq('id', journalId);
        
        if (!delError) {
          deletedCount++;
        }
      }
      
      if (deletedCount > 0) {
        console.log(`✅ تم حذف ${deletedCount} من ${journalIds.length} قيد`);
        FIX_REPORT.summary.deletedJournalEntries = deletedCount;
        FIX_REPORT.summary.fixedInvoices = sentInvoices.length;
      } else {
        FIX_REPORT.errors.push({
          step: 'delete_journals',
          error: journalsError.message
        });
      }
    } else {
      FIX_REPORT.summary.deletedJournalEntries = journals.length;
      FIX_REPORT.summary.fixedInvoices = sentInvoices.length;
      console.log(`✅ تم حذف ${journals.length} قيد محاسبي`);
    }
    
    // 5. تسجيل التفاصيل
    for (const inv of sentInvoices) {
      const invJournals = journals.filter(je => je.reference_id === inv.id);
      FIX_REPORT.invoices.push({
        id: inv.id,
        invoice_number: inv.invoice_number,
        status: inv.status,
        total_amount: inv.total_amount,
        paid_amount: inv.paid_amount,
        deleted_journals: invJournals.length,
        journal_ids: invJournals.map(je => je.id)
      });
      
      FIX_REPORT.deletedJournals.push(...invJournals.map(je => ({
        id: je.id,
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        description: je.description
      })));
    }
    
    // 6. التحقق من النتيجة
    console.log('\n🔍 التحقق من النتيجة...');
    
    const { data: verifyInvoices, error: verifyError } = await supabase
      .from('invoices')
      .select('id, invoice_number, status')
      .eq('status', 'sent');
    
    if (verifyError) throw verifyError;
    
    const verifyInvoiceIds = (verifyInvoices || []).map(inv => inv.id);
    const { data: verifyJournals } = await supabase
      .from('journal_entries')
      .select('id, reference_id')
      .in('reference_id', verifyInvoiceIds)
      .eq('reference_type', 'invoice');
    
    const remaining = verifyJournals?.length || 0;
    
    if (remaining === 0) {
      console.log('✅ جميع القيود تم حذفها بنجاح');
      FIX_REPORT.status = 'SUCCESS';
    } else {
      console.log(`⚠️  لا يزال يوجد ${remaining} قيد مرتبط بفواتير Sent`);
      FIX_REPORT.status = 'PARTIAL';
    }
    
    // 7. حفظ التقرير
    const reportPath = path.join(__dirname, '..', `FIX_SENT_INVOICES_REPORT_${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(FIX_REPORT, null, 2), 'utf8');
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 الملخص');
    console.log('='.repeat(60));
    console.log(`إجمالي فواتير Sent: ${FIX_REPORT.summary.totalInvoices}`);
    console.log(`الفواتير المُصلحة: ${FIX_REPORT.summary.fixedInvoices}`);
    console.log(`القيود المحذوفة: ${FIX_REPORT.summary.deletedJournalEntries}`);
    console.log(`سطور القيود المحذوفة: ${FIX_REPORT.summary.deletedJournalLines}`);
    console.log(`الحالة: ${FIX_REPORT.status === 'SUCCESS' ? '✅ SUCCESS' : '⚠️ PARTIAL'}`);
    console.log(`\nالتقرير محفوظ في: ${reportPath}\n`);
    
    return FIX_REPORT;
    
  } catch (error) {
    console.error('\n❌ خطأ أثناء الإصلاح:', error);
    FIX_REPORT.status = 'FAILED';
    FIX_REPORT.errors.push({
      step: 'general',
      error: error.message
    });
    
    const reportPath = path.join(__dirname, '..', `FIX_SENT_INVOICES_REPORT_${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(FIX_REPORT, null, 2), 'utf8');
    
    process.exit(1);
  }
}

if (require.main === module) {
  fixSentInvoices().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { fixSentInvoices, FIX_REPORT };

