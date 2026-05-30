import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/api-security'
import { createClient } from '@/lib/supabase/server'

/**
 * DELETE /api/backup/[id]
 *
 * Owner-only. Deletes the file from Storage and marks the history row
 * as `status='deleted'` (we never hard-delete the row so the audit trail
 * stays consistent). Audited.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      return NextResponse.json({ error: 'Invalid backup id' }, { status: 400 })
    }

    const { user, companyId, error } = await requireOwner(request)
    if (error) return error
    if (!companyId || !user) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const supabase = await createClient()
    const { data: row } = await supabase
      .from('backup_history')
      .select('id, company_id, storage_bucket, storage_path, status, file_size_bytes')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle()

    if (!row) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 })
    }
    if (row.status === 'deleted') {
      return NextResponse.json({ success: true, alreadyDeleted: true })
    }

    // Remove file from Storage
    const { error: rmErr } = await supabase.storage
      .from(row.storage_bucket || 'backups')
      .remove([row.storage_path])
    if (rmErr) {
      console.warn('[Backup Delete] Storage remove warning:', rmErr.message)
      // Continue — we still mark the row as deleted
    }

    // Mark row as deleted (soft delete keeps the audit trail intact)
    const { error: updErr } = await supabase
      .from('backup_history')
      .update({ status: 'deleted' })
      .eq('id', id)
      .eq('company_id', companyId)
    if (updErr) {
      return NextResponse.json({ error: 'Failed to mark deleted' }, { status: 500 })
    }

    try {
      await supabase.from('audit_logs').insert({
        company_id: companyId,
        user_id: user.id,
        action: 'backup_delete',
        target_table: 'backup_history',
        record_id: id,
        record_identifier: 'حذف نسخة احتياطية من السجل',
        metadata: {
          storage_path: row.storage_path,
          size_bytes: row.file_size_bytes,
        },
      })
    } catch (auditErr: any) {
      console.warn('[Backup Delete] audit log skipped:', auditErr?.message || auditErr)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[Backup Delete] Error:', err)
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 })
  }
}
