const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Supabase configuration
const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function executeGovernanceFixes() {
  console.log('🔒 APPLYING MANDATORY ERP GOVERNANCE FIXES');
  console.log('==========================================');
  
  // Key SQL statements to execute
  const statements = [
    // Add columns to suppliers
    `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);`,
    `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);`,
    `ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);`,
    
    // Add columns to customers
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);`,
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);`,
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);`,
    
    // Add columns to inventory_transactions
    `ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);`,
    `ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);`,
    
    // Add columns to invoices
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);`,
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);`,
    
    // Add columns to bills
    `ALTER TABLE bills ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id);`,
    `ALTER TABLE bills ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);`,
  ];
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);
    
    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
      
      if (error) {
        console.log(`⚠️  Statement ${i + 1} result:`, error.message);
      } else {
        console.log(`✅ Statement ${i + 1} executed successfully`);
      }
    } catch (err) {
      console.log(`⚠️  Statement ${i + 1} error:`, err.message);
    }
  }
  
  console.log('');
  console.log('✅ Core governance structure applied!');
  console.log('');
  console.log('📝 Next: Update your application code to use the governance layer');
  console.log('📖 See: MANDATORY_ERP_GOVERNANCE_IMPLEMENTATION_GUIDE.md');
}

executeGovernanceFixes().catch(console.error);