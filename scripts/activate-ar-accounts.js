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
    actions: []
  };
  
  // Get VitaSlims company
  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('name', 'VitaSlims')
    .single();
  
  report.company = company;
  
  // Get all AR accounts (active and inactive)
  const { data: arAccounts } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('company_id', company.id)
    .eq('sub_type', 'accounts_receivable')
    .order('account_code');
  
  report.ar_accounts_found = arAccounts;
  
  // Activate all AR accounts
  for (const account of arAccounts || []) {
    if (!account.is_active) {
      const { error } = await supabase
        .from('chart_of_accounts')
        .update({ is_active: true })
        .eq('id', account.id);
      
      report.actions.push({
        account_id: account.id,
        account_code: account.account_code,
        account_name: account.account_name,
        action: 'activated',
        success: !error,
        error: error?.message
      });
    } else {
      report.actions.push({
        account_id: account.id,
        account_code: account.account_code,
        account_name: account.account_name,
        action: 'already_active',
        success: true
      });
    }
  }
  
  // Verify the result
  const { data: activeAR } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, is_active')
    .eq('company_id', company.id)
    .eq('sub_type', 'accounts_receivable')
    .eq('is_active', true);
  
  report.active_ar_accounts = activeAR;
  report.success = activeAR && activeAR.length > 0;
  
  fs.writeFileSync('activate-ar-report.json', JSON.stringify(report, null, 2));
}

main();

