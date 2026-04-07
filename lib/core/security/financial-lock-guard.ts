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

    const { error } = await supabase.rpc('require_open_financial_period_db', {
        p_company_id: companyId,
        p_effective_date: targetDate,
    });

    if (error) {
        const message = error.message || 'فشل التحقق من الفترة المحاسبية';
        if (
            message.includes('NO_ACTIVE_FINANCIAL_PERIOD') ||
            message.includes('FINANCIAL_PERIOD_LOCKED')
        ) {
            throw new ERPError(
                'ERR_PERIOD_CLOSED',
                message,
                403
            );
        }

        throw new ERPError(
            'ERR_SYSTEM',
            'فشل التحقق من حالة الفترة المحاسبية: ' + message,
            500
        );
    }
}
