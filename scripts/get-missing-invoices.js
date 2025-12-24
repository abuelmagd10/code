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
    missing_invoices: []
  };
  
  // Get VitaSlims company
  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('name', 'VitaSlims')
    .single();
  
  report.company = company;
  
  // Get all invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      invoice_date,
      status,
      total_amount,
      subtotal,
      tax_amount,
      customer_id,
      customers (id, name)
    `)
    .eq('company_id', company.id)
    .not('status', 'in', '(draft,cancelled)')
    .order('invoice_date');
  
  report.total_invoices = invoices?.length || 0;
  
  // Check each invoice for journal entries
  for (const invoice of invoices || []) {
    const { data: je } = await supabase
      .from('journal_entries')
      .select('id, entry_number, entry_date')
      .eq('reference_id', invoice.id)
      .eq('reference_type', 'invoice')
      .eq('is_deleted', false)
      .maybeSingle();
    
    if (!je) {
      report.missing_invoices.push({
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        status: invoice.status,
        total_amount: invoice.total_amount,
        subtotal: invoice.subtotal,
        tax_amount: invoice.tax_amount,
        customer_id: invoice.customer_id,
        customer_name: invoice.customers?.name
      });
    }
  }
  
  report.missing_count = report.missing_invoices.length;
  report.percentage = report.total_invoices > 0 
    ? ((report.missing_count / report.total_invoices) * 100).toFixed(2) + '%'
    : '0%';
  
  fs.writeFileSync('missing-invoices-report.json', JSON.stringify(report, null, 2));
}

main();

