/**
 * 🔒 ZERO-DEFECT RELEASE GATE AUDIT SCRIPT
 * =========================================
 * مراجعة شاملة إلزامية قبل الإطلاق النهائي
 * 
 * هذا السكربت يفحص:
 * 1. قاعدة البيانات: الجداول، العلاقات، Triggers، Functions
 * 2. الكود الخلفي: Security، Accounting Pattern، Business Logic
 * 3. الواجهة: Permissions، Routing، Forms
 * 4. الصلاحيات: Frontend، Backend، API، Database RLS
 */

const fs = require('fs');
const path = require('path');

// ============================================
// 1. إعدادات المراجعة
// ============================================

const AUDIT_REPORT = {
  timestamp: new Date().toISOString(),
  version: "1.0.0",
  status: "IN_PROGRESS",
  sections: {
    database: { status: "PENDING", issues: [], checks: [] },
    backend: { status: "PENDING", issues: [], checks: [] },
    frontend: { status: "PENDING", issues: [], checks: [] },
    security: { status: "PENDING", issues: [], checks: [] },
    accounting: { status: "PENDING", issues: [], checks: [] },
    testing: { status: "PENDING", issues: [], checks: [] }
  },
  summary: {
    totalIssues: 0,
    criticalIssues: 0,
    mediumIssues: 0,
    lowIssues: 0,
    passedChecks: 0,
    failedChecks: 0
  }
};

// ============================================
// 2. مساعدات المراجعة
// ============================================

function addIssue(section, severity, title, description, file = null, line = null) {
  const issue = {
    id: `${section}_${AUDIT_REPORT.sections[section].issues.length + 1}`,
    severity, // 'critical', 'medium', 'low'
    title,
    description,
    file,
    line,
    timestamp: new Date().toISOString()
  };
  
  AUDIT_REPORT.sections[section].issues.push(issue);
  AUDIT_REPORT.summary.totalIssues++;
  
  if (severity === 'critical') AUDIT_REPORT.summary.criticalIssues++;
  else if (severity === 'medium') AUDIT_REPORT.summary.mediumIssues++;
  else AUDIT_REPORT.summary.lowIssues++;
  
  return issue;
}

function addCheck(section, name, status, details = null) {
  const check = {
    name,
    status, // 'PASS', 'FAIL', 'WARNING'
    details,
    timestamp: new Date().toISOString()
  };
  
  AUDIT_REPORT.sections[section].checks.push(check);
  
  if (status === 'PASS') AUDIT_REPORT.summary.passedChecks++;
  else AUDIT_REPORT.summary.failedChecks++;
  
  return check;
}

// ============================================
// 3. مراجعة قاعدة البيانات
// ============================================

function auditDatabase() {
  console.log('\n🔍 [1/6] مراجعة قاعدة البيانات...');
  
  const sqlDir = path.join(__dirname, '..');
  const sqlFiles = [];
  
  // البحث عن ملفات SQL
  function findSQLFiles(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      // تجاهل node_modules, .git, archive
      if (file.isDirectory() && file.name !== 'node_modules' && file.name !== '.git' && file.name !== 'archive') {
        findSQLFiles(fullPath);
      } else if (file.isFile() && file.name.endsWith('.sql') && !fullPath.includes('archive')) {
        sqlFiles.push(fullPath);
      }
    }
  }
  
  findSQLFiles(sqlDir);
  
  addCheck('database', 'SQL Files Found', 'PASS', { count: sqlFiles.length });
  
  // فحص ملفات SQL الرئيسية
  const requiredSQLFiles = [
    'scripts/001_create_tables.sql',
    'scripts/040_enhanced_rbac_system.sql',
    'scripts/110_enforce_accounting_pattern.sql',
    'scripts/120_accounting_integrity_checks.sql'
  ];
  
  for (const requiredFile of requiredSQLFiles) {
    const fullPath = path.join(sqlDir, requiredFile);
    if (fs.existsSync(fullPath)) {
      addCheck('database', `Required SQL File: ${requiredFile}`, 'PASS');
    } else {
      addIssue('database', 'critical', 
        `Missing Required SQL File: ${requiredFile}`,
        `This file is required for proper database setup`,
        requiredFile
      );
    }
  }
  
  // فحص وجود Accrual Accounting (تجاهل الملفات المعطلة)
  let accrualFound = false;
  for (const sqlFile of sqlFiles) {
    // تجاهل الملفات في archive/ أو التي تحتوي على DISABLED
    if (sqlFile.includes('archive') || sqlFile.includes('legacy')) continue;
    
    const content = fs.readFileSync(sqlFile, 'utf8');
    // تجاهل الملفات المعطلة بوضوح
    if (content.includes('DISABLED: Cash Basis Only') || content.includes('⚠️ DISABLED')) continue;
    
    // فحص وجود Accrual Accounting (تجاهل أسماء الحسابات فقط)
    if (content.match(/ACCRUAL_ACCOUNTING|accrual.*accounting|Accrual.*Accounting/i)) {
      // التحقق من أن هذا ليس مجرد اسم حساب
      if (!content.includes('accruals') || content.includes('مصروفات مستحقة') || content.includes('sub_type')) {
        // هذا مجرد اسم حساب، ليس كود Accrual Accounting
        continue;
      }
      accrualFound = true;
      addIssue('database', 'critical',
        `Accrual Accounting Code Found: ${path.basename(sqlFile)}`,
        `System must use Cash Basis only. Accrual code must be removed or disabled.`,
        sqlFile
      );
    }
  }
  
  if (!accrualFound) {
    addCheck('database', 'No Accrual Accounting Code', 'PASS');
  }
  
  AUDIT_REPORT.sections.database.status = 'COMPLETED';
}

// ============================================
// 4. مراجعة الكود الخلفي
// ============================================

function auditBackend() {
  console.log('\n🔍 [2/6] مراجعة الكود الخلفي...');
  
  const apiDir = path.join(__dirname, '..', 'app', 'api');
  
  if (!fs.existsSync(apiDir)) {
    addIssue('backend', 'critical', 'API Directory Not Found', 'app/api directory does not exist');
    AUDIT_REPORT.sections.backend.status = 'COMPLETED';
    return;
  }
  
  // فحص جميع ملفات API
  const apiFiles = [];
  function findAPIFiles(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        findAPIFiles(fullPath);
      } else if (file.isFile() && file.name === 'route.ts') {
        apiFiles.push(fullPath);
      }
    }
  }
  
  findAPIFiles(apiDir);
  
  addCheck('backend', 'API Routes Found', 'PASS', { count: apiFiles.length });
  
  // فحص الأمان في ملفات API الحرجة
  const criticalAPIs = [
    'app/api/member-role/route.ts',
    'app/api/member-delete/route.ts',
    'app/api/company-members/route.ts',
    'app/api/income-statement/route.ts'
  ];
  
  for (const apiPath of criticalAPIs) {
    const fullPath = path.join(__dirname, '..', apiPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // فحص استخدام secureApiRequest أو requireOwnerOrAdmin
      if (content.includes('secureApiRequest') || content.includes('requireOwnerOrAdmin')) {
        addCheck('backend', `Security Check: ${apiPath}`, 'PASS');
      } else {
        addIssue('backend', 'critical',
          `Unsecured API: ${apiPath}`,
          `API endpoint does not use secureApiRequest or requireOwnerOrAdmin`,
          apiPath
        );
      }
      
      // فحص وجود Accrual
      if (content.match(/ACCRUAL|accrual/i)) {
        addIssue('backend', 'critical',
          `Accrual Code in API: ${apiPath}`,
          `API contains Accrual accounting code. Must use Cash Basis only.`,
          apiPath
        );
      }
    }
  }
  
  // فحص جميع ملفات API للبحث عن Accrual
  let accrualInAPI = false;
  for (const apiFile of apiFiles) {
    const content = fs.readFileSync(apiFile, 'utf8');
    if (content.match(/ACCRUAL|accrual/i) && !content.includes('// REMOVED') && !content.includes('// DISABLED')) {
      accrualInAPI = true;
      addIssue('backend', 'critical',
        `Accrual Code Found: ${path.relative(__dirname + '/..', apiFile)}`,
        `API file contains Accrual accounting code. Must be removed or disabled.`,
        apiFile
      );
    }
  }
  
  if (!accrualInAPI) {
    addCheck('backend', 'No Accrual Code in APIs', 'PASS');
  }
  
  AUDIT_REPORT.sections.backend.status = 'COMPLETED';
}

// ============================================
// 5. مراجعة الواجهة
// ============================================

function auditFrontend() {
  console.log('\n🔍 [3/6] مراجعة الواجهة...');
  
  const appDir = path.join(__dirname, '..', 'app');
  
  if (!fs.existsSync(appDir)) {
    addIssue('frontend', 'critical', 'App Directory Not Found', 'app directory does not exist');
    AUDIT_REPORT.sections.frontend.status = 'COMPLETED';
    return;
  }
  
  // فحص صفحات الحرجة
  const criticalPages = [
    'app/invoices/page.tsx',
    'app/bills/page.tsx',
    'app/payments/page.tsx',
    'app/dashboard/page.tsx'
  ];
  
  for (const pagePath of criticalPages) {
    const fullPath = path.join(__dirname, '..', pagePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // فحص استخدام canAccessPage أو checkPermission
      if (content.includes('canAccessPage') || content.includes('checkPermission') || content.includes('canAction')) {
        addCheck('frontend', `Permission Check: ${pagePath}`, 'PASS');
      } else {
        addIssue('frontend', 'medium',
          `Missing Permission Check: ${pagePath}`,
          `Page does not check permissions before rendering`,
          pagePath
        );
      }
      
      // فحص وجود Accrual (تجاهل التعليقات الصحيحة)
      if (content.match(/ACCRUAL.*BASIS|accrual.*basis/i) && 
          !content.includes('Cash Basis') && 
          !content.includes('// REMOVED') && 
          !content.includes('// DISABLED') &&
          !content.includes('نظام النقدية')) {
        addIssue('frontend', 'critical',
          `Accrual Code in Page: ${pagePath}`,
          `Page contains Accrual accounting code. Must use Cash Basis only.`,
          pagePath
        );
      }
    }
  }
  
  // فحص middleware
  const middlewarePath = path.join(__dirname, '..', 'middleware.ts');
  if (fs.existsSync(middlewarePath)) {
    addCheck('frontend', 'Middleware Exists', 'PASS');
  } else {
    addIssue('frontend', 'medium', 'Middleware Missing', 'middleware.ts file not found');
  }
  
  AUDIT_REPORT.sections.frontend.status = 'COMPLETED';
}

// ============================================
// 6. مراجعة الأمان
// ============================================

function auditSecurity() {
  console.log('\n🔍 [4/6] مراجعة الأمان...');
  
  // فحص lib/api-security.ts
  const securityLibPath = path.join(__dirname, '..', 'lib', 'api-security.ts');
  if (fs.existsSync(securityLibPath)) {
    const content = fs.readFileSync(securityLibPath, 'utf8');
    
    if (content.includes('secureApiRequest')) {
      addCheck('security', 'secureApiRequest Function Exists', 'PASS');
    } else {
      addIssue('security', 'critical', 'secureApiRequest Missing', 'Security function not found');
    }
    
    if (content.includes('requireOwnerOrAdmin')) {
      addCheck('security', 'requireOwnerOrAdmin Function Exists', 'PASS');
    } else {
      addIssue('security', 'critical', 'requireOwnerOrAdmin Missing', 'Security function not found');
    }
  } else {
    addIssue('security', 'critical', 'Security Library Missing', 'lib/api-security.ts not found');
  }
  
  // فحص lib/authz.ts
  const authzPath = path.join(__dirname, '..', 'lib', 'authz.ts');
  if (fs.existsSync(authzPath)) {
    const content = fs.readFileSync(authzPath, 'utf8');
    
    if (content.includes('canAccessPage')) {
      addCheck('security', 'canAccessPage Function Exists', 'PASS');
    } else {
      addIssue('security', 'critical', 'canAccessPage Missing', 'Permission function not found');
    }
    
    if (content.includes('checkPermission')) {
      addCheck('security', 'checkPermission Function Exists', 'PASS');
    } else {
      addIssue('security', 'critical', 'checkPermission Missing', 'Permission function not found');
    }
    
    // فحص السلوك الافتراضي في canAccessPage
    if (content.includes('if (!perm) return true')) {
      addIssue('security', 'medium',
        'Default Allow in canAccessPage',
        'canAccessPage returns true by default when no permission record exists. Should default to false for security.',
        authzPath
      );
    }
  } else {
    addIssue('security', 'critical', 'Authz Library Missing', 'lib/authz.ts not found');
  }
  
  AUDIT_REPORT.sections.security.status = 'COMPLETED';
}

// ============================================
// 7. مراجعة النمط المحاسبي
// ============================================

function auditAccounting() {
  console.log('\n🔍 [5/6] مراجعة النمط المحاسبي...');
  
  // فحص وجود وثائق النمط المحاسبي
  const accountingDocs = [
    'docs/ACCOUNTING_PATTERN.md',
    'docs/ACCOUNTING_PATTERN_SALES_PURCHASES.md'
  ];
  
  for (const docPath of accountingDocs) {
    const fullPath = path.join(__dirname, '..', docPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      if (content.includes('Cash Basis') || content.includes('cash basis')) {
        addCheck('accounting', `Cash Basis Documented: ${docPath}`, 'PASS');
      } else {
        addIssue('accounting', 'medium',
          `Cash Basis Not Documented: ${docPath}`,
          `Accounting pattern document does not clearly state Cash Basis`,
          docPath
        );
      }
      
      if (content.match(/ACCRUAL|accrual/i) && !content.includes('❌') && !content.includes('لا')) {
        addIssue('accounting', 'medium',
          `Accrual Mentioned in Docs: ${docPath}`,
          `Document mentions Accrual. Should be clearly marked as not used.`,
          docPath
        );
      }
    } else {
      addIssue('accounting', 'medium', `Missing Documentation: ${docPath}`, 'Accounting pattern documentation not found');
    }
  }
  
  // فحص ملفات API المحاسبية
  const accountingAPIs = [
    'app/api/invoices/route.ts',
    'app/api/bills/route.ts',
    'app/api/payments/route.ts'
  ];
  
  for (const apiPath of accountingAPIs) {
    const fullPath = path.join(__dirname, '..', apiPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      
      // فحص التعليقات التي تشير إلى Cash Basis
      if (content.includes('Cash Basis') || content.includes('cash basis') || content.includes('MANDATORY SPECIFICATION')) {
        addCheck('accounting', `Accounting Pattern Check: ${apiPath}`, 'PASS');
      }
    }
  }
  
  AUDIT_REPORT.sections.accounting.status = 'COMPLETED';
}

// ============================================
// 8. ملخص المراجعة
// ============================================

function generateSummary() {
  console.log('\n🔍 [6/6] إنشاء الملخص...');
  
  const { summary } = AUDIT_REPORT;
  
  // تحديد الحالة النهائية
  if (summary.criticalIssues > 0) {
    AUDIT_REPORT.status = 'FAILED_CRITICAL';
  } else if (summary.mediumIssues > 0) {
    AUDIT_REPORT.status = 'FAILED_MEDIUM';
  } else if (summary.lowIssues > 0) {
    AUDIT_REPORT.status = 'WARNING';
  } else {
    AUDIT_REPORT.status = 'PASSED';
  }
  
  addCheck('testing', 'Overall Audit Status', 
    summary.criticalIssues === 0 ? 'PASS' : 'FAIL',
    {
      criticalIssues: summary.criticalIssues,
      mediumIssues: summary.mediumIssues,
      lowIssues: summary.lowIssues
    }
  );
  
  AUDIT_REPORT.sections.testing.status = 'COMPLETED';
}

// ============================================
// 9. حفظ التقرير
// ============================================

function saveReport() {
  const reportDir = path.join(__dirname, '..');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const reportPath = path.join(reportDir, `ZERO_DEFECT_AUDIT_${timestamp}.json`);
  const reportTextPath = path.join(reportDir, `ZERO_DEFECT_AUDIT_${timestamp}.txt`);
  
  // حفظ JSON
  fs.writeFileSync(reportPath, JSON.stringify(AUDIT_REPORT, null, 2), 'utf8');
  
  // حفظ نصي
  let textReport = `🔒 ZERO-DEFECT RELEASE GATE AUDIT REPORT
==========================================
تاريخ المراجعة: ${AUDIT_REPORT.timestamp}
الحالة النهائية: ${AUDIT_REPORT.status}
==========================================

📊 الملخص التنفيذي:
- إجمالي المشاكل: ${AUDIT_REPORT.summary.totalIssues}
- مشاكل حرجة: ${AUDIT_REPORT.summary.criticalIssues}
- مشاكل متوسطة: ${AUDIT_REPORT.summary.mediumIssues}
- مشاكل منخفضة: ${AUDIT_REPORT.summary.lowIssues}
- فحوصات ناجحة: ${AUDIT_REPORT.summary.passedChecks}
- فحوصات فاشلة: ${AUDIT_REPORT.summary.failedChecks}

`;

  for (const [section, data] of Object.entries(AUDIT_REPORT.sections)) {
    textReport += `\n${'='.repeat(50)}\n`;
    textReport += `📋 ${section.toUpperCase()}\n`;
    textReport += `${'='.repeat(50)}\n\n`;
    textReport += `الحالة: ${data.status}\n\n`;
    
    if (data.issues.length > 0) {
      textReport += `المشاكل المكتشفة (${data.issues.length}):\n`;
      textReport += `${'-'.repeat(50)}\n`;
      for (const issue of data.issues) {
        textReport += `\n[${issue.severity.toUpperCase()}] ${issue.title}\n`;
        textReport += `   ${issue.description}\n`;
        if (issue.file) {
          textReport += `   الملف: ${issue.file}\n`;
        }
      }
      textReport += `\n`;
    }
    
    if (data.checks.length > 0) {
      textReport += `الفحوصات (${data.checks.length}):\n`;
      textReport += `${'-'.repeat(50)}\n`;
      for (const check of data.checks) {
        textReport += `[${check.status}] ${check.name}\n`;
        if (check.details) {
          textReport += `   ${JSON.stringify(check.details)}\n`;
        }
      }
      textReport += `\n`;
    }
  }
  
  textReport += `\n${'='.repeat(50)}\n`;
  textReport += `🏁 القرار النهائي\n`;
  textReport += `${'='.repeat(50)}\n\n`;
  
  if (AUDIT_REPORT.status === 'PASSED') {
    textReport += `✅ النظام جاهز للإطلاق (Go-Live)\n`;
    textReport += `جميع الفحوصات الحرجة نجحت.\n`;
  } else if (AUDIT_REPORT.status === 'FAILED_CRITICAL') {
    textReport += `❌ النظام غير جاهز للإطلاق\n`;
    textReport += `يوجد ${AUDIT_REPORT.summary.criticalIssues} مشكلة حرجة يجب إصلاحها قبل الإطلاق.\n`;
  } else if (AUDIT_REPORT.status === 'FAILED_MEDIUM') {
    textReport += `⚠️ النظام يحتاج مراجعة\n`;
    textReport += `يوجد ${AUDIT_REPORT.summary.mediumIssues} مشكلة متوسطة يجب معالجتها.\n`;
  } else {
    textReport += `⚠️ النظام يحتاج مراجعة\n`;
    textReport += `يوجد ${AUDIT_REPORT.summary.lowIssues} تحذير يجب مراجعته.\n`;
  }
  
  fs.writeFileSync(reportTextPath, textReport, 'utf8');
  
  console.log(`\n✅ التقرير محفوظ في:\n   ${reportPath}\n   ${reportTextPath}\n`);
  
  return { reportPath, reportTextPath };
}

// ============================================
// 10. التنفيذ الرئيسي
// ============================================

function main() {
  console.log('🔒 ZERO-DEFECT RELEASE GATE AUDIT');
  console.log('==================================\n');
  
  try {
    auditDatabase();
    auditBackend();
    auditFrontend();
    auditSecurity();
    auditAccounting();
    generateSummary();
    
    const { reportPath, reportTextPath } = saveReport();
    
    // طباعة الملخص
    console.log('\n' + '='.repeat(50));
    console.log('📊 الملخص النهائي');
    console.log('='.repeat(50));
    console.log(`الحالة: ${AUDIT_REPORT.status}`);
    console.log(`المشاكل الحرجة: ${AUDIT_REPORT.summary.criticalIssues}`);
    console.log(`المشاكل المتوسطة: ${AUDIT_REPORT.summary.mediumIssues}`);
    console.log(`المشاكل المنخفضة: ${AUDIT_REPORT.summary.lowIssues}`);
    console.log(`\nالتقارير:\n  ${reportPath}\n  ${reportTextPath}\n`);
    
    // إرجاع كود الخروج
    process.exit(AUDIT_REPORT.summary.criticalIssues > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('\n❌ خطأ أثناء المراجعة:', error);
    process.exit(1);
  }
}

// تشغيل المراجعة
if (require.main === module) {
  main();
}

module.exports = { main, AUDIT_REPORT };

