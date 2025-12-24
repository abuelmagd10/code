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
    timestamp: new Date().toISOString()
  };
  
  // Get VitaSlims company
  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('name', 'VitaSlims')
    .single();
  
  report.company = company;
  
  // Activate sales account (4000)
  const { data: salesAccount, error } = await supabase
    .from('chart_of_accounts')
    .update({ is_active: true })
    .eq('company_id', company.id)
    .eq('account_code', '4000')
    .select()
    .single();
  
  if (error) {
    report.error = error.message;
    report.success = false;
  } else {
    report.sales_account = salesAccount;
    report.success = true;
  }
  
  fs.writeFileSync('activate-sales-report.json', JSON.stringify(report, null, 2));
}

main();

