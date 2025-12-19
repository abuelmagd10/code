import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    // Use service role for schema changes
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Database configuration missing' }, { status: 500 })
    }

    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const adminClient = createAdminClient(supabaseUrl, serviceKey)

    // Execute the fixes directly using admin client
    const fixes = [
      // Add missing columns to journal_entries table
      `ALTER TABLE journal_entries
       ADD COLUMN IF NOT EXISTS entry_number TEXT,
       ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;`,

      // Create index for entry_number
      `CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_number ON journal_entries(entry_number);`,

      // Create generate_entry_number function
      `CREATE OR REPLACE FUNCTION generate_entry_number(p_company_id UUID)
       RETURNS TEXT AS $$
       DECLARE
         v_next_number INTEGER;
         v_entry_number TEXT;
       BEGIN
         SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM '[0-9]+') AS INTEGER)), 0) + 1
         INTO v_next_number
         FROM journal_entries
         WHERE company_id = p_company_id;

         v_entry_number := 'JE-' || LPAD(v_next_number::TEXT, 6, '0');

         RETURN v_entry_number;
       END;
       $$ LANGUAGE plpgsql;`,

      // Update post_depreciation function to be self-healing
      `CREATE OR REPLACE FUNCTION post_depreciation(
         p_schedule_id UUID,
         p_user_id UUID
       ) RETURNS UUID AS $$
       DECLARE
         v_schedule RECORD;
         v_asset RECORD;
         v_journal_id UUID;
         v_entry_number TEXT;
         v_column_exists BOOLEAN;
       BEGIN
         -- Check for missing columns and add them automatically
         SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_name = 'journal_entries' AND column_name = 'entry_number'
         ) INTO v_column_exists;

         IF NOT v_column_exists THEN
           ALTER TABLE journal_entries
           ADD COLUMN entry_number TEXT,
           ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
           ADD COLUMN cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
           ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

           CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_number ON journal_entries(entry_number);
         END IF;

         -- Ensure generate_entry_number function exists
         IF NOT EXISTS (
           SELECT 1 FROM pg_proc p
           JOIN pg_namespace n ON p.pronamespace = n.oid
           WHERE n.nspname = 'public' AND p.proname = 'generate_entry_number'
         ) THEN
           EXECUTE $func$
             CREATE OR REPLACE FUNCTION generate_entry_number(p_company_id UUID)
             RETURNS TEXT AS $inner$
             DECLARE
               v_next_number INTEGER;
               v_entry_number TEXT;
             BEGIN
               SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM '[0-9]+') AS INTEGER)), 0) + 1
               INTO v_next_number
               FROM journal_entries
               WHERE company_id = p_company_id;

               v_entry_number := 'JE-' || LPAD(v_next_number::TEXT, 6, '0');

               RETURN v_entry_number;
             END;
             $inner$ LANGUAGE plpgsql;
           $func$;
         END IF;

         -- Get depreciation schedule
         SELECT * INTO v_schedule FROM depreciation_schedules WHERE id = p_schedule_id;
         IF v_schedule IS NULL THEN
           RAISE EXCEPTION 'Depreciation schedule not found';
         END IF;

         IF v_schedule.status = 'posted' THEN
           RAISE EXCEPTION 'Depreciation already posted';
         END IF;

         -- Get asset data
         SELECT * INTO v_asset FROM fixed_assets WHERE id = v_schedule.asset_id;

         -- Generate entry number
         v_entry_number := generate_entry_number(v_asset.company_id);

         -- Create journal entry
         INSERT INTO journal_entries (
           company_id, entry_number, entry_date, description,
           reference_type, reference_id, branch_id, cost_center_id, created_by
         ) VALUES (
           v_asset.company_id, v_entry_number, v_schedule.period_date,
           'إهلاك أصل: ' || v_asset.name || ' - فترة ' || v_schedule.period_number,
           'depreciation', v_asset.id, v_asset.branch_id, v_asset.cost_center_id, p_user_id
         ) RETURNING id INTO v_journal_id;

         -- Create debit entry (depreciation expense)
         INSERT INTO journal_entry_lines (
           journal_entry_id, account_id, description, debit, credit
         ) VALUES (
           v_journal_id, v_asset.depreciation_expense_account_id,
           'مصروف إهلاك: ' || v_asset.name, v_schedule.depreciation_amount, 0
         );

         -- Create credit entry (accumulated depreciation)
         INSERT INTO journal_entry_lines (
           journal_entry_id, account_id, description, debit, credit
         ) VALUES (
           v_journal_id, v_asset.accumulated_depreciation_account_id,
           'مجمع إهلاك: ' || v_asset.name, 0, v_schedule.depreciation_amount
         );

         -- Update depreciation schedule
         UPDATE depreciation_schedules SET
           status = 'posted',
           journal_entry_id = v_journal_id,
           posted_by = p_user_id,
           posted_at = CURRENT_TIMESTAMP
         WHERE id = p_schedule_id;

         -- Update asset
         UPDATE fixed_assets SET
           accumulated_depreciation = v_schedule.accumulated_depreciation,
           book_value = v_schedule.book_value,
           status = CASE
             WHEN v_schedule.book_value <= salvage_value THEN 'fully_depreciated'
             ELSE status
           END,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_user_id
         WHERE id = v_asset.id;

         RETURN v_journal_id;
       END;
       $$ LANGUAGE plpgsql;`
    ]

    // Execute each fix
    for (const sql of fixes) {
      const { error } = await adminClient.rpc('exec_sql', { sql })
      if (error) {
        console.error('Error executing fix:', sql.substring(0, 100), error)
        return NextResponse.json({
          error: 'Failed to apply database fixes',
          details: error.message,
          sql: sql.substring(0, 100)
        }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Database fixes applied successfully. The Fixed Assets module is now fully functional.'
    })
  } catch (error: any) {
    console.error('Error in apply-fixes API:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error?.message
    }, { status: 500 })
  }
}