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
  
  // Find all revenue accounts
  const { data: revenueAccounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type, sub_type, is_active')
    .eq('company_id', company.id)
    .eq('account_type', 'revenue')
    .order('account_code');
  
  report.revenue_accounts = revenueAccounts;
  
  // Find accounts with code starting with 4
  const { data: code4Accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type, sub_type, is_active')
    .eq('company_id', company.id)
    .like('account_code', '4%')
    .order('account_code');
  
  report.code_4_accounts = code4Accounts;
  
  // Find all account types
  const { data: allAccounts } = await supabase
    .from('chart_of_accounts')
    .select('account_type, sub_type, count')
    .eq('company_id', company.id);
  
  // Group by type
  const typeGroups = {};
  for (const acc of allAccounts || []) {
    const key = `${acc.account_type}`;
    if (!typeGroups[key]) {
      typeGroups[key] = [];
    }
    typeGroups[key].push(acc.sub_type);
  }
  
  report.account_types = typeGroups;
  
  fs.writeFileSync('revenue-accounts-report.json', JSON.stringify(report, null, 2));
}

main();

