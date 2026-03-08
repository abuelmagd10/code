import { createClient } from '@/lib/supabase/server';
import { ERPError } from '../errors/erp-errors';

/**
 * Financial Lock Guard (Reusable Security Middleware)
 *
 * يتحقق من أن التاريخ المُمرَّر يقع داخل فترة محاسبية مفتوحة.
 * يجب استدعاء هذه الدالة قبل أي عملية إدخال أو تعديل مالي حساس (قيود، فواتير، مصروفات...).
 *
 * في حالة أن الفترة مغلقة أو في حالة Audit Lock → يتم رمي ERPError من نوع ERR_PERIOD_CLOSED.
 */
export async function requireOpenFinancialPeriod(
    companyId: string,
    date: string | Date
): Promise<void> {
    const supabase = await createClient();
    const targetDate = typeof date === 'string' ? date : date.toISOString().split('T')[0];

    const { data: period, error } = await supabase
        .from('accounting_periods')
        .select('id, name, status')
        .eq('company_id', companyId)
        .lte('start_date', targetDate)
        .gte('end_date', targetDate)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        // خطأ في الاستعلام نفسه — نرمي ERR_SYSTEM
        throw new ERPError(
            'ERR_SYSTEM',
            'فشل التحقق من حالة الفترة المحاسبية: ' + error.message,
            500
        );
    }

    if (!period) {
        // لا توجد فترة محاسبية تُغطي هذا التاريخ
        // بالنسبة للأنظمة التي لم تُعلِّم فتراتها بعد، نسمح بالمرور (Permissive Default)
        // يمكن تغييره لـ throw لجعل الفترات إلزامية
        return;
    }

    if (period.status === 'closed') {
        throw new ERPError(
            'ERR_PERIOD_CLOSED',
            `الفترة المحاسبية "${period.name}" مغلقة. لا يمكن إضافة أو تعديل أي حركة في هذه الفترة.`,
            403,
            { period_id: period.id, status: 'closed' }
        );
    }

    if (period.status === 'audit_lock') {
        throw new ERPError(
            'ERR_PERIOD_CLOSED',
            `الفترة المحاسبية "${period.name}" مقفلة بقفل التدقيق (Audit Lock) ولا يمكن إجراء أي تعديلات.`,
            403,
            { period_id: period.id, status: 'audit_lock' }
        );
    }

    // status === 'open' → الفترة مفتوحة ✅
}
