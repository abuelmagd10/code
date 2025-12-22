/**
 * API: التحقق من صحة النسخة الاحتياطية
 * Validate Backup API
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/api-security'
import { validateBackup } from '@/lib/backup/validation-utils'
import { BackupData } from '@/lib/backup/types'

export async function POST(request: NextRequest) {
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

    // 2. قراءة بيانات النسخة الاحتياطية
    const body = await request.json()
    const backupData: BackupData = body.backupData

    if (!backupData || !backupData.metadata || !backupData.data) {
      return NextResponse.json(
        {
          error: 'تنسيق ملف النسخة الاحتياطية غير صالح',
          error_en: 'Invalid backup file format'
        },
        { status: 400 }
      )
    }

    // 3. التحقق من صحة النسخة
    const validationResult = await validateBackup(backupData, companyId)

    // 4. إرجاع نتيجة التحقق
    return NextResponse.json({
      success: validationResult.valid,
      message: validationResult.valid
        ? 'النسخة الاحتياطية صالحة للاستعادة'
        : 'النسخة الاحتياطية تحتوي على أخطاء',
      message_en: validationResult.valid
        ? 'Backup is valid for restore'
        : 'Backup contains errors',
      validation: {
        valid: validationResult.valid,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        report: validationResult.report
      }
    })
  } catch (err: any) {
    console.error('[Backup Validate] Error:', err)

    return NextResponse.json(
      {
        error: 'فشل التحقق من النسخة الاحتياطية',
        error_en: 'Failed to validate backup',
        details: err.message
      },
      { status: 500 }
    )
  }
}

