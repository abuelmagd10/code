import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerOrAdmin } from '@/lib/api-security'
import { createClient } from '@/lib/supabase/server'

const SIGNED_URL_TTL_SEC = 300 // 5 minutes

/**
 * GET /api/backup/[id]/download
 *
 * Returns a short-lived (5 min) signed URL for a backup file in the
 * `backups` Storage bucket. RLS on both backup_history and the Storage
 * bucket guarantees the caller can only access their own company's files.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      return NextResponse.json({ error: 'Invalid backup id' }, { status: 400 })
    }

    const { user, companyId, error } = await requireOwnerOrAdmin(request)
    if (error) return error
    if (!companyId || !user) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const supabase = await createClient()
    const { data: row, error: rowErr } = await supabase
      .from('backup_history')
      .select('id, company_id, storage_bucket, storage_path, status')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()

    if (rowErr || !row) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 })
    }
    if (row.status === 'deleted') {
      return NextResponse.json({ error: 'Backup has been deleted' }, { status: 410 })
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(row.storage_bucket || 'backups')
      .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SEC)

    if (signErr || !signed?.signedUrl) {
      console.error('[Backup Download] Sign error:', signErr)
      return NextResponse.json({ error: 'Failed to create download URL' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      url: signed.signedUrl,
      expires_in_seconds: SIGNED_URL_TTL_SEC,
    })
  } catch (err: any) {
    console.error('[Backup Download] Error:', err)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
