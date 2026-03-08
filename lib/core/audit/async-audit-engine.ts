import { createClient } from '@/lib/supabase/server';

export interface AuditEventPayload {
    companyId: string;
    userId: string;
    userEmail?: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'REVERT';
    table: string;
    recordId: string;
    recordIdentifier?: string; // e.g. INV-2026-001
    oldData?: any;
    newData?: any;
    reason?: string;
    correlationId?: string; // لربط عدة أحداث بطلب واحد في الـ Server
}

/**
 * Async Audit Engine (Non-Blocking Global Logger)
 * 
 * المكون المسؤول عن تسجيل الأحداث في سجل التدقيق (Audit Log)
 * - لا يتم تعليق الـ Response انتظاراً للحفظ في قاعدة البيانات (Non-blocking).
 * - يستخدم Fire-And-Forget لضمان عدم إبطاء العمليات المالية عالية الأداء.
 */
export async function asyncAuditLog(events: AuditEventPayload | AuditEventPayload[]) {
    // تغليف الحدث الواحد في مصفوفة لتوحيد المعالجة (Batching Support)
    const eventArray = Array.isArray(events) ? events : [events];

    // تشغيل الحفظ في الخلفية دون `await` لتعطيل الـ Execution Thread
    Promise.resolve().then(async () => {
        try {
            const supabase = await createClient(); // ملاحظة: تعتمد على الـ Environment، في البيئات الحديثة يجب أن يكون الـ Auth Admin

            const logEntries = eventArray.map(e => ({
                company_id: e.companyId,
                user_id: e.userId,
                user_email: e.userEmail,
                action: e.action,
                target_table: e.table,
                record_id: e.recordId,
                record_identifier: e.recordIdentifier,
                old_data: e.oldData,
                new_data: e.newData,
                reason: e.reason,
                // إعداد Correlation ID للبحث المتزامن في الـ Logs
                // يمكن تخزينه في `settings` أو `metadata` إذا لم يكن له حقل خاص في الجدول
                reason: e.correlationId ? `[TX:${e.correlationId}] ${e.reason || ''}`.trim() : e.reason
            }));

            const { error } = await supabase.from('audit_logs').insert(logEntries);

            if (error) {
                // في الـ Production يتم إرسال هذا السجل الخاطئ إلى ملف أو Queue للطوارئ
                console.error(`[AUDIT_ENGINE_FATAL] Failed to write the following audit logs to DB. Data might be lost:`, error, logEntries);
            }

        } catch (err) {
            console.error(`[AUDIT_ENGINE_CRASH] Fatal crash while preparing async audit log.`, err);
        }
    });

    // نعيد نجاح وهمي مباشرة للـ Caller لكي لا يتأخر الـ Response Client-Side
    return true;
}
