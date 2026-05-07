const sql = `
ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS approved_quantity numeric DEFAULT 0;
ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS issued_quantity numeric DEFAULT 0;
ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS shortage_quantity numeric DEFAULT 0;
ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS line_issue_status text DEFAULT 'pending';
ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS approved_by uuid;
ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS warehouse_approval_notes text;
ALTER TABLE manufacturing_material_issue_approvals ADD COLUMN IF NOT EXISTS issue_type text DEFAULT 'full';
ALTER TABLE manufacturing_material_issue_approvals ADD COLUMN IF NOT EXISTS warehouse_approval_notes text;
`;

async function migrate() {
  // Use Supabase Management API (SQL query endpoint)
  const projectRef = 'hfvsbsizokxontflgdyn';
  // Try the pg-meta endpoint
  const url = `https://${projectRef}.supabase.co/pg/query`;
  
  const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4';

  // Method 1: Try pg-meta
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    console.log('pg/query status:', res.status);
    const txt = await res.text();
    console.log('pg/query response:', txt.substring(0, 500));
  } catch (e) {
    console.log('pg/query error:', e.message);
  }

  // Method 2: Create a temporary function and call it
  const { createClient } = require('@supabase/supabase-js');
  const s = createClient(`https://${projectRef}.supabase.co`, serviceKey);

  // Try creating columns one by one via raw insert tricks
  // Actually, let's try the SQL via creating a temporary function
  const createFnSql = `
    CREATE OR REPLACE FUNCTION _temp_add_partial_issue_cols()
    RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS approved_quantity numeric DEFAULT 0;
      ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS issued_quantity numeric DEFAULT 0;
      ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS shortage_quantity numeric DEFAULT 0;
      ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS line_issue_status text DEFAULT 'pending';
      ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS approved_by uuid;
      ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS approved_at timestamptz;
      ALTER TABLE production_order_material_requirements ADD COLUMN IF NOT EXISTS warehouse_approval_notes text;
      ALTER TABLE manufacturing_material_issue_approvals ADD COLUMN IF NOT EXISTS issue_type text DEFAULT 'full';
      ALTER TABLE manufacturing_material_issue_approvals ADD COLUMN IF NOT EXISTS warehouse_approval_notes text;
    END $$;
  `;

  // We need to use the SQL editor API or the dashboard. 
  // Let's try the Supabase Studio SQL endpoint
  const sqlEditorUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  
  // We need the management API key (not service role key)
  // Let's try another approach - direct postgres connection via the REST SQL endpoint
  
  console.log('\\n=== The RPC execute_sql does not exist. ===');
  console.log('Please run the following SQL manually in the Supabase Dashboard SQL Editor:');
  console.log('=========================================================================');
  console.log(sql);
  console.log('=========================================================================');
  
  // Verify
  const { data: r1, error: e1 } = await s.from('production_order_material_requirements')
    .select('approved_quantity').limit(1);
  console.log('\\nPOMR check:', r1 ? 'Columns exist!' : 'Still missing', e1?.message || '');
}

migrate();
