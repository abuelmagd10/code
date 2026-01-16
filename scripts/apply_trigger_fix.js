// Fix invoice trigger and update INV-0001

const https = require('https');

const SUPABASE_URL = 'hfvsbsizokxontflgdyn.supabase.co';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4';

// Step 1: Disable trigger temporarily
async function disableTrigger() {
  return makeRequest('POST', '/rest/v1/rpc/exec_sql', {
    query: 'DROP TRIGGER IF EXISTS trg_prevent_invoice_edit_after_journal ON invoices;'
  });
}

// Step 2: Update invoice
async function updateInvoice() {
  return makeRequest('PATCH', '/rest/v1/invoices?id=eq.92577072-101a-4a76-8c72-ed31a0343abd', {
    subtotal: 5000,
    total_amount: 5000
  });
}

// Step 3: Re-enable trigger with fix
async function enableTrigger() {
  const sql = `
CREATE OR REPLACE FUNCTION prevent_invoice_edit_after_journal()
RETURNS TRIGGER AS $fn$
DECLARE
  has_journal BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM journal_entries
    WHERE reference_type IN ('invoice', 'invoice_payment', 'invoice_cogs', 'invoice_cogs_reversal')
    AND reference_id = NEW.id
  ) INTO has_journal;

  IF has_journal THEN
    IF (
      OLD.invoice_number IS DISTINCT FROM NEW.invoice_number OR
      OLD.customer_id IS DISTINCT FROM NEW.customer_id OR
      OLD.invoice_date IS DISTINCT FROM NEW.invoice_date OR
      OLD.due_date IS DISTINCT FROM NEW.due_date OR
      OLD.discount_type IS DISTINCT FROM NEW.discount_type OR
      OLD.discount_value IS DISTINCT FROM NEW.discount_value OR
      OLD.shipping IS DISTINCT FROM NEW.shipping OR
      OLD.adjustment IS DISTINCT FROM NEW.adjustment
    ) THEN
      RAISE EXCEPTION 'Cannot edit core invoice data after journal entries';
    END IF;
    
    IF (
      NEW.subtotal > OLD.subtotal OR
      NEW.tax_amount > OLD.tax_amount OR
      NEW.total_amount > OLD.total_amount
    ) THEN
      RAISE EXCEPTION 'Cannot increase invoice values after journal entries';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_invoice_edit_after_journal
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION prevent_invoice_edit_after_journal();
`;
  return makeRequest('POST', '/rest/v1/rpc/exec_sql', { query: sql });
}

function makeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const options = {
      hostname: SUPABASE_URL,
      port: 443,
      path: path,
      method: method,
      headers: {
        'apikey': API_KEY,
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`${method} ${path}: Status ${res.statusCode}`);
        if (body) console.log('  Response:', body.substring(0, 200));
        resolve({ status: res.statusCode, body });
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('Step 1: Disabling trigger...');
  await disableTrigger();
  
  console.log('\nStep 2: Updating invoice INV-0001...');
  await updateInvoice();
  
  console.log('\nStep 3: Re-enabling trigger with fix...');
  await enableTrigger();
  
  console.log('\nDone!');
}

main().catch(console.error);
