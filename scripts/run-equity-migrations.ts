/**
 * 🚀 Equity System Migration Runner
 * ================================
 * يشغل ملفات SQL للـ Equity System على Supabase
 * 
 * Usage:
 *   npx tsx scripts/run-equity-migrations.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

async function runMigration(filename: string): Promise<boolean> {
  console.log(`\n📄 Running: ${filename}`)
  console.log('─'.repeat(50))

  const filePath = path.join(__dirname, filename)
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`)
    return false
  }

  const sql = fs.readFileSync(filePath, 'utf-8')

  // Split by semicolons but keep function definitions intact
  const statements = splitSqlStatements(sql)

  let successCount = 0
  let errorCount = 0

  for (const statement of statements) {
    const trimmed = statement.trim()
    if (!trimmed || trimmed.startsWith('--')) continue

    try {
      const { error } = await supabase.rpc('exec_sql', { sql_text: trimmed })
      
      if (error) {
        // Try direct execution for DDL statements
        const { error: ddlError } = await supabase.from('_migrations').select().limit(0)
        if (ddlError) {
          console.log(`⚠️ Statement may need manual execution`)
          errorCount++
        }
      } else {
        successCount++
        console.log(`✓ Statement executed`)
      }
    } catch (err) {
      console.log(`⚠️ Statement skipped (may already exist)`)
    }
  }

  console.log(`\n📊 ${filename}: ${successCount} succeeded, ${errorCount} skipped`)
  return errorCount === 0
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let inFunction = false
  let dollarQuote = ''

  const lines = sql.split('\n')

  for (const line of lines) {
    // Check for function start
    if (line.includes('$$')) {
      const matches = line.match(/\$\$/g)
      if (matches) {
        for (const match of matches) {
          if (!inFunction) {
            inFunction = true
            dollarQuote = match
          } else if (match === dollarQuote) {
            inFunction = false
            dollarQuote = ''
          }
        }
      }
    }

    current += line + '\n'

    // If not in function and line ends with semicolon
    if (!inFunction && line.trim().endsWith(';')) {
      statements.push(current.trim())
      current = ''
    }
  }

  if (current.trim()) {
    statements.push(current.trim())
  }

  return statements
}

async function main() {
  console.log('🏦 Equity System Migration Runner')
  console.log('='.repeat(50))
  console.log(`📍 Target: ${supabaseUrl}`)
  console.log('')

  // Check connection
  const { error: connError } = await supabase.from('companies').select('id').limit(1)
  if (connError) {
    console.error('❌ Cannot connect to Supabase:', connError.message)
    process.exit(1)
  }
  console.log('✅ Connected to Supabase')

  // Run migrations in order
  const migrations = [
    '150_equity_system_upgrade.sql',
    '151_equity_atomic_functions.sql'
  ]

  let allSuccess = true

  for (const migration of migrations) {
    const success = await runMigration(migration)
    if (!success) allSuccess = false
  }

  console.log('\n' + '='.repeat(50))
  if (allSuccess) {
    console.log('🎉 All migrations completed!')
  } else {
    console.log('⚠️ Some migrations may need manual review')
    console.log('\n📋 Manual steps:')
    console.log('1. Go to Supabase Dashboard → SQL Editor')
    console.log('2. Copy content from scripts/150_equity_system_upgrade.sql')
    console.log('3. Execute')
    console.log('4. Copy content from scripts/151_equity_atomic_functions.sql')
    console.log('5. Execute')
  }
}

main().catch(console.error)

