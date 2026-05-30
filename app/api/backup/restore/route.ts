/**
 * API: استعادة نسخة احتياطية
 * Restore Backup API
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/api-security'
import { createClient } from '@/lib/supabase/server'
import { resolveActorInfo } from '@/lib/audit-actor'
import { restoreBackup, canRestoreBackup } from '@/lib/backup/restore-utils'
import { BackupData, RestoreOptions } from '@/lib/backup/types'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // 1. التحقق من الصلاحيات (Owner فقط)
    const { user, companyId, error } = await requireOwner(request)

    if (error) return error
    if (!companyId || !user) {
      return NextResponse.json(
        { error: 'لم يتم العثور على الشركة', error_en: 'Company not found' },
        { status: 404 }
      )
    }

    // 2. التحقق من صلاحية الاستعادة
    const permissionCheck = await canRestoreBackup(user.id, companyId)
    if (!permissionCheck.allowed) {
      return NextResponse.json(
        { error: permissionCheck.reason, error_en: 'Permission denied' },
        { status: 403 }
      )
    }

    // 3. قراءة بيانات النسخة الاحتياطية
    const body = await request.json()
    const backupData: BackupData = body.backupData
    const skipValidation = body.skipValidation === true
    const dryRun = body.dryRun === true

    if (!backupData || !backupData.metadata || !backupData.data) {
      return NextResponse.json(
        {
          error: 'تنسيق ملف النسخة الاحتياطية غير صالح',
          error_en: 'Invalid backup file format'
        },
        { status: 400 }
      )
    }

    // v3.61.0 A2: cross-tenant restore protection.
    // The backup metadata MUST reference the same company we are restoring into.
    // Without this check, an owner of company B who somehow obtained company A's
    // backup file could restore A's data into B.
    if (backupData.metadata.company_id && backupData.metadata.company_id !== companyId) {
      return NextResponse.json(
        {
          error: 'هذه النسخة الاحتياطية تخص شركة أخرى ولا يمكن استعادتها هنا',
          error_en: 'This backup belongs to a different company and cannot be restored here',
          details: {
            backup_company_id: backupData.metadata.company_id,
            target_company_id: companyId,
          },
        },
        { status: 403 }
      )
    }

    // 4. إعداد خيارات الاستعادة
    const restoreOptions: RestoreOptions = {
      mode: 'restore_to_empty',
      companyId,
      userId: user.id,
      skipValidation,
      dryRun
    }

    // 5. تنفيذ الاستعادة
    const result = await restoreBackup(backupData, restoreOptions)

    // 6. تسجيل في Audit Log (server-side direct insert)
    try {
      const auditSupabase = await createClient()
      await auditSupabase.from('audit_logs').insert({
        company_id: companyId,
        user_id: user.id,
        ...resolveActorInfo(user),
        action: result.success ? 'backup_restore' : 'backup_restore_failed',
        target_table: 'system',
        record_id: companyId,
        record_identifier: result.success
          ? `استعادة نسخة احتياطية (${result.recordsRestored} سجل)`
          : `فشل استعادة نسخة احتياطية: ${result.error || 'Unknown Error'}`,
        metadata: {
          records_restored: result.recordsRestored || 0,
          duration_seconds: Math.round((result.duration || 0) / 1000),
          success: result.success,
          errors: result.error ? [result.error] : [],
          warnings: result.warnings,
        },
      })
    } catch (auditErr: any) {
      console.warn('[Backup Restore] audit log skipped:', auditErr?.message || auditErr)
    }

    // 7. إرجاع النتيجة
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: dryRun
          ? 'اختبار الاستعادة نجح'
          : 'تم استعادة النسخة الاحتياطية بنجاح',
        message_en: dryRun
          ? 'Restore test successful'
          : 'Backup restored successfully',
        result: {
          records_restored: result.recordsRestored || 0,
          duration_seconds: Math.round((result.duration || 0) / 1000),
          warnings: result.warnings,
          report: result.report
        }
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'فشل استعادة النسخة الاحتياطية',
          error_en: 'Failed to restore backup',
          result: {
            records_restored: result.recordsRestored || 0,
            duration_seconds: Math.round((result.duration || 0) / 1000),
            errors: result.error ? [result.error] : [],
            warnings: result.warnings
          }
        },
        { status: 500 }
      )
    }
  } catch (err: any) {
    console.error('[Backup Restore] Error:', err)

    // تسجيل الفشل في Audit Log
    try {
      const { user, companyId } = await requireOwner(request)
      if (user && companyId) {
        const auditSupabase = await createClient()
        await auditSupabase.from('audit_logs').insert({
          company_id: companyId,
          user_id: user.id,
          ...resolveActorInfo(user),
          action: 'backup_restore_failed',
          target_table: 'system',
          record_id: companyId,
          record_identifier: `فشل استعادة نسخة احتياطية: ${err.message}`,
          metadata: {
            error: err.message,
            duration_seconds: Math.round((Date.now() - startTime) / 1000),
          },
        })
      }
    } catch {
      // تجاهل أخطاء Audit Log
    }

    return NextResponse.json(
      {
        error: 'فشل استعادة النسخة الاحتياطية',
        error_en: 'Failed to restore backup',
        details: err.message
      },
      { status: 500 }
    )
  }
}

