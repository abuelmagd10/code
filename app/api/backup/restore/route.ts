/**
 * API: استعادة نسخة احتياطية
 * Restore Backup API
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/api-security'
import { restoreBackup, canRestoreBackup } from '@/lib/backup/restore-utils'
import { BackupData, RestoreOptions } from '@/lib/backup/types'
import { logAudit } from '@/lib/audit-log'

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

    // 6. تسجيل في Audit Log
    await logAudit({
      company_id: companyId,
      user_id: user.id,
      action: result.success ? 'backup_restore' : 'backup_restore_failed',
      target_table: 'system',
      target_id: companyId,
      description: result.success
        ? `استعادة نسخة احتياطية (${result.recordsRestored} سجل)`
        : `فشل استعادة نسخة احتياطية: ${result.error || 'Unknown Error'}`,
      metadata: {
        records_restored: result.recordsRestored || 0,
        duration_seconds: Math.round((result.duration || 0) / 1000),
        success: result.success,
        errors: result.error ? [result.error] : [],
        warnings: result.warnings
      }
    })

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
        await logAudit({
          company_id: companyId,
          user_id: user.id,
          action: 'backup_restore_failed',
          target_table: 'system',
          target_id: companyId,
          description: `فشل استعادة نسخة احتياطية: ${err.message}`,
          metadata: {
            error: err.message,
            duration_seconds: Math.round((Date.now() - startTime) / 1000)
          }
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

