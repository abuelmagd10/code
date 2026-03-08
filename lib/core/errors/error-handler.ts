import { NextResponse } from 'next/server';
import { ERPError, ERPErrorCode } from './erp-errors';

/**
 * Global Error Handler for ERP API Routes
 * 
 * يستقبل أي خطأ ويقوم بتنسيقه وإرساله كاستجابة HTTP موحدة.
 * إذا كان الخطأ من نوع ERPError سيتم إرساله كما هو.
 * وإذا كان خطأ برمجي غير متوقع، سيتم تغليفه بـ ERR_SYSTEM مع إخفاء التفاصيل الحساسة.
 */
export class ErrorHandler {
    static handle(error: any, defaultCorrelationId?: string) {
        // 1. Is it a known ERP Error?
        if (error instanceof ERPError) {
            // يمكنك هنا إضافة كود لإرسال الأخطاء الحرجة إلى Sentry أو Datadog
            if (error.statusCode >= 500) {
                console.error(`[ERP_CRITICAL] ${error.correlationId}:`, error);
            } else {
                console.warn(`[ERP_WARNING] ${error.code} - ${error.correlationId}: ${error.message}`);
            }

            return NextResponse.json(error.toJSON(), { status: error.statusCode });
        }

        // 2. Is it a Supabase Database Error? (Postgres error codes)
        if (error?.code && typeof error.code === 'string') {
            console.error(`[DB_ERROR] ${defaultCorrelationId || 'UNKNOWN'}:`, error);

            // مثال لمعالجة Deadlocks أو Unique Violations
            let erpCode: ERPErrorCode = 'ERR_SYSTEM';
            let message = 'حدث خطأ في قاعدة البيانات';
            let status = 500;

            if (error.code === '23505') { // Unique constraint violation
                erpCode = 'ERR_VALIDATION';
                message = 'رمز المنتج أو الخدمة مكرر، يرجى تغيير الرمز واستخدام رمز مختلف';
                status = 409;
            } else if (error.code === '40P01') { // Deadlock
                erpCode = 'ERR_RACE_CONDITION';
                message = 'النظام مشغول حالياً بحفظ بيانات متزامنة، يرجى المحاولة مرة أخرى';
                status = 409;
            }

            const dbError = new ERPError(erpCode, message, status, error.details || error.message, defaultCorrelationId);
            return NextResponse.json(dbError.toJSON(), { status });
        }

        // 3. Fallback for Unknown Errors (e.g. TypeError, SyntaxError)
        console.error(`[UNHANDLED_EXCEPTION] ${defaultCorrelationId || 'UNKNOWN'}:`, error);

        const fallbackError = new ERPError(
            'ERR_SYSTEM',
            'حدث خطأ غير متوقع في النظام. يرجى مراجعة الدعم الفني.',
            500,
            process.env.NODE_ENV === 'development' ? error.stack : undefined,
            defaultCorrelationId
        );

        return NextResponse.json(fallbackError.toJSON(), { status: 500 });
    }

    // Helper Create functions
    static unauthorized(msg = 'غير مصرح لك بالوصول') {
        return new ERPError('ERR_UNAUTHORIZED', msg, 401);
    }

    static forbidden(msg = 'لا تملك الصلاحيات الكافية لإتمام هذه العملية') {
        return new ERPError('ERR_FORBIDDEN_ROLE', msg, 403);
    }

    static validation(msg = 'بيانات غير صالحة', details?: any) {
        return new ERPError('ERR_VALIDATION', msg, 400, details);
    }
}
