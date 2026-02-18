/**
 * تطبيق حماية الدفعات السالبة على قاعدة البيانات
 * Apply negative payment protection to database
 * 
 * Usage: node scripts/apply-negative-payment-protection.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables. Check .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

const SQL_STEPS = [
  {
    name: 'Create protect function',
    sql: `
CREATE OR REPLACE FUNCTION public.prevent_negative_payment_invoice_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.amount < 0 AND NEW.invoice_id IS NOT NULL THEN
    NEW.invoice_id := NULL;
  END IF;
  RETURN NEW;
END;
$$`
  },
  {
    name: 'Drop old trigger',
    sql: `DROP TRIGGER IF EXISTS trg_prevent_negative_payment_invoice_link ON public.payments`
  },
  {
    name: 'Create protection trigger',
    sql: `
CREATE TRIGGER trg_prevent_negative_payment_invoice_link
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_negative_payment_invoice_link()`
  },
  {
    name: 'Update auto_create_payment_journal to skip negatives',
    sql: `
CREATE OR REPLACE FUNCTION public.auto_create_payment_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_journal_entry_id UUID;
  v_ar_account_id    UUID;
  v_ap_account_id    UUID;
  v_account_id       UUID;
BEGIN
  -- Skip negative payments (credit refunds/disbursements)
  IF NEW.amount < 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.invoice_id IS NOT NULL THEN
    SELECT id INTO v_ar_account_id
    FROM chart_of_accounts
    WHERE company_id = NEW.company_id
      AND (sub_type = 'accounts_receivable' OR account_name ILIKE '%receivable%')
    LIMIT 1;

    v_account_id := COALESCE(NEW.account_id, NULL);
    IF v_account_id IS NULL THEN
      SELECT id INTO v_account_id
      FROM chart_of_accounts
      WHERE company_id = NEW.company_id
        AND (sub_type = 'cash' OR sub_type = 'bank')
      LIMIT 1;
    END IF;

    IF v_ar_account_id IS NULL OR v_account_id IS NULL THEN
      RAISE WARNING 'Payment accounts not found';
      RETURN NEW;
    END IF;

    INSERT INTO journal_entries (
      company_id, reference_type, reference_id, entry_date, description, status
    ) VALUES (
      NEW.company_id, 'invoice_payment', NEW.invoice_id,
      NEW.payment_date, 'Invoice payment', 'posted'
    ) RETURNING id INTO v_journal_entry_id;

    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount, description
    ) VALUES
    (v_journal_entry_id, v_account_id, NEW.amount, 0, 'Cash/Bank'),
    (v_journal_entry_id, v_ar_account_id, 0, NEW.amount, 'Accounts Receivable');

    UPDATE payments SET journal_entry_id = v_journal_entry_id WHERE id = NEW.id;
  END IF;

  IF NEW.bill_id IS NOT NULL THEN
    SELECT id INTO v_ap_account_id
    FROM chart_of_accounts
    WHERE company_id = NEW.company_id
      AND (sub_type = 'accounts_payable' OR account_name ILIKE '%payable%')
    LIMIT 1;

    v_account_id := COALESCE(NEW.account_id, NULL);
    IF v_account_id IS NULL THEN
      SELECT id INTO v_account_id
      FROM chart_of_accounts
      WHERE company_id = NEW.company_id
        AND (sub_type = 'cash' OR sub_type = 'bank')
      LIMIT 1;
    END IF;

    IF v_ap_account_id IS NULL OR v_account_id IS NULL THEN
      RAISE WARNING 'Bill payment accounts not found';
      RETURN NEW;
    END IF;

    INSERT INTO journal_entries (
      company_id, reference_type, reference_id, entry_date, description, status
    ) VALUES (
      NEW.company_id, 'bill_payment', NEW.bill_id,
      NEW.payment_date, 'Bill payment', 'posted'
    ) RETURNING id INTO v_journal_entry_id;

    INSERT INTO journal_entry_lines (
      journal_entry_id, account_id, debit_amount, credit_amount, description
    ) VALUES
    (v_journal_entry_id, v_ap_account_id, NEW.amount, 0, 'Accounts Payable'),
    (v_journal_entry_id, v_account_id, 0, NEW.amount, 'Cash/Bank');

    UPDATE payments SET journal_entry_id = v_journal_entry_id WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$`
  },
  {
    name: 'Recreate auto_create_payment_journal trigger',
    sql: `DROP TRIGGER IF EXISTS trg_auto_create_payment_journal ON public.payments`
  },
  {
    name: 'Create auto_create_payment_journal trigger',
    sql: `
CREATE TRIGGER trg_auto_create_payment_journal
  AFTER INSERT ON public.payments
  FOR EACH ROW
  WHEN (NEW.journal_entry_id IS NULL)
  EXECUTE FUNCTION public.auto_create_payment_journal()`
  }
];

async function runStep(step) {
  console.log(`\n▶ ${step.name}...`);
  
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: step.sql.trim() });
  
  if (error) {
    if (error.code === 'PGRST202') {
      console.log('  ⚠️  exec_sql RPC not found - please apply SQL manually via Supabase Dashboard');
      return false;
    }
    console.error(`  ❌ Error: ${error.message}`);
    return false;
  }
  
  if (data && data.startsWith('ERROR:')) {
    console.error(`  ❌ SQL Error: ${data}`);
    return false;
  }
  
  console.log(`  ✅ Done`);
  return true;
}

async function main() {
  console.log('🛡️  Applying Negative Payment Protection');
  console.log('='.repeat(50));
  
  let successCount = 0;
  let failCount = 0;
  
  for (const step of SQL_STEPS) {
    const ok = await runStep(step);
    if (ok) successCount++;
    else failCount++;
    
    // If exec_sql not found, stop
    if (failCount > 0 && successCount === 0) {
      const projectRef = supabaseUrl
        ? new URL(supabaseUrl).hostname.split('.')[0]
        : '<YOUR_PROJECT_REF>';
      console.log('\n📋 Manual SQL to apply via Supabase Dashboard SQL Editor:');
      console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new`);
      console.log('\n   File: supabase/migrations/20260218_003_prevent_negative_payment_invoice_link.sql');
      break;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${successCount} succeeded, ${failCount} failed`);
}

main().catch(console.error);
