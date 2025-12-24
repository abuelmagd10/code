const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  console.log('🔧 إنشاء حساب AR لـ VitaSlims...\n');
  
  // 1. Get company
  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('name', 'VitaSlims')
    .single();
  
  if (!company) {
    console.log('❌ الشركة غير موجودة');
    return;
  }
  
  console.log(`✅ الشركة: ${company.name}`);
  console.log(`   ID: ${company.id}\n`);
  
  // 2. Check AR account
  const { data: existingAR } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .eq('sub_type', 'accounts_receivable')
    .eq('is_active', true)
    .maybeSingle();
  
  if (existingAR) {
    console.log('✅ حساب AR موجود بالفعل!');
    console.log(`   ID: ${existingAR.id}`);
    console.log(`   Code: ${existingAR.account_code}`);
    console.log(`   Name: ${existingAR.account_name}\n`);
    return;
  }
  
  console.log('⚠️  حساب AR غير موجود، سيتم إنشاؤه...\n');
  
  // 3. Get parent account (1100)
  const { data: parent } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', company.id)
    .eq('account_code', '1100')
    .maybeSingle();
  
  // 4. Create AR account
  const { data: newAR, error } = await supabase
    .from('chart_of_accounts')
    .insert({
      company_id: company.id,
      account_name: 'العملاء',
      account_code: '1130',
      account_type: 'asset',
      sub_type: 'accounts_receivable',
      normal_balance: 'debit',
      parent_id: parent?.id || null,
      level: 3,
      is_active: true,
      description: 'حساب الذمم المدينة - تم إنشاؤه تلقائياً',
    })
    .select()
    .single();
  
  if (error) {
    console.log('❌ خطأ:', error.message);
    return;
  }
  
  console.log('✅ تم إنشاء حساب AR بنجاح!');
  console.log(`   ID: ${newAR.id}`);
  console.log(`   Code: ${newAR.account_code}`);
  console.log(`   Name: ${newAR.account_name}`);
  console.log(`   Type: ${newAR.account_type}`);
  console.log(`   Sub-type: ${newAR.sub_type}\n`);
  
  console.log('🎉 اكتمل الإصلاح بنجاح!\n');
}

main().catch(console.error);

