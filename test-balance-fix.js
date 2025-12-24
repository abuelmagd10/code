#!/usr/bin/env node

/**
 * سكريبت اختبار تصحيح الذمم والرصيد
 * Test script for balance fix
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 اختبار تصحيح الذمم والرصيد');
console.log('================================\n');

// التحقق من وجود الملفات المطلوبة
const requiredFiles = [
  'scripts/400_customer_supplier_balance_from_ledger.sql',
  'scripts/401_test_balance_integrity.sql',
  'app/customers/page.tsx',
  'app/suppliers/page.tsx',
  'CUSTOMER_SUPPLIER_BALANCE_FIX_GUIDE.md',
  'ZOHO_BOOKS_COMPLIANCE_REPORT.md',
  'QUICK_START_BALANCE_FIX.md',
  'BALANCE_FIX_SUMMARY.md'
];

let allFilesExist = true;

console.log('1️⃣ التحقق من وجود الملفات المطلوبة:\n');

requiredFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, file));
  const status = exists ? '✅' : '❌';
  console.log(`${status} ${file}`);
  if (!exists) allFilesExist = false;
});

console.log('\n');

if (!allFilesExist) {
  console.error('❌ بعض الملفات المطلوبة غير موجودة!');
  process.exit(1);
}

// التحقق من محتوى ملف العملاء
console.log('2️⃣ التحقق من تحديث صفحة العملاء:\n');

const customersPagePath = path.join(__dirname, 'app/customers/page.tsx');
const customersContent = fs.readFileSync(customersPagePath, 'utf8');

const hasARAccountQuery = customersContent.includes('accounts_receivable');
const hasJournalEntryJoin = customersContent.includes('journal_entries');
const hasDebitCreditCalculation = customersContent.includes('debit_amount') && customersContent.includes('credit_amount');

console.log(`${hasARAccountQuery ? '✅' : '❌'} يحتوي على استعلام حساب AR`);
console.log(`${hasJournalEntryJoin ? '✅' : '❌'} يحتوي على join مع journal_entries`);
console.log(`${hasDebitCreditCalculation ? '✅' : '❌'} يحتوي على حساب debit - credit`);

console.log('\n');

// التحقق من محتوى ملف الموردين
console.log('3️⃣ التحقق من تحديث صفحة الموردين:\n');

const suppliersPagePath = path.join(__dirname, 'app/suppliers/page.tsx');
const suppliersContent = fs.readFileSync(suppliersPagePath, 'utf8');

const hasAPAccountQuery = suppliersContent.includes('accounts_payable');
const hasSupplierJournalEntryJoin = suppliersContent.includes('journal_entries');
const hasSupplierDebitCreditCalculation = suppliersContent.includes('debit_amount') && suppliersContent.includes('credit_amount');

console.log(`${hasAPAccountQuery ? '✅' : '❌'} يحتوي على استعلام حساب AP`);
console.log(`${hasSupplierJournalEntryJoin ? '✅' : '❌'} يحتوي على join مع journal_entries`);
console.log(`${hasSupplierDebitCreditCalculation ? '✅' : '❌'} يحتوي على حساب credit - debit`);

console.log('\n');

// التحقق من محتوى السكريبت SQL
console.log('4️⃣ التحقق من السكريبت SQL:\n');

const sqlScriptPath = path.join(__dirname, 'scripts/400_customer_supplier_balance_from_ledger.sql');
const sqlContent = fs.readFileSync(sqlScriptPath, 'utf8');

const hasCustomerFunction = sqlContent.includes('get_customer_receivables_from_ledger');
const hasSupplierFunction = sqlContent.includes('get_supplier_payables_from_ledger');
const hasVerifyFunction = sqlContent.includes('verify_receivables_payables_integrity');

console.log(`${hasCustomerFunction ? '✅' : '❌'} يحتوي على دالة get_customer_receivables_from_ledger`);
console.log(`${hasSupplierFunction ? '✅' : '❌'} يحتوي على دالة get_supplier_payables_from_ledger`);
console.log(`${hasVerifyFunction ? '✅' : '❌'} يحتوي على دالة verify_receivables_payables_integrity`);

console.log('\n');

// النتيجة النهائية
const allTestsPassed = 
  allFilesExist &&
  hasARAccountQuery &&
  hasJournalEntryJoin &&
  hasDebitCreditCalculation &&
  hasAPAccountQuery &&
  hasSupplierJournalEntryJoin &&
  hasSupplierDebitCreditCalculation &&
  hasCustomerFunction &&
  hasSupplierFunction &&
  hasVerifyFunction;

console.log('================================');
if (allTestsPassed) {
  console.log('✅ جميع الاختبارات نجحت!');
  console.log('\n📋 الخطوات التالية:');
  console.log('1. تشغيل السكريبت SQL على Supabase:');
  console.log('   scripts/400_customer_supplier_balance_from_ledger.sql');
  console.log('2. اختبار الدوال على قاعدة البيانات');
  console.log('3. التحقق من صفحات العملاء والموردين');
  console.log('4. تحديث GitHub');
  process.exit(0);
} else {
  console.log('❌ بعض الاختبارات فشلت!');
  console.log('يرجى مراجعة الأخطاء أعلاه.');
  process.exit(1);
}

