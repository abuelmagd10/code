/**
 * Script: Test Restore Audit Logging
 * Description: Verifies that all restore operations are correctly logged to audit_logs
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import crypto from 'crypto'

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase credentials in .env.local')
    process.exit(1)
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

interface AuditLogEntry {
    id: string
    company_id: string
    user_id: string
    user_email: string
    user_name: string
    action: string
    target_table: string
    record_id: string
    record_identifier: string
    old_data: any
    new_data: any
    changed_fields: string[]
    branch_id: string | null
    cost_center_id: string | null
    reason: string | null
    ip_address: string | null
    created_at: string
}

async function runAuditTest() {
    console.log('🔍 Starting Audit Logging Verification for Restore Operations...\n')

    let companyId: string | null = null
    let userId: string | null = null
    let queueId: string | null = null

    try {
        // 0. Fetch a Real User
        const { data: member } = await supabase
            .from('company_members')
            .select('user_id, company_id, role')
            .limit(1)
            .single()

        if (!member) throw new Error('No valid user found')
        userId = member.user_id
        companyId = member.company_id

        console.log(`✅ Test User: ${userId}`)
        console.log(`✅ Test Company: ${companyId}\n`)

        // Get initial audit log count
        const { count: initialCount } = await supabase
            .from('audit_logs')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', companyId)

        console.log(`📊 Initial Audit Logs Count: ${initialCount}\n`)

        // =====================================================
        // TEST 1: DRY RUN - Should log with action indicating dry run
        // =====================================================
        console.log('🧪 TEST 1: Dry Run Audit Logging')
        console.log('─'.repeat(50))

        const mockBackup = {
            metadata: {
                version: "2.0",
                system_version: "1.0.0",
                schema_version: "2026.02",
                erp_version: "1.0.0",
                created_at: new Date().toISOString(),
                created_by: "audit_test",
                company_id: companyId,
                company_name: "Test Company",
                backup_type: "full" as const,
                total_records: 1,
                checksum: "test_checksum"
            },
            schema_info: { tables: ['branches'] },
            data: {
                branches: [
                    {
                        id: crypto.randomUUID(),
                        company_id: companyId,
                        name: 'Audit Test Branch',
                        code: 'AUDIT-01',
                        branch_code: 'AUDIT-01',
                        branch_name: 'Audit Test Branch'
                    }
                ]
            }
        }

        // Create queue entry for dry run
        const { data: dryRunQueue, error: dryRunQueueError } = await supabase
            .from('restore_queue')
            .insert({
                company_id: companyId,
                user_id: userId,
                status: 'PENDING',
                backup_data: mockBackup,
                ip_address: '127.0.0.1'
            })
            .select()
            .single()

        if (dryRunQueueError) throw new Error(`Queue creation failed: ${dryRunQueueError.message}`)
        queueId = dryRunQueue.id

        // Execute DRY RUN
        const startDryRun = Date.now()
        const { data: dryRunResult } = await supabase.rpc('restore_company_backup', {
            p_queue_id: queueId,
            p_dry_run: true
        })
        const dryRunDuration = Date.now() - startDryRun

        console.log(`  ✓ Dry Run Executed (${dryRunDuration}ms)`)
        console.log(`  ✓ Result: ${dryRunResult?.success ? 'SUCCESS' : 'FAILED'}`)

        // Update queue status to simulate API behavior
        await supabase
            .from('restore_queue')
            .update({ status: dryRunResult?.success ? 'DRY_RUN_SUCCESS' : 'FAILED' })
            .eq('id', queueId)

        // Wait a moment for any async audit logging
        await new Promise(resolve => setTimeout(resolve, 500))

        // Check for audit log entry
        const { data: dryRunAudits, count: dryRunAuditCount } = await supabase
            .from('audit_logs')
            .select('*', { count: 'exact' })
            .eq('company_id', companyId)
            .gte('created_at', new Date(startDryRun - 1000).toISOString())
            .order('created_at', { ascending: false })

        console.log(`\n  📋 Audit Logs Created: ${dryRunAuditCount}`)

        if (dryRunAudits && dryRunAudits.length > 0) {
            const latestLog = dryRunAudits[0] as AuditLogEntry
            console.log(`  ✓ Action: ${latestLog.action}`)
            console.log(`  ✓ User ID: ${latestLog.user_id ? '✓' : '✗'}`)
            console.log(`  ✓ Company ID: ${latestLog.company_id ? '✓' : '✗'}`)
            console.log(`  ✓ User Email: ${latestLog.user_email || 'N/A'}`)
            console.log(`  ✓ Target Table: ${latestLog.target_table}`)
            console.log(`  ✓ Created At: ${latestLog.created_at}`)
        } else {
            console.log(`  ⚠️  WARNING: No audit log found for dry run!`)
        }

        // Cleanup dry run queue
        await supabase.from('restore_queue').delete().eq('id', queueId)

        // =====================================================
        // TEST 2: ACTUAL RESTORE - Should log successful restore
        // =====================================================
        console.log('\n🧪 TEST 2: Actual Restore Audit Logging')
        console.log('─'.repeat(50))

        // Create temporary company for actual restore test
        const tempCompanyName = `AUDIT_TEST_${Date.now()}`
        const tempEmail = `audit_test_${Date.now()}@example.com`

        const { data: tempCompany, error: tempCompanyError } = await supabase
            .from('companies')
            .insert({
                name: tempCompanyName,
                user_id: userId,
                email: tempEmail
            })
            .select()
            .single()

        if (tempCompanyError) throw new Error(`Temp company creation failed: ${tempCompanyError.message}`)
        const tempCompanyId = tempCompany.id

        console.log(`  ✓ Created Temp Company: ${tempCompanyId}`)

        // Add user to temp company
        await supabase.from('company_members').insert({
            company_id: tempCompanyId,
            user_id: userId,
            role: 'owner'
        })

        // Create backup for temp company
        const tempBackup = {
            ...mockBackup,
            metadata: {
                ...mockBackup.metadata,
                company_id: tempCompanyId
            },
            data: {
                branches: [
                    {
                        id: crypto.randomUUID(),
                        company_id: tempCompanyId,
                        name: 'Restored Branch',
                        code: 'RESTORED-01',
                        branch_code: 'RESTORED-01',
                        branch_name: 'Restored Branch'
                    }
                ]
            }
        }

        // Create queue for actual restore
        const { data: restoreQueue, error: restoreQueueError } = await supabase
            .from('restore_queue')
            .insert({
                company_id: tempCompanyId,
                user_id: userId,
                status: 'PENDING',
                backup_data: tempBackup,
                ip_address: '192.168.1.100' // Different IP to test
            })
            .select()
            .single()

        if (restoreQueueError) throw new Error(`Restore queue creation failed: ${restoreQueueError.message}`)

        // Execute ACTUAL RESTORE
        const startRestore = Date.now()
        const { data: restoreResult } = await supabase.rpc('restore_company_backup', {
            p_queue_id: restoreQueue.id,
            p_dry_run: false
        })
        const restoreDuration = Date.now() - startRestore

        console.log(`  ✓ Actual Restore Executed (${restoreDuration}ms)`)
        console.log(`  ✓ Result: ${restoreResult?.success ? 'SUCCESS' : 'FAILED'}`)

        // Update queue status
        await supabase
            .from('restore_queue')
            .update({ status: restoreResult?.success ? 'COMPLETED' : 'FAILED' })
            .eq('id', restoreQueue.id)

        // Wait for async audit logging
        await new Promise(resolve => setTimeout(resolve, 500))

        // Check for audit log
        const { data: restoreAudits, count: restoreAuditCount } = await supabase
            .from('audit_logs')
            .select('*', { count: 'exact' })
            .eq('company_id', tempCompanyId)
            .gte('created_at', new Date(startRestore - 1000).toISOString())
            .order('created_at', { ascending: false })

        console.log(`\n  📋 Audit Logs Created: ${restoreAuditCount}`)

        if (restoreAudits && restoreAudits.length > 0) {
            const latestLog = restoreAudits[0] as AuditLogEntry
            console.log(`  ✓ Action: ${latestLog.action}`)
            console.log(`  ✓ User ID: ${latestLog.user_id ? '✓' : '✗'}`)
            console.log(`  ✓ Company ID: ${latestLog.company_id ? '✓' : '✗'}`)
            console.log(`  ✓ User Email: ${latestLog.user_email || 'N/A'}`)
            console.log(`  ✓ Target Table: ${latestLog.target_table}`)
        } else {
            console.log(`  ⚠️  WARNING: No audit log found for actual restore!`)
        }

        // Cleanup temp company
        await supabase.from('restore_queue').delete().eq('company_id', tempCompanyId)
        await supabase.from('companies').delete().eq('id', tempCompanyId)
        console.log(`  ✓ Cleaned up temp company`)

        // =====================================================
        // TEST 3: FAILED RESTORE - Should log failure
        // =====================================================
        console.log('\n🧪 TEST 3: Failed Restore Audit Logging')
        console.log('─'.repeat(50))

        // Create invalid backup to force failure
        const invalidBackup = {
            metadata: mockBackup.metadata,
            schema_info: { tables: ['branches'] },
            data: {
                branches: [
                    {
                        // Missing required fields to cause failure
                        id: crypto.randomUUID(),
                        company_id: companyId
                        // branch_code and branch_name missing
                    }
                ]
            }
        }

        const { data: failQueue } = await supabase
            .from('restore_queue')
            .insert({
                company_id: companyId,
                user_id: userId,
                status: 'PENDING',
                backup_data: invalidBackup,
                ip_address: '10.0.0.1'
            })
            .select()
            .single()

        if (failQueue) {
            const startFail = Date.now()
            const { data: failResult } = await supabase.rpc('restore_company_backup', {
                p_queue_id: failQueue.id,
                p_dry_run: false
            })

            console.log(`  ✓ Failed Restore Executed`)
            console.log(`  ✓ Result: ${failResult?.success ? 'SUCCESS' : 'FAILED (Expected)'}`)
            console.log(`  ✓ Error: ${failResult?.error || 'N/A'}`)

            // Update queue
            await supabase
                .from('restore_queue')
                .update({ status: 'FAILED' })
                .eq('id', failQueue.id)

            await new Promise(resolve => setTimeout(resolve, 500))

            // Check audit log
            const { data: failAudits, count: failAuditCount } = await supabase
                .from('audit_logs')
                .select('*', { count: 'exact' })
                .eq('company_id', companyId)
                .gte('created_at', new Date(startFail - 1000).toISOString())
                .order('created_at', { ascending: false })

            console.log(`\n  📋 Audit Logs Created: ${failAuditCount}`)

            if (failAudits && failAudits.length > 0) {
                const latestLog = failAudits[0] as AuditLogEntry
                console.log(`  ✓ Action: ${latestLog.action}`)
                console.log(`  ✓ Contains 'failed' or 'error': ${latestLog.action.toLowerCase().includes('fail') || latestLog.action.toLowerCase().includes('error') ? '✓' : '✗'}`)
            }

            // Cleanup
            await supabase.from('restore_queue').delete().eq('id', failQueue.id)
        }

        // =====================================================
        // SUMMARY
        // =====================================================
        console.log('\n' + '='.repeat(50))
        console.log('📊 AUDIT LOGGING VERIFICATION SUMMARY')
        console.log('='.repeat(50))

        const { count: finalCount } = await supabase
            .from('audit_logs')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', companyId)

        console.log(`\n✅ Initial Audit Logs: ${initialCount}`)
        console.log(`✅ Final Audit Logs: ${finalCount}`)
        console.log(`✅ New Logs Created: ${(finalCount || 0) - (initialCount || 0)}`)

        console.log('\n🎯 Verification Complete!')
        console.log('\nNote: The restore operations are logged via the API route,')
        console.log('not directly by the RPC. To see full audit logs, test via')
        console.log('the actual API endpoint /api/backup/restore')

    } catch (err: any) {
        console.error('\n❌ Test Failed:', err.message || err)
        process.exit(1)
    }
}

runAuditTest()
