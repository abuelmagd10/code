import { ERPContext } from '@/lib/core/security/api-guard';
import { executeAtomicOperation } from '@/lib/core/db/transaction-runner';
import { asyncAuditLog } from '@/lib/core/audit/async-audit-engine';
import { ErrorHandler } from '@/lib/core/errors/error-handler';

export interface JournalEntryPayload {
    date: string;
    reference: string;
    description: string;
    lines: Array<{
        account_id: string;
        description: string;
        debit: number;
        credit: number;
        cost_center_id?: string;
    }>;
}

/**
 * Journal Service (Business Layer)
 * 
 * الخدمة المسؤولة عن معالجة القيود اليومية المحاسبية.
 * معزولة تماماً عن الـ HTTP Requests.
 */
export class JournalService {
    /**
     * إنشاء قيد يومية جديد مع التأكد من سلامة البيانات والترانزكشن
     */
    static async postJournalEntry(ctx: ERPContext, payload: JournalEntryPayload) {
        // 1. Validation Logic
        if (!payload.lines || payload.lines.length < 2) {
            throw ErrorHandler.validation('يجب أن يحتوي القيد على سطرين على الأقل');
        }

        const totalDebit = payload.lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
        const totalCredit = payload.lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);

        // Business Logic Rule: Double Entry System
        if (Math.abs(totalDebit - totalCredit) > 0.001) {
            throw ErrorHandler.validation('القيد غير متزن', { targetTotal: totalDebit, difference: Math.abs(totalDebit - totalCredit) });
        }

        // 2. Database Atomic Transaction (with Retry mechanism for deadlocks)
        // Supabase RPC called: 'atomic_create_journal'
        const newJournalId = await executeAtomicOperation<{ id: string, journal_number: string }>(
            'atomic_create_journal',
            {
                p_company_id: ctx.companyId,
                p_user_id: ctx.user.id,
                p_payload: payload
            },
            { correlationId: ctx.correlationId }
        );

        // 3. Automated Non-Blocking Auditing
        // The Audit Service pushes logs asynchronously in the background
        asyncAuditLog({
            correlationId: ctx.correlationId,
            companyId: ctx.companyId,
            userId: ctx.user.id,
            userEmail: ctx.user.email,
            action: 'CREATE',
            table: 'journal_entries',
            recordId: newJournalId.id,
            recordIdentifier: newJournalId.journal_number,
            newData: payload,
            reason: 'Post Manual Journal Entry via API'
        });

        // 4. Return Normalized Data
        return {
            success: true,
            journal_id: newJournalId.id,
            journal_number: newJournalId.journal_number,
            message: 'تم إضافة قيد اليومية بنجاح'
        };
    }
}
