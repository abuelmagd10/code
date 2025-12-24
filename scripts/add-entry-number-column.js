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
  console.log('Adding entry_number column to journal_entries...');
  
  const sql = `
    -- Add entry_number column if it doesn't exist
    DO $$ 
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'journal_entries' 
        AND column_name = 'entry_number'
      ) THEN
        ALTER TABLE journal_entries 
        ADD COLUMN entry_number TEXT;
        
        RAISE NOTICE 'Added entry_number column to journal_entries table';
      ELSE
        RAISE NOTICE 'entry_number column already exists in journal_entries table';
      END IF;
    END $$;
    
    -- Add is_deleted column if it doesn't exist
    DO $$ 
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'journal_entries' 
        AND column_name = 'is_deleted'
      ) THEN
        ALTER TABLE journal_entries 
        ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
        
        RAISE NOTICE 'Added is_deleted column to journal_entries table';
      ELSE
        RAISE NOTICE 'is_deleted column already exists in journal_entries table';
      END IF;
    END $$;
  `;
  
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    console.error('Error:', error);
    fs.writeFileSync('add-column-report.json', JSON.stringify({ success: false, error: error.message }, null, 2));
  } else {
    console.log('Success!', data);
    fs.writeFileSync('add-column-report.json', JSON.stringify({ success: true, data }, null, 2));
  }
}

main();

