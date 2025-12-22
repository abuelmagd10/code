/**
 * API: تصدير نسخة احتياطية
 * Export Backup API
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireOwnerOrAdmin } from '@/lib/api-security'
import { exportCompanyBackup, canExportBackup, estimateBackupSize } from '@/lib/backup/export-utils'
import { logAudit } from '@/lib/audit-log'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // 1. التحقق من الصلاحيات
    const { user, companyId, member, error } = await requireOwnerOrAdmin(request)

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

    // 4. تصدير النسخة الاحتياطية
    const backupData = await exportCompanyBackup(companyId, user.id, companyName)

    // 5. حساب حجم النسخة
    const sizeInfo = estimateBackupSize(backupData)

    // 6. تسجيل في Audit Log
    await logAudit({
      company_id: companyId,
      user_id: user.id,
      action: 'backup_export',
      target_table: 'system',
      target_id: companyId,
      description: `تصدير نسخة احتياطية كاملة (${backupData.metadata.total_records} سجل)`,
      metadata: {
        total_records: backupData.metadata.total_records,
        size_mb: sizeInfo.sizeInMB,
        duration_seconds: Math.round((Date.now() - startTime) / 1000)
      }
    })

    // 7. إرجاع النسخة الاحتياطية
    return NextResponse.json({
      success: true,
      message: 'تم تصدير النسخة الاحتياطية بنجاح',
      message_en: 'Backup exported successfully',
      data: backupData,
      info: {
        total_records: backupData.metadata.total_records,
        size_mb: sizeInfo.sizeInMB,
        duration_seconds: Math.round((Date.now() - startTime) / 1000)
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

