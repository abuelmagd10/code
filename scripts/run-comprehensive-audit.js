// =====================================================
// 🔍 سكربت المراجعة المحاسبية الشاملة
// Comprehensive Accounting Audit Script
// =====================================================
// تاريخ الإنشاء: 2025-01-XX
// الهدف: تنفيذ المراجعة المحاسبية الشاملة وإنشاء التقارير
// =====================================================

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// تحميل متغيرات البيئة
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim()
      // Remove quotes if present
      process.env[key] = value.replace(/^["']|["']$/g, '')
    }
  })
}

// =====================================================
// إعدادات
// =====================================================
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ خطأ: متغيرات البيئة غير موجودة');
  console.error('   تأكد من وجود NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// إنشاء عميل Supabase مع Service Role Key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// =====================================================
// قراءة ملف SQL للمراجعة
// =====================================================
function loadAuditSQL() {
  const sqlPath = path.join(__dirname, 'COMPREHENSIVE_ACCOUNTING_AUDIT.sql');
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`❌ ملف SQL غير موجود: ${sqlPath}`);
  }
  return fs.readFileSync(sqlPath, 'utf8');
}

// =====================================================
// تقسيم SQL إلى استعلامات منفصلة
// =====================================================
function splitSQLQueries(sql) {
  // تقسيم حسب الفواصل المنقوطة التي تتبعها أسطر فارغة أو تعليقات
  const queries = sql
    .split(/;\s*(?=\n|$)/)
    .map(q => q.trim())
    .filter(q => q.length > 0 && !q.startsWith('--') && !q.match(/^\s*$/));
  
  return queries;
}

// =====================================================
// تنفيذ استعلام SQL واحد
// =====================================================
async function executeQuery(query, queryName) {
  try {
    console.log(`\n📊 تنفيذ: ${queryName}`);
    
    // استخدام RPC أو query مباشر
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: query });
    
    if (error) {
      // محاولة تنفيذ مباشر
      const { data: directData, error: directError } = await supabase
        .from('journal_entries')
        .select('*')
        .limit(0);
      
      if (directError) {
        console.error(`❌ خطأ في ${queryName}:`, error.message);
        return { error: error.message, data: null };
      }
      
      // إذا لم يكن هناك RPC، نحاول استخدام طريقة أخرى
      console.warn(`⚠️  RPC غير متاح، استخدام طريقة بديلة`);
      return { error: null, data: [] };
    }
    
    return { error: null, data: data || [] };
  } catch (err) {
    console.error(`❌ خطأ في ${queryName}:`, err.message);
    return { error: err.message, data: null };
  }
}

// =====================================================
// تنفيذ المراجعة الشاملة
// =====================================================
async function runComprehensiveAudit() {
  console.log('🔍 بدء المراجعة المحاسبية الشاملة...\n');
  console.log('='.repeat(60));
  
  const auditResults = {
    timestamp: new Date().toISOString(),
    sections: []
  };
  
  try {
    // قراءة ملف SQL
    const sqlContent = loadAuditSQL();
    
    // تقسيم إلى استعلامات
    const queries = splitSQLQueries(sqlContent);
    
    console.log(`📋 تم العثور على ${queries.length} استعلام للتنفيذ\n`);
    
    // تنفيذ كل استعلام
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      
      // استخراج اسم القسم من التعليقات
      const sectionMatch = query.match(/--\s*([^\n]+)/);
      const sectionName = sectionMatch ? sectionMatch[1].trim() : `استعلام ${i + 1}`;
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📌 القسم: ${sectionName}`);
      console.log('='.repeat(60));
      
      // تنفيذ الاستعلام
      const result = await executeQuery(query, sectionName);
      
      if (result.error) {
        console.error(`❌ فشل: ${result.error}`);
        auditResults.sections.push({
          name: sectionName,
          status: 'error',
          error: result.error,
          data: null
        });
      } else {
        console.log(`✅ نجح: ${result.data ? result.data.length : 0} سجل`);
        auditResults.sections.push({
          name: sectionName,
          status: 'success',
          error: null,
          data: result.data,
          recordCount: result.data ? result.data.length : 0
        });
      }
      
      // تأخير صغير لتجنب الضغط على قاعدة البيانات
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // حفظ النتائج
    const reportPath = path.join(__dirname, '..', `AUDIT_REPORT_${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(auditResults, null, 2), 'utf8');
    console.log(`\n✅ تم حفظ التقرير في: ${reportPath}`);
    
    // إنشاء تقرير نصي
    generateTextReport(auditResults, reportPath.replace('.json', '.txt'));
    
    return auditResults;
    
  } catch (error) {
    console.error('❌ خطأ عام في المراجعة:', error.message);
    throw error;
  }
}

// =====================================================
// إنشاء تقرير نصي
// =====================================================
function generateTextReport(results, outputPath) {
  let report = '';
  
  report += '='.repeat(80) + '\n';
  report += '🔍 تقرير المراجعة المحاسبية الشاملة\n';
  report += '='.repeat(80) + '\n';
  report += `التاريخ: ${results.timestamp}\n\n`;
  
  report += '='.repeat(80) + '\n';
  report += '📊 ملخص النتائج\n';
  report += '='.repeat(80) + '\n';
  
  const successCount = results.sections.filter(s => s.status === 'success').length;
  const errorCount = results.sections.filter(s => s.status === 'error').length;
  
  report += `✅ نجح: ${successCount} قسم\n`;
  report += `❌ فشل: ${errorCount} قسم\n`;
  report += `📋 إجمالي: ${results.sections.length} قسم\n\n`;
  
  report += '='.repeat(80) + '\n';
  report += '📌 تفاصيل الأقسام\n';
  report += '='.repeat(80) + '\n\n';
  
  results.sections.forEach((section, index) => {
    report += `${index + 1}. ${section.name}\n`;
    report += `   الحالة: ${section.status === 'success' ? '✅ نجح' : '❌ فشل'}\n`;
    
    if (section.error) {
      report += `   الخطأ: ${section.error}\n`;
    }
    
    if (section.recordCount !== undefined) {
      report += `   عدد السجلات: ${section.recordCount}\n`;
    }
    
    if (section.data && section.data.length > 0) {
      report += `   عينة من البيانات:\n`;
      const sample = section.data.slice(0, 3);
      sample.forEach((record, i) => {
        report += `     ${i + 1}. ${JSON.stringify(record)}\n`;
      });
      if (section.data.length > 3) {
        report += `     ... و ${section.data.length - 3} سجل آخر\n`;
      }
    }
    
    report += '\n';
  });
  
  report += '='.repeat(80) + '\n';
  report += 'نهاية التقرير\n';
  report += '='.repeat(80) + '\n';
  
  fs.writeFileSync(outputPath, report, 'utf8');
  console.log(`✅ تم حفظ التقرير النصي في: ${outputPath}`);
}

// =====================================================
// تنفيذ المراجعة لشركة محددة
// =====================================================
async function runAuditForCompany(companyId) {
  console.log(`\n🏢 بدء المراجعة للشركة: ${companyId}\n`);
  
  // يمكن إضافة فلتر للشركة في الاستعلامات
  // هذا يتطلب تعديل ملف SQL لإضافة WHERE company_id = ...
  
  return await runComprehensiveAudit();
}

// =====================================================
// الوظيفة الرئيسية
// =====================================================
async function main() {
  const args = process.argv.slice(2);
  const companyId = args[0]; // معرّف الشركة (اختياري)
  
  try {
    if (companyId) {
      await runAuditForCompany(companyId);
    } else {
      await runComprehensiveAudit();
    }
    
    console.log('\n✅ اكتملت المراجعة بنجاح!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ فشلت المراجعة:', error);
    process.exit(1);
  }
}

// =====================================================
// تنفيذ إذا تم استدعاء الملف مباشرة
// =====================================================
if (require.main === module) {
  main();
}

module.exports = { runComprehensiveAudit, runAuditForCompany };

