#!/usr/bin/env node
/**
 * سكريبت إنشاء حساب AR لـ VitaSlims
 * Create AR Account for VitaSlims Script
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// قراءة ملف .env.local
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌ خطأ: لم يتم العثور على ملف .env.local');
    process.exit(1);
  }
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');
  
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').trim();
      if (key && value) {
        process.env[key.trim()] = value.replace(/^["']|["']$/g, '');
      }
    }
  });
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ خطأ: لم يتم العثور على بيانات Supabase');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('\n🔧 إنشاء حساب AR لـ VitaSlims...');
  console.log('🔧 Creating AR Account for VitaSlims...\n');
  
  try {
    // 1. جلب معرف شركة VitaSlims
    console.log('1️⃣ البحث عن شركة VitaSlims...');
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name')
      .eq('name', 'VitaSlims')
      .single();
    
    if (companyError || !company) {
      console.error('❌ خطأ: لم يتم العثور على شركة VitaSlims');
      console.error(companyError);
      process.exit(1);
    }
    
    console.log(`✅ تم العثور على الشركة: ${company.name}`);
    console.log(`   Company ID: ${company.id}\n`);
    
    // 2. التحقق من وجود حساب AR
    console.log('2️⃣ التحقق من وجود حساب AR...');
    const { data: existingAR, error: checkError } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_code')
      .eq('company_id', company.id)
      .eq('sub_type', 'accounts_receivable')
      .eq('is_active', true)
      .maybeSingle();
    
    if (existingAR) {
      console.log('✅ حساب AR موجود بالفعل!');
      console.log('✅ AR Account already exists!');
      console.log(`   Account ID: ${existingAR.id}`);
      console.log(`   Account Code: ${existingAR.account_code}`);
      console.log(`   Account Name: ${existingAR.account_name}\n`);
      return;
    }
    
    console.log('⚠️  حساب AR غير موجود، سيتم إنشاؤه...\n');
    
    // 3. إنشاء حساب AR
    console.log('3️⃣ إنشاء حساب AR...');
    const { data: newAR, error: createError } = await supabase
      .from('chart_of_accounts')
      .insert({
        company_id: company.id,
        account_name: 'العملاء',
        account_code: '1130',
        account_type: 'asset',
        sub_type: 'accounts_receivable',
        is_active: true,
        currency_code: 'EGP',
        description: 'حساب الذمم المدينة - تم إنشاؤه تلقائياً بواسطة سكريبت الإصلاح',
      })
      .select()
      .single();
    
    if (createError) {
      console.error('❌ خطأ في إنشاء حساب AR:');
      console.error(createError);
      process.exit(1);
    }
    
    console.log('✅ تم إنشاء حساب AR بنجاح!');
    console.log('✅ AR Account created successfully!');
    console.log(`   Account ID: ${newAR.id}`);
    console.log(`   Account Code: ${newAR.account_code}`);
    console.log(`   Account Name: ${newAR.account_name}`);
    console.log(`   Account Type: ${newAR.account_type}`);
    console.log(`   Sub Type: ${newAR.sub_type}`);
    console.log(`   Currency: ${newAR.currency_code}\n`);
    
    // 4. التحقق من النتيجة
    console.log('4️⃣ التحقق من النتيجة...');
    const { data: verification } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_code, sub_type')
      .eq('company_id', company.id)
      .eq('sub_type', 'accounts_receivable')
      .eq('is_active', true)
      .single();
    
    if (verification) {
      console.log('✅ تم التحقق بنجاح! الحساب موجود في قاعدة البيانات.');
      console.log('✅ Verification successful! Account exists in database.\n');
    }
    
    console.log('🎉 اكتمل الإصلاح بنجاح!');
    console.log('🎉 Fix completed successfully!');
    console.log('\n💡 الخطوة التالية: تشغيل المراجعة مرة أخرى');
    console.log('💡 Next step: Run the audit again');
    console.log('   node scripts/audit-company-data.js\n');
    
  } catch (error) {
    console.error('\n❌ خطأ غير متوقع:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();

