/**
 * دوال الاستعادة للنسخ الاحتياطية
 * Backup Restore Utilities
 */

import { createClient } from '@/lib/supabase/server'
import { BackupData, RestoreOptions, RestoreResult, EXPORT_ORDER } from './types'
import { validateBackup } from './validation-utils'

/**
 * استعادة نسخة احتياطية
 */
export async function restoreBackup(
  backupData: BackupData,
  options: RestoreOptions
): Promise<RestoreResult> {
  const startTime = Date.now()
  const errors: string[] = []
  const warnings: string[] = []
  let recordsRestored = 0

  try {
    // 1. التحقق من الصلاحيات
    const permissionCheck = await canRestoreBackup(options.userId, options.companyId)
    if (!permissionCheck.allowed) {
      throw new Error(permissionCheck.reason || 'غير مصرح')
    }

    // 2. التحقق من صحة النسخة (إلا إذا تم تخطيه)
    if (!options.skipValidation) {
      const validation = await validateBackup(backupData, options.companyId)
      if (!validation.valid) {
        throw new Error(`فشل التحقق: ${validation.errors.map(e => e.message).join(', ')}`)
      }
    }

    // 3. Dry Run (اختبار بدون تنفيذ فعلي)
    if (options.dryRun) {
      return {
        success: true,
        recordsRestored: backupData.metadata.total_records,
        duration: Date.now() - startTime,
        errors: [],
        warnings: ['هذا اختبار فقط - لم يتم تنفيذ الاستعادة الفعلية']
      }
    }

    // 4. تنفيذ الاستعادة
    const supabase = await createClient()

    // 5. حذف البيانات الحالية (إذا لزم الأمر)
    if (options.mode === 'restore_to_empty') {
      await clearCompanyData(options.companyId)
    }

    // 6. استعادة البيانات حسب الترتيب
    for (const tableName of EXPORT_ORDER) {
      const records = backupData.data[tableName]
      if (!records || !Array.isArray(records) || records.length === 0) {
        continue
      }

      try {
        // استبدال company_id بالشركة المستهدفة
        const recordsToInsert = records.map(record => ({
          ...record,
          company_id: options.companyId
        }))

        // إدراج البيانات
        const { error } = await supabase
          .from(tableName)
          .insert(recordsToInsert)

        if (error) {
          // محاولة الإدراج سجل بسجل في حالة الفشل
          let successCount = 0
          for (const record of recordsToInsert) {
            const { error: singleError } = await supabase
              .from(tableName)
              .insert(record)
            
            if (!singleError) {
              successCount++
            } else {
              errors.push(`فشل إدراج سجل في ${tableName}: ${singleError.message}`)
            }
          }
          recordsRestored += successCount
          warnings.push(`تم استعادة ${successCount}/${records.length} سجل من ${tableName}`)
        } else {
          recordsRestored += records.length
        }
      } catch (err: any) {
        errors.push(`خطأ في استعادة ${tableName}: ${err.message}`)
      }
    }

    // 7. التحقق من النتائج
    const verificationResult = await verifyRestoreIntegrity(options.companyId, backupData)
    if (!verificationResult.valid) {
      warnings.push(...verificationResult.warnings)
    }

    const duration = Date.now() - startTime

    return {
      success: errors.length === 0,
      recordsRestored,
      duration,
      errors,
      warnings
    }
  } catch (err: any) {
    return {
      success: false,
      recordsRestored,
      duration: Date.now() - startTime,
      errors: [err.message],
      warnings
    }
  }
}

/**
 * التحقق من صلاحية المستخدم للاستعادة
 */
export async function canRestoreBackup(
  userId: string,
  companyId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const supabase = await createClient()

  const { data: member, error } = await supabase
    .from('company_members')
    .select('role')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .single()

  if (error || !member) {
    return { allowed: false, reason: 'المستخدم ليس عضواً في الشركة' }
  }

  // فقط Owner يمكنه الاستعادة
  if (member.role !== 'owner') {
    return { allowed: false, reason: 'فقط مالك الشركة يمكنه استعادة النسخ الاحتياطية' }
  }

  return { allowed: true }
}

/**
 * حذف بيانات الشركة الحالية
 */
async function clearCompanyData(companyId: string): Promise<void> {
  const supabase = await createClient()

  // حذف البيانات بترتيب عكسي (لتجنب مشاكل Foreign Keys)
  const reversedOrder = [...EXPORT_ORDER].reverse()

  for (const tableName of reversedOrder) {
    if (tableName === 'companies') continue // لا نحذف الشركة نفسها

    try {
      await supabase
        .from(tableName)
        .delete()
        .eq('company_id', companyId)
    } catch (err) {
      console.warn(`تحذير: فشل حذف بيانات ${tableName}:`, err)
    }
  }
}

/**
 * التحقق من سلامة البيانات بعد الاستعادة
 */
async function verifyRestoreIntegrity(
  companyId: string,
  backupData: BackupData
): Promise<{ valid: boolean; warnings: string[] }> {
  const warnings: string[] = []
  const supabase = await createClient()

  // 1. التحقق من عدد السجلات
  for (const tableName of EXPORT_ORDER) {
    const expectedCount = backupData.data[tableName]?.length || 0
    if (expectedCount === 0) continue

    try {
      const { count } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)

      if (count !== expectedCount) {
        warnings.push(`عدد السجلات في ${tableName} غير متطابق: متوقع ${expectedCount}، فعلي ${count}`)
      }
    } catch (err) {
      warnings.push(`فشل التحقق من ${tableName}`)
    }
  }

  // 2. التحقق من توازن القيود المحاسبية
  const { data: journalEntries } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('company_id', companyId)

  if (journalEntries) {
    for (const entry of journalEntries) {
      const { data: lines } = await supabase
        .from('journal_entry_lines')
        .select('debit_amount, credit_amount')
        .eq('journal_entry_id', entry.id)

      if (lines) {
        const totalDebit = lines.reduce((sum: number, l: { debit_amount?: number | null; credit_amount?: number | null }) => sum + Number(l.debit_amount || 0), 0)
        const totalCredit = lines.reduce((sum: number, l: { debit_amount?: number | null; credit_amount?: number | null }) => sum + Number(l.credit_amount || 0), 0)

        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          warnings.push(`قيد محاسبي غير متوازن: ${entry.id}`)
        }
      }
    }
  }

  return {
    valid: warnings.length === 0,
    warnings
  }
}

