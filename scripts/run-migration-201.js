#!/usr/bin/env node

/**
 * Script to run migration 201: Add status column to journal_entries
 * Usage: node scripts/run-migration-201.js
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Read environment variables
require('dotenv').config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials in .env.local')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', SUPABASE_URL ? '✅' : '❌')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_KEY ? '✅' : '❌')
  process.exit(1)
}

if (SUPABASE_URL.includes('dummy') || SUPABASE_SERVICE_KEY.includes('dummy')) {
  console.error('❌ Detected dummy Supabase credentials')
  console.error('   Please update .env.local with real credentials from:')
  console.error('   https://supabase.com/dashboard/project/hfvsbsizokxontflgdyn/settings/api')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function runMigration() {
  console.log('🚀 Starting migration 201: Add status to journal_entries')
  console.log('=' .repeat(60))

  try {
    // Step 1: Check if column already exists
    console.log('\n📊 Step 1: Checking if status column exists...')
    const { data: columns, error: checkError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT column_name, data_type, column_default 
          FROM information_schema.columns 
          WHERE table_name = 'journal_entries' 
          AND column_name = 'status'
        `
      })

    if (checkError) {
      console.log('⚠️  Cannot check column (RPC might not exist), proceeding with migration...')
    } else if (columns && columns.length > 0) {
      console.log('✅ Status column already exists!')
      console.log('   Column details:', columns[0])
      return
    }

    // Step 2: Read migration SQL
    console.log('\n📄 Step 2: Reading migration SQL...')
    const sqlPath = path.join(__dirname, '201_add_status_to_journal_entries.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    console.log('✅ Migration SQL loaded')

    // Step 3: Execute migration
    console.log('\n⚡ Step 3: Executing migration...')
    console.log('   This will:')
    console.log('   - Add status column (TEXT, default: posted)')
    console.log('   - Create index on (company_id, status, entry_date)')
    console.log('   - Add check constraint for valid values')
    console.log('   - Update existing records to status = posted')
    console.log('')

    // Since we can't execute raw SQL directly, we'll use the SQL Editor approach
    console.log('⚠️  Direct SQL execution not available via Supabase JS client')
    console.log('')
    console.log('📋 Please execute the migration manually:')
    console.log('=' .repeat(60))
    console.log('1. Go to: https://supabase.com/dashboard/project/hfvsbsizokxontflgdyn/editor')
    console.log('2. Click "New Query"')
    console.log('3. Copy and paste the SQL from:')
    console.log('   scripts/201_add_status_to_journal_entries.sql')
    console.log('4. Click "Run" (F5)')
    console.log('=' .repeat(60))
    console.log('')
    console.log('📄 Migration SQL:')
    console.log('=' .repeat(60))
    console.log(sql)
    console.log('=' .repeat(60))

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    process.exit(1)
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('\n✅ Migration script completed')
    console.log('   Next steps:')
    console.log('   1. Execute the SQL on Supabase Dashboard')
    console.log('   2. Verify with: SELECT status, COUNT(*) FROM journal_entries GROUP BY status')
    console.log('   3. Test the application')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Unexpected error:', error)
    process.exit(1)
  })

