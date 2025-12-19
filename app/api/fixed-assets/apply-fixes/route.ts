import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Execute the fixes directly
    const fixes = `
      -- Add missing columns to journal_entries table
      ALTER TABLE journal_entries
      ADD COLUMN IF NOT EXISTS entry_number TEXT,
      ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

      -- Create index for entry_number if it doesn't exist
      CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_number ON journal_entries(entry_number);

      -- Add a function to auto-generate entry numbers for new records
      CREATE OR REPLACE FUNCTION generate_entry_number(p_company_id UUID)
      RETURNS TEXT AS $$
      DECLARE
        v_next_number INTEGER;
        v_entry_number TEXT;
      BEGIN
        -- Get the next number for this company
        SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM '[0-9]+') AS INTEGER)), 0) + 1
        INTO v_next_number
        FROM journal_entries
        WHERE company_id = p_company_id;

        -- Format as JE-000001, JE-000002, etc.
        v_entry_number := 'JE-' || LPAD(v_next_number::TEXT, 6, '0');

        RETURN v_entry_number;
      END;
      $$ LANGUAGE plpgsql;
    `

    // Execute the fixes
    const { error } = await supabase.rpc('exec_sql', { sql: fixes })

    if (error) {
      console.error('Error applying fixes:', error)
      return NextResponse.json({ error: 'Failed to apply fixes', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Database fixes applied successfully' })
  } catch (error) {
    console.error('Error in apply-fixes API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}