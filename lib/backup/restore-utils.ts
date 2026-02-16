/**
 * دوال الاستعادة للنسخ الاحتياطية (Enterprise Grade)
 * Backup Restore Utilities
 */

import { createClient } from '@/lib/supabase/server'
import { BackupData, RestoreOptions, RestoreResult, QueueStatus } from './types'

/**
 * دالة الاستعادة المركزية (Atomic Restore)
 * تدعم Dry Run و Execution و Batch Processing
 */
export async function restoreBackup(
  backupData: BackupData,
  options: RestoreOptions
): Promise<RestoreResult> {
  const supabase = await createClient()
  const startTime = Date.now()

  try {
    // 1. التحقق من الصلاحيات (Owner Only)
    const permissionCheck = await canRestoreBackup(options.userId, options.companyId)
    if (!permissionCheck.allowed) {
      throw new Error(permissionCheck.reason || 'غير مصرح')
    }

    // 2. تحليل حجم البيانات لتحديد الاستراتيجية
    const BATCH_THRESHOLD = 500; // سجل لكل دفعة
    const isLargeDataset = backupData.metadata.total_records > 1000;

    // 3. إعداد بيانات الطابور
    // إذا كانت البيانات كبيرة، لا نخزنها في حقل JSONB لتجنب تجاوز الحدود ونستخدم restore_batches
    const queuePayload = isLargeDataset
      ? {
        metadata: backupData.metadata,
        schema_info: backupData.schema_info,
        data: {} // بيانات فارغة، سيتم تعبئتها في restore_batches
      }
      : backupData;

    // 4. إدخال طلب الاستعادة في الطابور
    const { data: queueEntry, error: queueError } = await supabase
      .from('restore_queue')
      .insert({
        company_id: options.companyId,
        user_id: options.userId,
        status: 'PENDING',
        backup_data: queuePayload,
        ip_address: options.ipAddress || 'unknown'
      })
      .select()
      .single()

    if (queueError || !queueEntry) {
      throw new Error(`فشل إنشاء طلب الاستعادة: ${queueError?.message}`)
    }

    // 5. معالجة الدفعات (Batch Processing) إذا كانت البيانات كبيرة
    if (isLargeDataset) {
      try {
        await processBatches(supabase, queueEntry.id, backupData.data, BATCH_THRESHOLD);
      } catch (batchError: any) {
        await updateQueueStatus(queueEntry.id, 'FAILED')
        throw new Error(`فشل معالجة الدفعات: ${batchError.message}`)
      }
    }

    // 6. استدعاء RPC تنفيذ الاستعادة (Atomic Transaction)
    // نمرر معرف الطابور، وRPC سيكتشف وجود Data أو Batches
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'restore_company_backup',
      {
        p_queue_id: queueEntry.id,
        p_dry_run: options.dryRun ?? true
      }
    )

    if (rpcError) {
      // تحديث حالة الفشل في الطابور إذا فشل RPC
      await updateQueueStatus(queueEntry.id, 'FAILED')
      throw new Error(`خطأ في تنفيذ RPC: ${rpcError.message}`)
    }

    // 7. تحليل النتيجة
    const report = rpcResult as any
    const success = report.success === true

    // تحديث حالة الطابور بناءً على النتيجة
    const finalStatus: QueueStatus = success
      ? (options.dryRun ? 'DRY_RUN_SUCCESS' : 'COMPLETED')
      : (options.dryRun ? 'DRY_RUN_FAILED' : 'FAILED')

    await updateQueueStatus(queueEntry.id, finalStatus, report)

    const duration = Date.now() - startTime

    return {
      success,
      mode: options.dryRun ? 'DRY_RUN' : 'RESTORE',
      // محاولة استخراج عدد السجلات المستعادة من التقرير
      recordsRestored: report.counts_expected
        ? Object.values(report.counts_expected).reduce((a: any, b: any) => Number(a) + Number(b), 0) as number
        : (report.summary?.totalRecords || backupData.metadata.total_records),
      duration,
      report,
      error: success ? undefined : report.error
    }

  } catch (err: any) {
    return {
      success: false,
      mode: options.dryRun ? 'DRY_RUN' : 'RESTORE',
      duration: Date.now() - startTime,
      error: err.message,
      report: undefined
    }
  }
}

/**
 * معالجة تقسيم البيانات إلى دفعات وإدراجها
 */
async function processBatches(supabase: any, queueId: string, data: Record<string, any[]>, batchSize: number) {
  const batches = [];

  for (const [tableName, records] of Object.entries(data)) {
    if (!records || !Array.isArray(records) || records.length === 0) continue;

    for (let i = 0; i < records.length; i += batchSize) {
      const chunk = records.slice(i, i + batchSize);
      batches.push({
        queue_id: queueId,
        table_name: tableName,
        batch_index: Math.floor(i / batchSize),
        data: chunk // JSONB Array
      });
    }
  }

  // إدراج الدفعات بشكل متوازي (مع مراعاة حدود الاتصال)
  // نقوم بإدراج كل 10 دفعات معاً لتسريع العملية
  const CHUNK_SIZE = 10;
  for (let i = 0; i < batches.length; i += CHUNK_SIZE) {
    const batchChunk = batches.slice(i, i + CHUNK_SIZE);

    // استخدام insert مع Supabase
    const { error } = await supabase.from('restore_batches').insert(batchChunk);

    if (error) {
      throw error;
    }
  }
}

/**
 * تحديث حالة طلب الاستعادة
 */
async function updateQueueStatus(queueId: string, status: QueueStatus, report?: any) {
  const supabase = await createClient()
  await supabase
    .from('restore_queue')
    .update({
      status,
      processed_at: new Date().toISOString(),
      report: report || undefined
    })
    .eq('id', queueId)
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

  // فقط Owner يمكنه الاستعادة (Hard Requirement)
  if (member.role !== 'owner') {
    return { allowed: false, reason: 'فقط مالك الشركة (Owner) يملك صلاحية استعادة النسخ الاحتياطية' }
  }

  return { allowed: true }
}
