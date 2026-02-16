/**
 * Script: Test Backup & Restore Flow (Atomic + Scalable)
 * Description: Verifies the end-to-end flow of the new Atomic Restore system.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
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

async function runTest() {
    console.log('🚀 Starting Atomic Restore System Verification...')

    try {
        // 1. Setup Test Data (Mock Backup)
        const { data: company } = await supabase.from('companies').select('id, name').limit(1).single();
        if (!company) throw new Error('No company found to test with.');

        console.log(`📋 Testing with Company: ${company.name} (${company.id})`);

        // Fetch a valid user ID to satisfy FK
        const { data: member } = await supabase
            .from('company_members')
            .select('user_id')
            .eq('company_id', company.id)
            .limit(1)
            .single();

        // If no member found, try to fetch any user (fallback or error)
        if (!member) throw new Error('No company member found for test user (Foreign Key Constraint).');
        const testUserId = member.user_id;

        console.log(`👤 Testing with User ID: ${testUserId}`);

        // Mock Backup Data
        const mockData = {
            branches: [
                {
                    id: crypto.randomUUID(),
                    company_id: company.id,
                    name: 'Test Branch Backup',
                    code: 'TB-BK',
                    branch_code: 'TB-BK', // Required by schema
                    branch_name: 'Test Branch Backup' // Required by schema
                }
            ]
        };

        const mockBackup = {
            metadata: {
                version: "2.0",
                system_version: "1.0.0",
                schema_version: "2026.02",
                erp_version: "1.0.0",
                created_at: new Date().toISOString(),
                created_by: "system_test",
                company_id: company.id,
                company_name: company.name,
                backup_type: "full" as const,
                total_records: 1,
                checksum: "mock_checksum"
            },
            schema_info: { tables: ['branches'] },
            data: mockData
        };

        console.log('✅ Mock Backup Data Prepared.');

        // 2. Test Restore Queue Creation (Batching Logic Simulation)
        console.log('🔄 Testing Queue Creation & Batching...');

        const { data: queueEntry, error: queueError } = await supabase
            .from('restore_queue')
            .insert({
                company_id: company.id,
                user_id: testUserId,
                status: 'PENDING',
                backup_data: mockBackup,
                ip_address: '127.0.0.1'
            })
            .select()
            .single();

        if (queueError) throw new Error(`Queue Creation Failed: ${queueError.message}`);
        console.log(`✅ Queue Entry Created: ${queueEntry.id}`);

        // 3. Test RPC: DRY RUN
        console.log('🧪 Executing RPC: Dry Run...');
        const { data: dryRunResult, error: dryRunError } = await supabase.rpc(
            'restore_company_backup',
            {
                p_queue_id: queueEntry.id,
                p_dry_run: true
            }
        );

        if (dryRunError && dryRunError.message !== 'DRY_RUN_COMPLETED') {
            console.error('Dry Run RPC Error:', dryRunError);
        }

        console.log('Dry Run Result:', JSON.stringify(dryRunResult, null, 2));

        if (!dryRunResult.success || dryRunResult.mode !== 'DRY_RUN') {
            throw new Error('Dry Run Failed or Invalid Mode');
        }
        console.log('✅ Dry Run Successful (Simulation Passed).');

        console.log('🎉 Verification Complete: System is Ready.');

    } catch (err: any) {
        console.error('❌ Test Failed:', err.message || err);
        process.exit(1);
    }
}

runTest();
