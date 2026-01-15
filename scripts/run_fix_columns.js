// Script to add missing columns to products table
// Run with: node scripts/run_fix_columns.js

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function addMissingColumns() {
  console.log('🔧 Adding missing columns to products table...')
  
  try {
    // Use RPC to execute raw SQL (if available) or try direct table modification
    // Since we can't execute raw SQL via REST, we'll use a workaround
    
    // First, let's check if columns exist by trying to select them
    const { data: testData, error: testError } = await supabase
      .from('products')
      .select('id')
      .limit(1)
    
    if (testError) {
      console.error('❌ Cannot connect to products table:', testError.message)
      return
    }
    
    console.log('✅ Connected to database successfully')
    console.log('')
    console.log('⚠️  Cannot add columns via REST API.')
    console.log('📝 Please run this SQL in Supabase Dashboard > SQL Editor:')
    console.log('')
    console.log('----------------------------------------')
    console.log(`
-- Add track_inventory column
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'track_inventory'
    ) THEN
        ALTER TABLE products ADD COLUMN track_inventory BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Add item_type column
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' AND column_name = 'item_type'
    ) THEN
        ALTER TABLE products ADD COLUMN item_type TEXT DEFAULT 'product';
    END IF;
END $$;
`)
    console.log('----------------------------------------')
    
  } catch (err) {
    console.error('Error:', err)
  }
}

addMissingColumns()
