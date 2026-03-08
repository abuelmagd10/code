/**
 * ERP Error Handling System
 * 
 * المعيار الموحد للأخطاء على مستوى الـ Enterprise ERP.
 * يسمح بتعقب الأخطاء ومعرفة أسبابها بدقة من خلال أكواد ثابتة لتتم معالجتها في الواجهة الأمامية.
 */

export type ERPErrorCode =
    | 'ERR_UNAUTHORIZED'          // لا يوجد تسجيل دخول
    | 'ERR_NO_COMPANY'            // المستخدم غير مرتبط بشركة أو الـ Token منتهي
    | 'ERR_FORBIDDEN_ROLE'        // الدور الحالي لا يملك صلاحية (RBAC)
    | 'ERR_PERIOD_CLOSED'         // محاولة إضافة/تعديل في فترة مالية مغلقة
    | 'ERR_VALIDATION'            // البيانات المدخلة غير صحيحة
    | 'ERR_INSUFFICIENT_STOCK'    // المخزون لا يكفي للعملية
    | 'ERR_NOT_FOUND'             // السجل المطلوب غير موجود
    | 'ERR_RACE_CONDITION'        // حدث تضارب في التحديث المتزامن
    | 'ERR_SYSTEM'                // خطأ داخلي في الخادم أو قاعدة البيانات
    | 'ERR_CROSS_COMPANY_LEAK';   // محاولة خطيرة للوصول لبيانات شركة أخرى!

export class ERPError extends Error {
    constructor(
        public code: ERPErrorCode,
        public message: string,
        public statusCode: number = 400,
        public details?: any,
        public correlationId?: string
    ) {
        super(message);
        this.name = 'ERPError';

        // إنشاء Correlation ID تلقائي إذا لم يتم تمريره لتسهيل تتبع المشكلة في الـ Logs
        this.correlationId = correlationId || `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    }

    /**
     * دالة لتحويل الخطأ إلى JSON جاهز للإرسال في الـ API Responses
     */
    toJSON() {
        return {
            success: false,
            error: {
                code: this.code,
                message: this.message,
                details: this.details || null,
                correlation_id: this.correlationId,
            }
        };
    }
}
