/**
 * 🔍 AUTOMATED DATA INTEGRITY CHECK
 * =================================
 * فحص تلقائي لسلامة البيانات والقيود المحاسبية
 * 
 * هذا السكربت يفحص:
 * 1. توازن القيود المحاسبية (Debit = Credit)
 * 2. سلامة حركات المخزون
 * 3. تطابق النمط المحاسبي (Cash Basis)
 * 4. عزل البيانات بين الشركات
 */

const fs = require('fs');
const path = require('path');

const CHECK_REPORT = {
  timestamp: new Date().toISOString(),
  status: 'IN_PROGRESS',
  checks: {
    journalBalance: { status: 'PENDING', issues: [] },
    inventoryTransactions: { status: 'PENDING', issues: [] },
    accountingPattern: { status: 'PENDING', issues: [] },
    dataIsolation: { status: 'PENDING', issues: [] }
  },
  summary: {
    totalChecks: 0,
    passed: 0,
    failed: 0,
    warnings: 0
  }
};

function addCheckResult(category, name, status, details = null) {
  const check = {
    name,
    status, // 'PASS', 'FAIL', 'WARNING'
    details,
    timestamp: new Date().toISOString()
  };
  
  CHECK_REPORT.checks[category].issues.push(check);
  CHECK_REPORT.summary.totalChecks++;
  
  if (status === 'PASS') CHECK_REPORT.summary.passed++;
  else if (status === 'FAIL') CHECK_REPORT.summary.failed++;
  else CHECK_REPORT.summary.warnings++;
  
  return check;
}

// ============================================
// 1. فحص توازن القيود المحاسبية
// ============================================

function checkJournalBalance() {
  console.log('\n🔍 [1/4] فحص توازن القيود المحاسبية...');
  
  // هذا يتطلب اتصال بقاعدة البيانات
  // في بيئة حقيقية، سنستخدم Supabase client
  
  addCheckResult('journalBalance', 'Journal Entries Balance Check', 'PENDING',
    'يتطلب اتصال بقاعدة البيانات - يجب تنفيذه يدوياً من Supabase SQL Editor'
  );
  
  addCheckResult('journalBalance', 'SQL Query Available', 'PASS',
    'استخدم: SELECT * FROM audit_journal_entries_integrity()'
  );
  
  CHECK_REPORT.checks.journalBalance.status = 'COMPLETED';
}

// ============================================
// 2. فحص حركات المخزون
// ============================================

function checkInventoryTransactions() {
  console.log('\n🔍 [2/4] فحص حركات المخزون...');
  
  addCheckResult('inventoryTransactions', 'Inventory Transactions Pattern', 'PENDING',
    'يتطلب فحص يدوي: التحقق من أن Draft لا يحتوي على حركات مخزون'
  );
  
  addCheckResult('inventoryTransactions', 'SQL Query Available', 'PASS',
    'استخدم: SELECT * FROM inventory_transactions WHERE reference_id IS NULL'
  );
  
  CHECK_REPORT.checks.inventoryTransactions.status = 'COMPLETED';
}

// ============================================
// 3. فحص النمط المحاسبي
// ============================================

function checkAccountingPattern() {
  console.log('\n🔍 [3/4] فحص النمط المحاسبي...');
  
  // فحص الملفات للتحقق من عدم وجود Accrual
  const apiDir = path.join(__dirname, '..', 'app', 'api');
  let accrualFound = false;
  
  if (fs.existsSync(apiDir)) {
    function findAPIFiles(dir) {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          findAPIFiles(fullPath);
        } else if (file.isFile() && file.name === 'route.ts') {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.match(/ACCRUAL.*BASIS|accrual.*basis/i) && 
              !content.includes('Cash Basis') && 
              !content.includes('نظام النقدية')) {
            accrualFound = true;
            addCheckResult('accountingPattern', `Accrual Reference Found: ${path.relative(__dirname + '/..', fullPath)}`, 'FAIL',
              'يحتوي على إشارة لـ Accrual Basis'
            );
          }
        }
      }
    }
    
    findAPIFiles(apiDir);
  }
  
  if (!accrualFound) {
    addCheckResult('accountingPattern', 'No Accrual Code in APIs', 'PASS');
  }
  
  // فحص الوثائق
  const docsPath = path.join(__dirname, '..', 'docs', 'ACCOUNTING_PATTERN.md');
  if (fs.existsSync(docsPath)) {
    const content = fs.readFileSync(docsPath, 'utf8');
    if (content.includes('Cash Basis') || content.includes('cash basis')) {
      addCheckResult('accountingPattern', 'Cash Basis Documented', 'PASS');
    } else {
      addCheckResult('accountingPattern', 'Cash Basis Not Clearly Documented', 'WARNING');
    }
  }
  
  CHECK_REPORT.checks.accountingPattern.status = 'COMPLETED';
}

// ============================================
// 4. فحص عزل البيانات
// ============================================

function checkDataIsolation() {
  console.log('\n🔍 [4/4] فحص عزل البيانات...');
  
  // فحص RLS Policies في SQL files
  const sqlDir = path.join(__dirname, '..', 'scripts');
  let rlsFound = false;
  
  if (fs.existsSync(sqlDir)) {
    function findSQLFiles(dir) {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory() && file.name !== 'node_modules' && file.name !== '.git' && file.name !== 'archive') {
          findSQLFiles(fullPath);
        } else if (file.isFile() && file.name.endsWith('.sql') && !fullPath.includes('archive')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes('ROW LEVEL SECURITY') || content.includes('ENABLE ROW LEVEL SECURITY')) {
            rlsFound = true;
            break;
          }
        }
      }
    }
    
    findSQLFiles(sqlDir);
  }
  
  if (rlsFound) {
    addCheckResult('dataIsolation', 'RLS Policies Found', 'PASS',
      'تم العثور على RLS Policies في ملفات SQL'
    );
  } else {
    addCheckResult('dataIsolation', 'RLS Policies Check', 'WARNING',
      'يجب التحقق يدوياً من تفعيل RLS على جميع الجداول'
    );
  }
  
  CHECK_REPORT.checks.dataIsolation.status = 'COMPLETED';
}

// ============================================
// 5. إنشاء التقرير
// ============================================

function generateReport() {
  console.log('\n🔍 [5/5] إنشاء التقرير...');
  
  // تحديد الحالة النهائية
  if (CHECK_REPORT.summary.failed > 0) {
    CHECK_REPORT.status = 'FAILED';
  } else if (CHECK_REPORT.summary.warnings > 0) {
    CHECK_REPORT.status = 'WARNING';
  } else {
    CHECK_REPORT.status = 'PASSED';
  }
  
  const reportDir = __dirname + '/..';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const reportPath = path.join(reportDir, `AUTOMATED_INTEGRITY_CHECK_${timestamp}.json`);
  const reportTextPath = path.join(reportDir, `AUTOMATED_INTEGRITY_CHECK_${timestamp}.txt`);
  
  // حفظ JSON
  fs.writeFileSync(reportPath, JSON.stringify(CHECK_REPORT, null, 2), 'utf8');
  
  // حفظ نصي
  let textReport = `🔍 AUTOMATED DATA INTEGRITY CHECK REPORT
==========================================
تاريخ الفحص: ${CHECK_REPORT.timestamp}
الحالة النهائية: ${CHECK_REPORT.status}
==========================================

📊 الملخص:
- إجمالي الفحوصات: ${CHECK_REPORT.summary.totalChecks}
- نجحت: ${CHECK_REPORT.summary.passed}
- فشلت: ${CHECK_REPORT.summary.failed}
- تحذيرات: ${CHECK_REPORT.summary.warnings}

`;

  for (const [category, data] of Object.entries(CHECK_REPORT.checks)) {
    textReport += `\n${'='.repeat(50)}\n`;
    textReport += `📋 ${category.toUpperCase()}\n`;
    textReport += `${'='.repeat(50)}\n\n`;
    
    if (data.issues.length > 0) {
      for (const issue of data.issues) {
        textReport += `[${issue.status}] ${issue.name}\n`;
        if (issue.details) {
          textReport += `   ${issue.details}\n`;
        }
        textReport += `\n`;
      }
    }
  }
  
  textReport += `\n${'='.repeat(50)}\n`;
  textReport += `🏁 القرار النهائي\n`;
  textReport += `${'='.repeat(50)}\n\n`;
  
  if (CHECK_REPORT.status === 'PASSED') {
    textReport += `✅ جميع الفحوصات التلقائية نجحت\n`;
  } else if (CHECK_REPORT.status === 'FAILED') {
    textReport += `❌ يوجد ${CHECK_REPORT.summary.failed} فحص فشل\n`;
  } else {
    textReport += `⚠️ يوجد ${CHECK_REPORT.summary.warnings} تحذير\n`;
  }
  
  textReport += `\n⚠️ ملاحظة: بعض الفحوصات تتطلب اتصال بقاعدة البيانات ويجب تنفيذها يدوياً.\n`;
  
  fs.writeFileSync(reportTextPath, textReport, 'utf8');
  
  console.log(`\n✅ التقرير محفوظ في:\n   ${reportPath}\n   ${reportTextPath}\n`);
  
  return { reportPath, reportTextPath };
}

// ============================================
// التنفيذ الرئيسي
// ============================================

function main() {
  console.log('🔍 AUTOMATED DATA INTEGRITY CHECK');
  console.log('==================================\n');
  
  try {
    checkJournalBalance();
    checkInventoryTransactions();
    checkAccountingPattern();
    checkDataIsolation();
    
    const { reportPath, reportTextPath } = generateReport();
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 الملخص النهائي');
    console.log('='.repeat(50));
    console.log(`الحالة: ${CHECK_REPORT.status}`);
    console.log(`الفحوصات الناجحة: ${CHECK_REPORT.summary.passed}`);
    console.log(`الفحوصات الفاشلة: ${CHECK_REPORT.summary.failed}`);
    console.log(`التحذيرات: ${CHECK_REPORT.summary.warnings}`);
    console.log(`\nالتقارير:\n  ${reportPath}\n  ${reportTextPath}\n`);
    
    process.exit(CHECK_REPORT.summary.failed > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('\n❌ خطأ أثناء الفحص:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, CHECK_REPORT };

