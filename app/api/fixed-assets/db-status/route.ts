import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Database configuration missing' }, { status: 500 })
    }

    const { createClient: createAdminClient } = await import('@supabase/supabase-js')
    const adminClient = createAdminClient(supabaseUrl, serviceKey)

    // Check journal_entries table structure
    const { data: journalColumns, error: journalError } = await adminClient
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', 'journal_entries')
      .eq('table_schema', 'public')

    // Check if functions exist
    const { data: functions, error: funcError } = await adminClient
      .rpc('exec_sql', {
        sql: `
          SELECT
            p.proname as function_name,
            pg_get_function_identity_arguments(p.oid) as arguments
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE n.nspname = 'public'
          AND p.proname IN ('post_depreciation', 'generate_entry_number', 'dispose_asset')
          ORDER BY p.proname;
        `
      })

    // Check fixed_assets tables
    const { data: tables, error: tableError } = await adminClient
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['fixed_assets', 'asset_categories', 'depreciation_schedules'])
      .order('table_name')

    // Check if required columns exist in journal_entries
    const requiredColumns = ['entry_number', 'branch_id', 'cost_center_id', 'created_by']
    const existingColumns = journalColumns?.map(c => c.column_name) || []
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col))

    return NextResponse.json({
      database_status: {
        journal_entries_table: {
          exists: journalColumns && journalColumns.length > 0,
          columns: journalColumns || [],
          missing_required_columns: missingColumns,
          has_required_columns: missingColumns.length === 0
        },
        functions: {
          post_depreciation: functions?.some((f: any) => f.function_name === 'post_depreciation') || false,
          generate_entry_number: functions?.some((f: any) => f.function_name === 'generate_entry_number') || false,
          dispose_asset: functions?.some((f: any) => f.function_name === 'dispose_asset') || false
        },
        fixed_assets_tables: {
          fixed_assets: tables?.some(t => t.table_name === 'fixed_assets') || false,
          asset_categories: tables?.some(t => t.table_name === 'asset_categories') || false,
          depreciation_schedules: tables?.some(t => t.table_name === 'depreciation_schedules') || false
        }
      },
      recommendations: {
        needs_fixes: missingColumns.length > 0 || !functions?.some((f: any) => f.function_name === 'post_depreciation'),
        action_required: missingColumns.length > 0 ? 'Apply database fixes' : 'Ready to use'
      }
    })
  } catch (error: any) {
    console.error('Error checking database status:', error)
    return NextResponse.json({
      error: 'Failed to check database status',
      details: error?.message
    }, { status: 500 })
  }
}