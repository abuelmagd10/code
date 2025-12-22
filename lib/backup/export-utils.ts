/**
 * دوال التصدير للنسخ الاحتياطية
 * Backup Export Utilities
 */

import { createClient } from '@/lib/supabase/server'
import { BackupData, BackupMetadata, EXPORT_ORDER, EXCLUDED_TABLES } from './types'
import crypto from 'crypto'

const SYSTEM_VERSION = '1.0.0'
const BACKUP_VERSION = '2.0'

/**
 * تصدير نسخة احتياطية كاملة لشركة
 */
export async function exportCompanyBackup(
  companyId: string,
  userId: string,
  companyName: string
): Promise<BackupData> {
  const supabase = createClient()
  const startTime = Date.now()
  
  const data: Record<string, any[]> = {}
  let totalRecords = 0

  // 1. تصدير بيانات الشركة
  const { data: companyData, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single()

  if (companyError || !companyData) {
    throw new Error('فشل في جلب بيانات الشركة')
  }

  data['companies'] = [companyData]
  totalRecords += 1

  // 2. تصدير الجداول حسب الترتيب
  for (const tableName of EXPORT_ORDER) {
    if (tableName === 'companies') continue // تم تصديرها بالفعل
    
    try {
      const { data: tableData, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('company_id', companyId)

      if (!error && tableData && tableData.length > 0) {
        // استبعاد الحقول الحساسة
        const cleanedData = tableData.map(record => cleanSensitiveFields(record, tableName))
        data[tableName] = cleanedData
        totalRecords += cleanedData.length
      } else {
        data[tableName] = []
      }
    } catch (err) {
      console.warn(`تحذير: فشل تصدير جدول ${tableName}:`, err)
      data[tableName] = []
    }
  }

  // 3. إنشاء Metadata
  const metadata: BackupMetadata = {
    version: BACKUP_VERSION,
    system_version: SYSTEM_VERSION,
    created_at: new Date().toISOString(),
    created_by: userId,
    company_id: companyId,
    company_name: companyName,
    backup_type: 'full',
    total_records: totalRecords,
    checksum: '' // سيتم حسابه لاحقاً
  }

  // 4. إنشاء Schema Info
  const schema_info = {
    tables: Object.keys(data),
    table_versions: {} as Record<string, string>
  }

  // 5. إنشاء الكائن النهائي
  const backupData: BackupData = {
    metadata,
    schema_info,
    data,
    excluded_data: {
      reason: 'security',
      tables: [...EXCLUDED_TABLES]
    }
  }

  // 6. حساب Checksum
  const dataString = JSON.stringify(backupData.data)
  backupData.metadata.checksum = crypto
    .createHash('sha256')
    .update(dataString)
    .digest('hex')

  return backupData
}

/**
 * تنظيف الحقول الحساسة من السجل
 */
function cleanSensitiveFields(record: any, tableName: string): any {
  const cleaned = { ...record }

  // حقول حساسة عامة
  const sensitiveFields = [
    'password',
    'encrypted_password',
    'password_hash',
    'api_key',
    'secret_key',
    'access_token',
    'refresh_token',
    'token'
  ]

  // حذف الحقول الحساسة
  for (const field of sensitiveFields) {
    if (field in cleaned) {
      delete cleaned[field]
    }
  }

  // معالجة خاصة لجداول معينة
  if (tableName === 'company_members') {
    // الاحتفاظ بالعلاقة فقط، حذف البيانات الشخصية
    delete cleaned.email
  }

  return cleaned
}

/**
 * التحقق من صلاحية المستخدم للتصدير
 */
export async function canExportBackup(
  userId: string,
  companyId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const supabase = createClient()

  const { data: member, error } = await supabase
    .from('company_members')
    .select('role')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .single()

  if (error || !member) {
    return { allowed: false, reason: 'المستخدم ليس عضواً في الشركة' }
  }

  if (!['owner', 'admin'].includes(member.role)) {
    return { allowed: false, reason: 'فقط المالك أو المدير يمكنه تصدير النسخ الاحتياطية' }
  }

  return { allowed: true }
}

/**
 * حساب حجم النسخة الاحتياطية التقريبي
 */
export function estimateBackupSize(backupData: BackupData): {
  sizeInBytes: number
  sizeInMB: number
  recordCount: number
} {
  const jsonString = JSON.stringify(backupData)
  const sizeInBytes = new Blob([jsonString]).size
  const sizeInMB = Math.round((sizeInBytes / (1024 * 1024)) * 100) / 100

  return {
    sizeInBytes,
    sizeInMB,
    recordCount: backupData.metadata.total_records
  }
}

