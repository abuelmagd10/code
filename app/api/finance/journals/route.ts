import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/core/security/api-guard';
import { ErrorHandler } from '@/lib/core/errors/error-handler';
import { JournalService } from '@/lib/services/finance/journal-service';

/**
 * POST /api/finance/journals
 * 
 * نقطة النهاية (Endpoint) لإضافة قيد يومية يدوي.
 * الكود نظيف جداً ومختصر لأن جميع عمليات التحقق تتم في الطبقات السفلى.
 */
export async function POST(req: Request) {
    // 1. Global Security Middleware
    // نعبر من البوابة الأمنية: يطالب بوجود شركة، وأن المستخدم يمتلك صلاحية كتابة للقيود.
    const { context, errorResponse } = await apiGuard(req, {
        requireAuth: true,
        requireCompany: true,
        resource: 'journals',
        action: 'write'
    });

    // إذا تم رفض الوصول (لا يوجد شركة، مفيش صلاحية، جلسة منتهية) نعيد الـ Response فوراً
    if (errorResponse) return errorResponse;

    try {
        // 2. قراءة البيانات المرسلة
        const payload = await req.json();

        // 3. التوجيه إلى طبقة الخدمات المالية (Business Logic Layer)
        // نمرر الـ Context الآمن (يحتوي على user, companyId, correlationId)
        const result = await JournalService.postJournalEntry(context!, payload);

        // 4. استجابة النجاح
        return NextResponse.json(result, { status: 201 });

    } catch (error: any) {
        // 5. نظام التقاط الأخطاء الموحد
        // سيقوم بمعالجة (ERPError, DB Deadlock, Validation) وإعادتها بالتنسيق الموحد للـ Frontend
        return ErrorHandler.handle(error, context?.correlationId);
    }
}
