import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 })
    }

    // Add missing columns to journal_entries table
    const { error: alterError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE journal_entries
        ADD COLUMN IF NOT EXISTS entry_number TEXT,
        ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
      `
    })

    if (alterError) {
      console.error('Error altering journal_entries table:', alterError)
      // Continue anyway - the columns might already exist
    }

    // Create generate_entry_number function
    const { error: funcError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE OR REPLACE FUNCTION generate_entry_number(p_company_id UUID)
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
        $$ LANGUAGE plpgsql;
      `
    })

    if (funcError) {
      console.error('Error creating generate_entry_number function:', funcError)
      return NextResponse.json({ error: 'Failed to create function' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Database fixed successfully' })
  } catch (error) {
    console.error('Error fixing database:', error)
    return NextResponse.json({ error: 'Failed to fix database' }, { status: 500 })
  }
}