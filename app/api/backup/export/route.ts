/**
 * API: تصدير نسخة احتياطية
 * Export Backup API
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerOrAdmin } from '@/lib/api-security'
import { createClient } from '@/lib/supabase/server'
import { resolveActorInfo } from '@/lib/audit-actor'
import { exportCompanyBackup, canExportBackup, estimateBackupSize } from '@/lib/backup/export-utils'

const RETENTION_DAYS = 30
const BUCKET = 'backups'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // 1. التحقق من الصلاحيات
    const { user, companyId, error } = await requireOwnerOrAdmin(request)

    if (error) return error
    if (!companyId || !user) {
      return NextResponse.json(
        { error: 'لم يتم العثور على الشركة', error_en: 'Company not found' },
        { status: 404 }
      )
    }

    // 2. التحقق من صلاحية التصدير
    const permissionCheck = await canExportBackup(user.id, companyId)
    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { error: permissionCheck.reason, error_en: 'Permission denied' },
        { status: 403 }
      )
    }

    // 3. الحصول على اسم الشركة
    const body = await request.json().catch(() => ({}))
    const companyName = body.companyName || 'Unknown Company'
    const notes: string | undefined = typeof body.notes === 'string' ? body.notes.slice(0, 500) : undefined

    // 4. تصدير النسخة الاحتياطية
    const backupData = await exportCompanyBackup(companyId, user.id, companyName)

    // 5. حساب حجم النسخة
    const sizeInfo = estimateBackupSize(backupData)

    // 6. v3.62.0 B1 — رفع نسخة إلى Supabase Storage + تسجيل صف history
    let historyId: string | null = null
    let storagePath: string | null = null

    try {
      const supabase = await createClient()
      historyId = crypto.randomUUID()
      storagePath = `${companyId}/${historyId}.json`
      const json = JSON.stringify(backupData, null, 2)
      const blob = new Blob([json], { type: 'application/json' })

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, blob, {
          contentType: 'application/json',
          upsert: false,
        })
      if (uploadError) throw uploadError

      const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

      const { error: insertError } = await supabase.from('backup_history').insert({
        id: historyId,
        company_id: companyId,
        created_by: user.id,
        storage_bucket: BUCKET,
        storage_path: storagePath,
        file_size_bytes: sizeInfo.sizeInBytes,
        is_encrypted: false,             // server-side stored copy is plaintext; client may also keep an encrypted local copy
        system_version: backupData.metadata.system_version,
        schema_version: backupData.metadata.schema_version,
        total_records: backupData.metadata.total_records,
        table_count: Object.keys(backupData.data || {}).length,
        checksum: backupData.metadata.checksum,
        status: 'completed',
        expires_at: expiresAt,
        notes: notes ?? null,
      })
      if (insertError) {
        // Try to clean up the orphan file if metadata insert fails
        await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined)
        throw insertError
      }
    } catch (storageErr: any) {
      console.warn('[Backup Export] Storage/history skipped:', storageErr?.message || storageErr)
      // Non-fatal — we still return the in-memory backup so the user can download
      historyId = null
      storagePath = null
    }

    // 7. تسجيل في Audit Log — server-side direct insert (logAudit wrapper is client-only)
    try {
      const auditSupabase = await createClient()
      await auditSupabase.from('audit_logs').insert({
        company_id: companyId,
        user_id: user.id,
        ...resolveActorInfo(user),
        action: 'backup_export',
        target_table: 'backup_history',
        record_id: historyId || companyId,
        record_identifier: `تصدير نسخة احتياطية كاملة (${backupData.metadata.total_records} سجل)`,
        metadata: {
          total_records: backupData.metadata.total_records,
          size_mb: sizeInfo.sizeInMB,
          duration_seconds: Math.round((Date.now() - startTime) / 1000),
          history_id: historyId,
          storage_path: storagePath,
        },
      })
    } catch (auditErr: any) {
      console.warn('[Backup Export] audit log skipped:', auditErr?.message || auditErr)
    }

    // 8. إرجاع النسخة الاحتياطية + رقم history للـ UI ليُحدِّث القائمة
    return NextResponse.json({
      success: true,
      message: 'تم تصدير النسخة الاحتياطية بنجاح',
      message_en: 'Backup exported successfully',
      data: backupData,
      info: {
        total_records: backupData.metadata.total_records,
        size_mb: sizeInfo.sizeInMB,
        duration_seconds: Math.round((Date.now() - startTime) / 1000),
        history_id: historyId,
        storage_path: storagePath,
        retention_days: RETENTION_DAYS,
      }
    })
  } catch (err: any) {
    console.error('[Backup Export] Error:', err)

    return NextResponse.json(
      {
        error: 'فشل تصدير النسخة الاحتياطية',
        error_en: 'Failed to export backup',
        details: err.message
      },
      { status: 500 }
    )
  }
}

// GET: الحصول على معلومات عن آخر نسخة احتياطية
export async function GET(request: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(request)

    if (error) return error
    if (!companyId || !user) {
      return NextResponse.json(
        { error: 'لم يتم العثور على الشركة', error_en: 'Company not found' },
        { status: 404 }
      )
    }

    // يمكن إضافة منطق للحصول على معلومات آخر نسخة احتياطية من Audit Log
    // حالياً نرجع معلومات أساسية فقط

    return NextResponse.json({
      success: true,
      message: 'معلومات النسخ الاحتياطية',
      data: {
        last_backup: null, // يمكن جلبها من Audit Log
        backup_available: true
      }
    })
  } catch (err: any) {
    console.error('[Backup Info] Error:', err)

    return NextResponse.json(
      {
        error: 'فشل الحصول على معلومات النسخ الاحتياطية',
        error_en: 'Failed to get backup info',
        details: err.message
      },
      { status: 500 }
    )
  }
}

