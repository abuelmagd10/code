const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fix() {
  const { data: s } = await supabase.from('suppliers').select('*').ilike('name', '%محمد الصاوى%').limit(1);
  if(!s.length) return console.log('Supplier not found');
  
  const supplierId = s[0].id;
  
  const { data: vcs } = await supabase.from('vendor_credits')
    .select('*, purchase_returns(*)')
    .eq('supplier_id', supplierId);
    
  console.log('Found Vendor Credits:', vcs.length);
  
  for(const vc of vcs) {
    if (vc.purchase_returns) {
      if (vc.purchase_returns.return_number === 'PR-BILL-0001-1774972253475') {
           console.log('Deleting invalid VC for first return...', vc.id);
           await supabase.from('vendor_credit_items').delete().eq('vendor_credit_id', vc.id);
           await supabase.from('vendor_credits').delete().eq('id', vc.id);
           console.log('Deleted VC:', vc.id);
      }
    }
  }
}
fix().catch(console.error);
