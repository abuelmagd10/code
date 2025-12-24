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
  const report = {};
  
  // Get VitaSlims company
  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('name', 'VitaSlims')
    .single();
  
  report.company = company;
  
  // Check for AR account with code 1130
  const { data: arByCode } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('company_id', company.id)
    .eq('account_code', '1130');
  
  report.ar_by_code = arByCode;
  
  // Check for AR account by sub_type
  const { data: arBySubType } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('company_id', company.id)
    .eq('sub_type', 'accounts_receivable');
  
  report.ar_by_subtype = arBySubType;
  
  // Check all accounts for VitaSlims
  const { data: allAccounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type, sub_type, is_active')
    .eq('company_id', company.id)
    .order('account_code');
  
  report.all_accounts_count = allAccounts?.length || 0;
  report.sample_accounts = allAccounts?.slice(0, 10);
  
  fs.writeFileSync('ar-check-report.json', JSON.stringify(report, null, 2));
}

main();

