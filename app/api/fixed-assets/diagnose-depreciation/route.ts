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

    // Get the actual function definition
    const { data: functionDef, error: funcError } = await adminClient.rpc('exec_sql', {
      sql: `
        SELECT
          pg_get_functiondef(p.oid) as function_definition,
          p.proname as function_name,
          pg_get_function_identity_arguments(p.oid) as arguments
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.proname = 'post_depreciation'
        LIMIT 1;
      `
    })

    // Get table columns
    const { data: depSchedCols } = await adminClient
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'depreciation_schedules')
      .order('ordinal_position')

    const { data: fixedAssetsCols } = await adminClient
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'fixed_assets')
      .order('ordinal_position')

    const { data: journalEntriesCols } = await adminClient
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'journal_entries')
      .order('ordinal_position')

    const { data: journalLinesCols } = await adminClient
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'journal_entry_lines')
      .order('ordinal_position')

    return NextResponse.json({
      function_exists: functionDef && functionDef.length > 0,
      function_definition: functionDef?.[0]?.function_definition || null,
      function_arguments: functionDef?.[0]?.arguments || null,
      table_columns: {
        depreciation_schedules: depSchedCols || [],
        fixed_assets: fixedAssetsCols || [],
        journal_entries: journalEntriesCols || [],
        journal_entry_lines: journalLinesCols || []
      },
      error: funcError?.message || null
    })
  } catch (error: any) {
    console.error('Error diagnosing depreciation function:', error)
    return NextResponse.json({
      error: 'Failed to diagnose function',
      details: error?.message
    }, { status: 500 })
  }
}

