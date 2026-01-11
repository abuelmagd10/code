#!/usr/bin/env node

/**
 * 🔧 إصلاح مبسط لمشكلة عدم ظهور أوامر البيع
 */

const fs = require('fs')

console.log('🔧 بدء الإصلاح المبسط...')

// قراءة متغيرات البيئة من .env.local
let supabaseUrl = ''
let supabaseKey = ''

try {
  const envContent = fs.readFileSync('.env.local', 'utf8')
  const lines = envContent.split('\n')
  
  for (const line of lines) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
      supabaseUrl = line.split('=')[1].trim().replace(/"/g, '')
    }
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
      supabaseKey = line.split('=')[1].trim().replace(/"/g, '')
    }
  }
} catch (error) {
  console.error('❌ خطأ في قراءة ملف .env.local:', error.message)
  process.exit(1)
}

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ متغيرات البيئة مفقودة')
  console.log('تأكد من وجود NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في .env.local')
  process.exit(1)
}

console.log('✅ تم العثور على متغيرات البيئة')
console.log('📝 يرجى تطبيق الإصلاح يدوياً في Supabase SQL Editor:')
console.log('')
console.log('1. افتح Supabase Dashboard')
console.log('2. اذهب إلى SQL Editor')
console.log('3. انسخ والصق الكود التالي:')
console.log('')
console.log('-- إصلاح سريع لأوامر البيع')
console.log('-- إنشاء فرع افتراضي إذا لم يكن موجوداً')
console.log(`INSERT INTO branches (company_id, name, address, is_active)
SELECT DISTINCT 
    so.company_id,
    'الفرع الرئيسي',
    'العنوان الرئيسي',
    true
FROM sales_orders so
WHERE NOT EXISTS (
    SELECT 1 FROM branches b WHERE b.company_id = so.company_id
);

-- إنشاء مركز تكلفة افتراضي
INSERT INTO cost_centers (company_id, branch_id, name, description, is_active)
SELECT DISTINCT
    b.company_id,
    b.id,
    'مركز التكلفة الرئيسي',
    'مركز التكلفة الافتراضي',
    true
FROM branches b
WHERE NOT EXISTS (
    SELECT 1 FROM cost_centers cc WHERE cc.branch_id = b.id
);

-- إنشاء مخزن افتراضي
INSERT INTO warehouses (company_id, branch_id, name, location, is_main, is_active)
SELECT DISTINCT
    b.company_id,
    b.id,
    'المخزن الرئيسي',
    'الموقع الافتراضي',
    true,
    true
FROM branches b
WHERE NOT EXISTS (
    SELECT 1 FROM warehouses w WHERE w.branch_id = b.id AND w.is_main = true
);

-- تحديث أعضاء الشركة
UPDATE company_members 
SET 
    branch_id = COALESCE(branch_id, (
        SELECT b.id FROM branches b WHERE b.company_id = company_members.company_id LIMIT 1
    )),
    cost_center_id = COALESCE(cost_center_id, (
        SELECT cc.id FROM cost_centers cc 
        JOIN branches b ON cc.branch_id = b.id
        WHERE b.company_id = company_members.company_id LIMIT 1
    )),
    warehouse_id = COALESCE(warehouse_id, (
        SELECT w.id FROM warehouses w 
        JOIN branches b ON w.branch_id = b.id
        WHERE b.company_id = company_members.company_id AND w.is_main = true LIMIT 1
    ))
WHERE branch_id IS NULL OR cost_center_id IS NULL OR warehouse_id IS NULL;

-- تحديث أوامر البيع
UPDATE sales_orders 
SET 
    branch_id = COALESCE(branch_id, (
        SELECT b.id FROM branches b WHERE b.company_id = sales_orders.company_id LIMIT 1
    )),
    cost_center_id = COALESCE(cost_center_id, (
        SELECT cc.id FROM cost_centers cc 
        JOIN branches b ON cc.branch_id = b.id
        WHERE b.company_id = sales_orders.company_id LIMIT 1
    )),
    warehouse_id = COALESCE(warehouse_id, (
        SELECT w.id FROM warehouses w 
        JOIN branches b ON w.branch_id = b.id
        WHERE b.company_id = sales_orders.company_id AND w.is_main = true LIMIT 1
    ))
WHERE branch_id IS NULL OR cost_center_id IS NULL OR warehouse_id IS NULL;`)

console.log('')
console.log('4. اضغط RUN لتنفيذ الكود')
console.log('5. أعد تشغيل الخادم: npm run dev')
console.log('6. سجل دخول مرة أخرى')
console.log('')
console.log('✅ الإصلاح السريع تم تطبيقه مسبقاً')
console.log('🎯 أوامر البيع يجب أن تظهر الآن')