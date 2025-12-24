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
  console.log('Starting journal entry creation...');

  const report = {
    timestamp: new Date().toISOString(),
    created_entries: [],
    errors: []
  };

  // Get VitaSlims company
  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('name', 'VitaSlims')
    .single();

  console.log('Company:', company);
  
  report.company = company;
  
  // Get required accounts
  const { data: arAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .eq('account_code', '1130')
    .eq('is_active', true)
    .single();
  
  const { data: salesAccount } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name')
    .eq('company_id', company.id)
    .eq('sub_type', 'sales_revenue')
    .eq('is_active', true)
    .maybeSingle();
  
  report.accounts = {
    ar: arAccount,
    sales: salesAccount
  };
  
  if (!arAccount) {
    report.errors.push('AR account not found');
    fs.writeFileSync('create-je-report.json', JSON.stringify(report, null, 2));
    return;
  }
  
  if (!salesAccount) {
    report.errors.push('Sales account not found');
    fs.writeFileSync('create-je-report.json', JSON.stringify(report, null, 2));
    return;
  }
  
  // Read missing invoices
  const missingReport = JSON.parse(fs.readFileSync('missing-invoices-report.json', 'utf8'));
  
  // Get next JE number
  const { data: lastJE } = await supabase
    .from('journal_entries')
    .select('entry_number')
    .eq('company_id', company.id)
    .order('entry_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  let nextNumber = 1;
  if (lastJE && lastJE.entry_number) {
    const match = lastJE.entry_number.match(/\d+/);
    if (match) {
      nextNumber = parseInt(match[0]) + 1;
    }
  }
  
  report.starting_je_number = nextNumber;
  
  // Create journal entries for each invoice
  for (const invoice of missingReport.missing_invoices) { // Process all invoices
    try {
      const entryNumber = `JE-${String(nextNumber).padStart(4, '0')}`;
      
      // Create journal entry
      const { data: je, error: jeError } = await supabase
        .from('journal_entries')
        .insert({
          company_id: company.id,
          entry_number: entryNumber,
          entry_date: invoice.invoice_date,
          reference_type: 'invoice',
          reference_id: invoice.invoice_id,
          description: `قيد فاتورة ${invoice.invoice_number} - ${invoice.customer_name}`,
          is_deleted: false
        })
        .select()
        .single();
      
      if (jeError) {
        report.errors.push({
          invoice: invoice.invoice_number,
          error: jeError.message
        });
        continue;
      }
      
      // Create journal entry lines
      const lines = [
        {
          journal_entry_id: je.id,
          account_id: arAccount.id,
          debit_amount: invoice.total_amount,
          credit_amount: 0,
          description: `ذمم مدينة - ${invoice.customer_name}`
        },
        {
          journal_entry_id: je.id,
          account_id: salesAccount.id,
          debit_amount: 0,
          credit_amount: invoice.total_amount,
          description: `مبيعات - ${invoice.customer_name}`
        }
      ];
      
      const { error: linesError } = await supabase
        .from('journal_entry_lines')
        .insert(lines);
      
      if (linesError) {
        report.errors.push({
          invoice: invoice.invoice_number,
          je_id: je.id,
          error: linesError.message
        });
        continue;
      }
      
      report.created_entries.push({
        invoice_number: invoice.invoice_number,
        je_number: entryNumber,
        je_id: je.id,
        amount: invoice.total_amount
      });
      
      nextNumber++;
      
    } catch (error) {
      report.errors.push({
        invoice: invoice.invoice_number,
        error: error.message
      });
    }
  }
  
  report.success_count = report.created_entries.length;
  report.error_count = report.errors.length;

  console.log('Report:', JSON.stringify(report, null, 2));

  fs.writeFileSync('create-je-report.json', JSON.stringify(report, null, 2));
  console.log('Report saved to create-je-report.json');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

