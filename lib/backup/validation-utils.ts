/**
 * دوال التحقق من صحة النسخ الاحتياطية
 * Backup Validation Utilities
 */

import { createClient } from '@/lib/supabase/server'
import { BackupData, ValidationResult, ValidationError, ValidationWarning, ValidationReport } from './types'
import crypto from 'crypto'

const SYSTEM_VERSION = '1.0.0'

/**
 * التحقق من صحة النسخة الاحتياطية
 */
export async function validateBackup(
  backupData: BackupData,
  targetCompanyId: string
): Promise<ValidationResult> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  // 1. التحقق من البنية الأساسية
  if (!backupData.metadata || !backupData.data) {
    errors.push({
      type: 'schema_mismatch',
      message: 'تنسيق ملف النسخة الاحتياطية غير صالح'
    })
    return {
      valid: false,
      errors,
      warnings,
      report: createEmptyReport()
    }
  }

  // 2. التحقق من إصدار النظام
  const versionCheck = validateSystemVersion(backupData.metadata.system_version)
  if (!versionCheck.valid) {
    errors.push({
      type: 'system_version',
      message: versionCheck.message,
      details: { backup: backupData.metadata.system_version, current: SYSTEM_VERSION }
    })
  }

  // 3. التحقق من Checksum
  const checksumValid = validateChecksum(backupData)
  if (!checksumValid) {
    errors.push({
      type: 'schema_mismatch',
      message: 'فشل التحقق من سلامة البيانات (Checksum mismatch)'
    })
  }

  // 4. التحقق من أن الشركة المستهدفة فارغة
  const emptyCheck = await validateEmptyCompany(targetCompanyId)
  if (!emptyCheck.isEmpty) {
    errors.push({
      type: 'accounting_integrity',
      message: 'الشركة المستهدفة يجب أن تكون فارغة (لا توجد فواتير أو قيود محاسبية)',
      details: emptyCheck.details
    })
  }

  // 5. التحقق من سلامة العلاقات (Foreign Keys)
  const fkCheck = validateForeignKeys(backupData)
  if (!fkCheck.valid) {
    errors.push({
      type: 'foreign_key',
      message: 'توجد علاقات مكسورة في البيانات',
      details: fkCheck.brokenReferences
    })
  }

  // 6. التحقق من سلامة القيود المحاسبية
  const accountingCheck = validateAccountingIntegrity(backupData)
  if (!accountingCheck.valid) {
    warnings.push({
      type: 'data_loss',
      message: `توجد ${accountingCheck.unbalancedCount} قيود محاسبية غير متوازنة`,
      severity: 'high'
    })
  }

  // 7. إنشاء التقرير
  const report = await createValidationReport(backupData, targetCompanyId)

  // 8. إضافة تحذيرات عامة
  warnings.push({
    type: 'data_replacement',
    message: 'سيتم استبدال جميع بيانات الشركة الحالية',
    severity: 'high'
  })

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    report
  }
}

/**
 * التحقق من توافق إصدار النظام
 */
function validateSystemVersion(backupVersion: string): { valid: boolean; message: string } {
  // حالياً نقبل نفس الإصدار فقط
  if (backupVersion !== SYSTEM_VERSION) {
    return {
      valid: false,
      message: `إصدار النظام غير متوافق. النسخة الاحتياطية: ${backupVersion}، النظام الحالي: ${SYSTEM_VERSION}`
    }
  }
  return { valid: true, message: 'إصدار النظام متوافق' }
}

/**
 * التحقق من Checksum
 */
function validateChecksum(backupData: BackupData): boolean {
  const dataString = JSON.stringify(backupData.data)
  const calculatedChecksum = crypto
    .createHash('sha256')
    .update(dataString)
    .digest('hex')

  return calculatedChecksum === backupData.metadata.checksum
}

/**
 * التحقق من أن الشركة فارغة
 */
async function validateEmptyCompany(companyId: string): Promise<{
  isEmpty: boolean
  details: { invoices: number; journal_entries: number }
}> {
  const supabase = await createClient()

  // فحص الفواتير
  const { count: invoiceCount } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)

  // فحص القيود المحاسبية
  const { count: journalCount } = await supabase
    .from('journal_entries')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)

  const isEmpty = (invoiceCount || 0) === 0 && (journalCount || 0) === 0

  return {
    isEmpty,
    details: {
      invoices: invoiceCount || 0,
      journal_entries: journalCount || 0
    }
  }
}

/**
 * التحقق من سلامة العلاقات (Foreign Keys)
 */
function validateForeignKeys(backupData: BackupData): {
  valid: boolean
  brokenReferences: string[]
} {
  const brokenReferences: string[] = []

  // فحص أن جميع customer_id في invoices موجودة في customers
  const customerIds = new Set(backupData.data.customers?.map((c: any) => c.id) || [])
  const invoices = backupData.data.invoices || []
  
  for (const invoice of invoices) {
    if (invoice.customer_id && !customerIds.has(invoice.customer_id)) {
      brokenReferences.push(`Invoice ${invoice.invoice_number} references missing customer ${invoice.customer_id}`)
    }
  }

  // يمكن إضافة المزيد من الفحوصات هنا

  return {
    valid: brokenReferences.length === 0,
    brokenReferences
  }
}

/**
 * التحقق من سلامة القيود المحاسبية
 */
function validateAccountingIntegrity(backupData: BackupData): {
  valid: boolean
  unbalancedCount: number
} {
  const journalEntries = backupData.data.journal_entries || []
  const journalLines = backupData.data.journal_entry_lines || []
  
  let unbalancedCount = 0

  for (const entry of journalEntries) {
    const lines = journalLines.filter((l: any) => l.journal_entry_id === entry.id)
    const totalDebit = lines.reduce((sum: number, l: any) => sum + Number(l.debit_amount || 0), 0)
    const totalCredit = lines.reduce((sum: number, l: any) => sum + Number(l.credit_amount || 0), 0)

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      unbalancedCount++
    }
  }

  return {
    valid: unbalancedCount === 0,
    unbalancedCount
  }
}

/**
 * إنشاء تقرير التحقق
 */
async function createValidationReport(
  backupData: BackupData,
  targetCompanyId: string
): Promise<ValidationReport> {
  const totalRecords = backupData.metadata.total_records
  const estimatedTime = estimateRestoreTime(totalRecords)

  const breakdown: Record<string, { count: number; action: 'insert' | 'update' | 'delete' | 'skip' }> = {}
  
  for (const [tableName, records] of Object.entries(backupData.data)) {
    if (Array.isArray(records)) {
      breakdown[tableName] = {
        count: records.length,
        action: 'insert'
      }
    }
  }

  return {
    summary: {
      totalRecords,
      recordsToInsert: totalRecords,
      recordsToUpdate: 0,
      recordsToDelete: 0,
      estimatedTime
    },
    breakdown,
    warnings: [
      '⚠️ سيتم استبدال بيانات الشركة الحالية',
      '⚠️ لا يمكن التراجع عن هذه العملية',
      '⚠️ يُنصح بعمل نسخة احتياطية للبيانات الحالية أولاً'
    ],
    risks: {
      dataLoss: 'high',
      recommendation: 'تأكد من أن هذه هي النسخة الصحيحة قبل المتابعة'
    }
  }
}

/**
 * تقدير وقت الاستعادة
 */
function estimateRestoreTime(recordCount: number): string {
  // تقدير: 500 سجل/ثانية
  const seconds = Math.ceil(recordCount / 500)
  
  if (seconds < 60) {
    return `${seconds} ثانية`
  } else if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60)
    return `${minutes} دقيقة`
  } else {
    const hours = Math.ceil(seconds / 3600)
    return `${hours} ساعة`
  }
}

/**
 * إنشاء تقرير فارغ
 */
function createEmptyReport(): ValidationReport {
  return {
    summary: {
      totalRecords: 0,
      recordsToInsert: 0,
      recordsToUpdate: 0,
      recordsToDelete: 0,
      estimatedTime: '0 ثانية'
    },
    breakdown: {},
    warnings: [],
    risks: {
      dataLoss: 'none',
      recommendation: ''
    }
  }
}

