require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('purchase_returns')
    .select('id, return_number, status, workflow_status, financial_status, settlement_method, total_amount')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error:', error);
  } else {
    data.forEach(pr => {
      console.log(`\nReturn #: ${pr.return_number}`);
      console.log(`  status: ${pr.status}`);
      console.log(`  workflow_status: ${pr.workflow_status}`);
      console.log(`  financial_status: ${pr.financial_status}`);
      console.log(`  settlement_method: ${pr.settlement_method}`);
      console.log(`  total_amount: ${pr.total_amount}`);
    });
  }
}

run();
