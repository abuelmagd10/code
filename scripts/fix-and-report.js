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
  const report = {
    timestamp: new Date().toISOString(),
    fixes: []
  };
  
  try {
    // Fix 1: Create AR account for VitaSlims
    report.fixes.push({ name: 'Create AR Account for VitaSlims', status: 'in_progress' });
    
    const { data: company } = await supabase
      .from('companies')
      .select('id, name')
      .eq('name', 'VitaSlims')
      .single();
    
    if (!company) {
      report.fixes[0].status = 'failed';
      report.fixes[0].error = 'Company not found';
      fs.writeFileSync('fix-report.json', JSON.stringify(report, null, 2));
      return;
    }
    
    report.fixes[0].company = { id: company.id, name: company.name };
    
    const { data: existingAR } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name')
      .eq('company_id', company.id)
      .eq('sub_type', 'accounts_receivable')
      .eq('is_active', true)
      .maybeSingle();
    
    if (existingAR) {
      report.fixes[0].status = 'already_exists';
      report.fixes[0].account = existingAR;
      fs.writeFileSync('fix-report.json', JSON.stringify(report, null, 2));
      return;
    }
    
    const { data: parent } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('company_id', company.id)
      .eq('account_code', '1100')
      .maybeSingle();
    
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
      report.fixes[0].status = 'failed';
      report.fixes[0].error = error.message;
    } else {
      report.fixes[0].status = 'success';
      report.fixes[0].account = newAR;
    }
    
  } catch (error) {
    report.error = error.message;
  }
  
  fs.writeFileSync('fix-report.json', JSON.stringify(report, null, 2));
  console.log('Report saved to fix-report.json');
}

main();

