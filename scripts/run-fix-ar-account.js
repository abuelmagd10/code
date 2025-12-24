#!/usr/bin/env node
/**
 * تنفيذ إصلاح حساب AR لـ VitaSlims
 * Execute AR Account Fix for VitaSlims
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
  console.log('\n' + '='.repeat(80));
  console.log('🔧 إصلاح حساب AR لـ VitaSlims');
  console.log('🔧 Fix AR Account for VitaSlims');
  console.log('='.repeat(80) + '\n');
  
  try {
    // 1. جلب معرف شركة VitaSlims
    console.log('1️⃣ البحث عن شركة VitaSlims...');
    console.log('1️⃣ Looking for VitaSlims company...');
    
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name, created_at')
      .eq('name', 'VitaSlims')
      .single();
    
    if (companyError || !company) {
      console.error('\n❌ خطأ: لم يتم العثور على شركة VitaSlims');
      console.error('❌ Error: VitaSlims company not found');
      if (companyError) console.error(companyError);
      process.exit(1);
    }
    
    console.log(`\n✅ تم العثور على الشركة`);
    console.log(`✅ Company found`);
    console.log(`   الاسم / Name: ${company.name}`);
    console.log(`   المعرف / ID: ${company.id}`);
    console.log(`   تاريخ الإنشاء / Created: ${new Date(company.created_at).toLocaleDateString('ar-EG')}`);
    
    // 2. التحقق من وجود حساب AR
    console.log('\n2️⃣ التحقق من وجود حساب AR...');
    console.log('2️⃣ Checking for existing AR account...');
    
    const { data: existingAR, error: checkError } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_code, sub_type, is_active')
      .eq('company_id', company.id)
      .eq('sub_type', 'accounts_receivable')
      .eq('is_active', true)
      .maybeSingle();
    
    if (existingAR) {
      console.log('\n✅ حساب AR موجود بالفعل!');
      console.log('✅ AR Account already exists!');
      console.log(`   المعرف / ID: ${existingAR.id}`);
      console.log(`   الكود / Code: ${existingAR.account_code}`);
      console.log(`   الاسم / Name: ${existingAR.account_name}`);
      console.log(`   النوع الفرعي / Sub-type: ${existingAR.sub_type}`);
      console.log('\n💡 لا حاجة للإصلاح، الحساب موجود.');
      console.log('💡 No fix needed, account exists.\n');
      return true;
    }
    
    console.log('\n⚠️  حساب AR غير موجود، سيتم إنشاؤه الآن...');
    console.log('⚠️  AR account not found, creating now...');
    
    // 3. إنشاء حساب AR
    console.log('\n3️⃣ إنشاء حساب AR...');
    console.log('3️⃣ Creating AR account...');
    
    const { data: newAR, error: createError } = await supabase
      .from('chart_of_accounts')
      .insert({
        company_id: company.id,
        account_name: 'العملاء',
        account_code: '1130',
        account_type: 'asset',
        sub_type: 'accounts_receivable',
        normal_balance: 'debit',
        is_active: true,
        level: 3,
        description: 'حساب الذمم المدينة - تم إنشاؤه تلقائياً لتصحيح البيانات',
      })
      .select()
      .single();
    
    if (createError) {
      console.error('\n❌ خطأ في إنشاء حساب AR:');
      console.error('❌ Error creating AR account:');
      console.error(createError);
      process.exit(1);
    }
    
    console.log('\n✅ تم إنشاء حساب AR بنجاح!');
    console.log('✅ AR Account created successfully!');
    console.log(`   المعرف / ID: ${newAR.id}`);
    console.log(`   الكود / Code: ${newAR.account_code}`);
    console.log(`   الاسم / Name: ${newAR.account_name}`);
    console.log(`   النوع / Type: ${newAR.account_type}`);
    console.log(`   النوع الفرعي / Sub-type: ${newAR.sub_type}`);
    console.log(`   الرصيد الطبيعي / Normal Balance: ${newAR.normal_balance}`);
    
    // 4. التحقق من النتيجة
    console.log('\n4️⃣ التحقق من النتيجة...');
    console.log('4️⃣ Verifying result...');
    
    const { data: verification } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_code')
      .eq('company_id', company.id)
      .eq('sub_type', 'accounts_receivable')
      .eq('is_active', true)
      .single();
    
    if (verification) {
      console.log('\n✅ تم التحقق بنجاح! الحساب موجود في قاعدة البيانات.');
      console.log('✅ Verification successful! Account exists in database.');
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('🎉 اكتمل الإصلاح بنجاح!');
    console.log('🎉 Fix completed successfully!');
    console.log('='.repeat(80) + '\n');
    
    return true;
    
  } catch (error) {
    console.error('\n❌ خطأ غير متوقع:');
    console.error('❌ Unexpected error:');
    console.error(error.message);
    console.error(error);
    process.exit(1);
  }
}

main();

