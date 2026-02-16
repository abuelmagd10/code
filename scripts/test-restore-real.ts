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

async function runRealRestoreTest() {
    console.log('🚀 Starting REAL Restore Verification (Destructive Test on Temp Company)...')

    let companyId: string | null = null;
    let userId: string | null = null;

    try {
        // 0. Fetch a Real User FIRST (Required for creating company)
        const { data: member } = await supabase
            .from('company_members')
            .select('user_id')
            .limit(1)
            .single();

        if (!member) throw new Error('No valid user found to simulate restore initiator.');
        userId = member.user_id;
        console.log(`👤 Using User ID: ${userId}`);

        // 1. Create Temporary Company
        const tempCompanyName = `TEST_RESTORE_${Date.now()}`;
        const tempEmail = `restore_test_${Date.now()}@example.com`;

        const { data: company, error: createError } = await supabase
            .from('companies')
            .insert({
                name: tempCompanyName,
                user_id: userId, // REQUIRED
                email: tempEmail // REQUIRED
            })
            .select() // Returns all columns including ID
            .single();

        if (createError) throw new Error(`Failed to create temp company: ${createError.message}`);
        companyId = company.id;
        console.log(`✅ Created Temp Company: ${tempCompanyName} (${companyId})`);

        // 2. Link User
        // Add user to temp company (to satisfy policies if any?)

        // Add user to temp company (to satisfy policies if any?)
        await supabase.from('company_members').insert({
            company_id: companyId,
            user_id: userId,
            role: 'owner'
        });

        // 3. Pre-fill Data (To verify Wipe)
        console.log('📝 Pre-filling data to verify wipe...');
        const { error: branchError } = await supabase.from('branches').insert({
            company_id: companyId,
            name: 'Old Branch (Should be Deleted)',
            branch_code: 'OLD-01',
            branch_name: 'Old Branch (Should be Deleted)',
            code: 'OLD-01'
        });

        if (branchError) throw new Error(`Failed to insert branch: ${branchError.message}`);

        const { count: countBefore, data: branchesFound } = await supabase
            .from('branches')
            .select('*', { count: 'exact', head: false })
            .eq('company_id', companyId);

        console.log(`Debug: Branches found: ${countBefore}`);

        // We expect at least the OLD-01 branch. (MAIN might be auto-created)
        const oldBranchExists = branchesFound?.some(b => b.code === 'OLD-01');
        if (!oldBranchExists) {
            console.log('Debug: Branches:', branchesFound);
            throw new Error(`Failed to pre-fill data. OLD-01 not found.`);
        }
        console.log('✅ Pre-filled data verified (OLD-01 exists).');

        // 4. Prepare Backup Data (New Data)
        const mockData = {
            branches: [
                {
                    id: crypto.randomUUID(),
                    company_id: companyId,
                    name: 'New Branch (Restored)',
                    code: 'NEW-01',
                    branch_code: 'NEW-01',
                    branch_name: 'New Branch (Restored)'
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
                company_id: companyId, // Must match target company?
                company_name: tempCompanyName,
                backup_type: "full" as const,
                total_records: 1,
                checksum: "mock_checksum"
            },
            schema_info: { tables: ['branches'] },
            data: mockData
        };

        // 5. Create Queue Entry
        console.log('🔄 Creating Queue Entry...');
        const { data: queueEntry, error: queueError } = await supabase
            .from('restore_queue')
            .insert({
                company_id: companyId,
                user_id: userId,
                status: 'PENDING',
                backup_data: mockBackup,
                ip_address: '127.0.0.1'
            })
            .select()
            .single();

        if (queueError) throw new Error(`Queue Creation Failed: ${queueError.message}`);

        // 6. Execute REAL Restore
        console.log('💥 Executing REAL RESTORE RPC...');
        const { data: result, error: rpcError } = await supabase.rpc(
            'restore_company_backup',
            {
                p_queue_id: queueEntry.id,
                p_dry_run: false
            }
        );

        if (rpcError) throw new Error(`RPC Error: ${rpcError.message}`);
        console.log('Restore Result:', JSON.stringify(result, null, 2));

        if (!result.success) throw new Error(`Restore Failed: ${result.error}`);

        // 7. Verify Data
        console.log('🧐 Verifying Data State...');

        // Old branch gone?
        const { data: oldBranches } = await supabase
            .from('branches')
            .select('*')
            .eq('company_id', companyId)
            .eq('code', 'OLD-01');

        if (oldBranches && oldBranches.length > 0) throw new Error('❌ Data Wipe Failed: Old branch still exists!');

        // New branch exists?
        const { data: newBranches } = await supabase
            .from('branches')
            .select('*')
            .eq('company_id', companyId)
            .eq('code', 'NEW-01');

        if (!newBranches || newBranches.length === 0) throw new Error('❌ Data Restore Failed: New branch not found!');

        console.log('✅ Data Verification Passed: Old data wiped, New data restored.');

    } catch (err: any) {
        console.error('❌ Test Failed:', err.message || err);
        // Do not delete company on fail so we can inspect
    } finally {
        // 8. Cleanup
        if (companyId) {
            console.log(`🧹 Cleaning up Temp Company: ${companyId}`);

            // Delete queue entries first to avoid FK violation
            await supabase.from('restore_queue').delete().eq('company_id', companyId);

            // Then delete company (cascade will handle rest)
            const { error: delError } = await supabase.from('companies').delete().eq('id', companyId);
            if (delError) console.error('Cleanup Warning:', delError.message);
            else console.log('✅ Temp Company Deleted.');
        }
    }
}

runRealRestoreTest();
