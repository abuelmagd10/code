/**
 * Apply Audit Log Phase 1 Migrations
 * 
 * This script applies the Phase 1 migrations to the database
 * Run with: npx tsx scripts/apply-audit-migrations.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing environment variables')
    console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})

async function applyMigration(filePath: string, name: string) {
    console.log(`\n📄 Applying migration: ${name}...`)

    try {
        const sql = readFileSync(filePath, 'utf-8')

        // Split by semicolons but keep transaction blocks together
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'))

        console.log(`   Found ${statements.length} SQL statements`)

        // Execute the entire migration as one transaction
        const { data, error } = await supabase.rpc('exec_sql', {
            sql_query: sql
        })

        if (error) {
            // If RPC doesn't exist, try direct execution
            console.log('   RPC method not available, trying direct execution...')

            // For Supabase, we need to use the REST API or execute via psql
            // Let's create a simpler approach
            throw new Error(`Migration failed: ${error.message}. Please apply manually via Supabase Dashboard or psql.`)
        }

        console.log(`   ✅ Migration applied successfully`)
        return true
    } catch (error: any) {
        console.error(`   ❌ Migration failed:`, error.message)
        return false
    }
}

async function main() {
    console.log('🚀 Applying Audit Log Phase 1 Migrations...\n')
    console.log('='.repeat(60))

    const migrations = [
        {
            file: join(process.cwd(), 'supabase', 'migrations', '20260215_001_audit_log_enhancements.sql'),
            name: '001 - Audit Log Enhancements'
        },
        {
            file: join(process.cwd(), 'supabase', 'migrations', '20260215_002_audit_critical_tables.sql'),
            name: '002 - Critical Tables Triggers'
        }
    ]

    let success = 0
    let failed = 0

    for (const migration of migrations) {
        const result = await applyMigration(migration.file, migration.name)
        if (result) {
            success++
        } else {
            failed++
        }
    }

    console.log('\n' + '='.repeat(60))
    console.log('📊 Migration Summary')
    console.log('='.repeat(60))
    console.log(`✅ Successful: ${success}`)
    console.log(`❌ Failed: ${failed}`)

    if (failed > 0) {
        console.log('\n⚠️  Some migrations failed.')
        console.log('\n📝 Manual Application Instructions:')
        console.log('   1. Go to Supabase Dashboard → SQL Editor')
        console.log('   2. Copy and paste each migration file')
        console.log('   3. Execute them in order')
        console.log('\n   Or use psql:')
        console.log('   psql <connection-string> -f supabase/migrations/20260215_001_audit_log_enhancements.sql')
        console.log('   psql <connection-string> -f supabase/migrations/20260215_002_audit_critical_tables.sql')
        process.exit(1)
    } else {
        console.log('\n🎉 All migrations applied successfully!')
        console.log('\n📋 Next Steps:')
        console.log('   1. Run verification: npx tsx scripts/verify-audit-phase1.ts')
        console.log('   2. Run tests: npx tsx scripts/test-audit-phase1.ts')
        console.log('   3. Update UI to show new action types')
        process.exit(0)
    }
}

main().catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
})
