import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerOrAdmin } from '@/lib/api-security'
import { createClient } from '@/lib/supabase/server'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

/**
 * GET /api/backup/list?limit=20
 *
 * Returns recent backup_history rows for the current company. Owner/Admin/GM
 * only (RLS enforces this server-side too).
 */
export async function GET(request: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(request)
    if (error) return error
    if (!companyId || !user) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const rawLimit = parseInt(searchParams.get('limit') || '', 10)
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT

    const supabase = await createClient()
    const { data, error: queryError } = await supabase
      .from('backup_history')
      .select(`
        id, created_at, created_by, storage_path, file_size_bytes,
        is_encrypted, system_version, schema_version, total_records,
        table_count, checksum, status, expires_at, notes
      `)
      .eq('company_id', companyId)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (queryError) {
      console.error('[Backup List] Error:', queryError)
      return NextResponse.json({ success: true, backups: [] })
    }

    return NextResponse.json({
      success: true,
      backups: data || [],
      count: (data || []).length,
    })
  } catch (err: any) {
    console.error('[Backup List] Error:', err)
    return NextResponse.json(
      { success: true, backups: [], error: err?.message || 'Failed to list backups' },
      { status: 200 }
    )
  }
}
