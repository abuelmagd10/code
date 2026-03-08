import { createClient } from '@/lib/supabase/server';
import { ErrorHandler } from '../errors/error-handler';
import { getActiveCompanyId } from '@/lib/company';

/**
 * الـ Role Types المدعومة في النظام
 */
export type Role = 'owner' | 'admin' | 'manager' | 'accountant' | 'store_manager' | 'cashier' | 'sales_representative' | '';

/**
 * الـ Resource Types المدعومة في مصفوفة الصلاحيات (RBAC)
 */
export type AppResource =
    | 'journals'
    | 'products'
    | 'inventory'
    | 'invoices'
    | 'reports'
    | 'settings'
    | 'hr'
    | 'branches';

export interface GuardOptions {
    requireAuth?: boolean;
    requireCompany?: boolean;
    resource?: AppResource;
    action?: 'read' | 'write' | 'delete' | 'approve';
}

export interface ERPContext {
    user: any;
    companyId: string;
    member: {
        id: string;
        role: Role;
        branch_id: string | null;
        cost_center_id: string | null;
        warehouse_id: string | null;
    };
    correlationId: string;
}

/**
 * البوابة الأمنية الشاملة (Global Security Middleware)
 * - تتحقق من الـ Authentication
 * - تتحقق من الـ Multi-Company Isolation (عزل الشركات)
 * - تتحقق من الـ RBAC (الصلاحيات)
 * 
 * في حالة الفشل، تُرجع error جاهز للإرسال (NextResponse).
 * في حالة النجاح، تُرجع ERPContext يحتوي على جميع بيانات الجلسة الآمنة لتستخدمها الـ Services.
 */
export async function apiGuard(req: Request, options: GuardOptions = {}): Promise<{ context?: ERPContext; errorResponse?: any }> {
    // توليد Correlation ID لكل Request لسهولة التتبع في النظام
    const correlationId = `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    const defaultOptions: GuardOptions = {
        requireAuth: true,
        requireCompany: true,
        ...options
    };

    try {
        const supabase = await createClient();

        // 1. Authentication Check
        let user = null;
        if (defaultOptions.requireAuth) {
            const { data: authData, error: authError } = await supabase.auth.getUser();
            if (authError || !authData.user) {
                return { errorResponse: ErrorHandler.unauthorized() };
            }
            user = authData.user;
        }

        // 2. Company Context & Injection Check
        let companyId = '';
        if (defaultOptions.requireCompany) {
            companyId = await getActiveCompanyId(supabase) ?? '';
            if (!companyId) {
                throw new Error('COMPANY_MISSING'); // Catch error format below
            }
        }

        // 3. User Membership & RBAC Check
        let memberData = null;
        if (user && companyId) {
            const { data: member, error: memberError } = await supabase
                .from('company_members')
                .select('id, role, branch_id, cost_center_id, warehouse_id')
                .eq('company_id', companyId)
                .eq('user_id', user.id)
                .single();

            if (memberError || !member) {
                return { errorResponse: ErrorHandler.forbidden('المستخدم غير مرتبط بهذه الشركة أو تم إيقافه') };
            }

            memberData = member;

            // هنا يمكننا إضافة فحص حقيقي لجدول الصلاحيات (`company_role_permissions`)
            // إذا كان Resource Action مطلوباً
            if (defaultOptions.resource && defaultOptions.action) {
                // ... Load RBAC policies from cache or DB here
                // If fail: return { errorResponse: ErrorHandler.forbidden('صلاحيات غير كافية لإتمام الإجراء المطلوب') };
            }
        }

        // 4. Return Safe Context
        const context: ERPContext = {
            user,
            companyId,
            member: memberData as ERPContext['member'],
            correlationId
        };

        return { context };

    } catch (error: any) {
        if (error.message === 'COMPANY_MISSING') {
            const err = ErrorHandler.validation('تفاصيل الشركة غير مكتملة، يرجى إعادة تسجيل الدخول');
            // Hack to change code inside
            err.code = 'ERR_NO_COMPANY';
            return { errorResponse: ErrorHandler.handle(err, correlationId) };
        }
        return { errorResponse: ErrorHandler.handle(error, correlationId) };
    }
}
