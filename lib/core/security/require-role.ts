import { ERPContext, Role } from './api-guard';
import { ErrorHandler } from '../errors/error-handler';

/**
 * requireRole — مساعد بسيط للتحقق من الدور في الـ ERPContext
 *
 * الاستخدام:
 *   requireRole(context, ['owner', 'admin'])
 *
 * في حالة عدم امتلاك المستخدم أحد هذه الأدوار، يتم رمي ERPError  مباشرةً.
 */
export function requireRole(ctx: ERPContext, allowedRoles: Role[]): void {
    const role = ctx.member?.role as Role;
    if (!allowedRoles.includes(role)) {
        throw ErrorHandler.forbidden(
            `هذه العملية متاحة للأدوار التالية فقط: ${allowedRoles.join(', ')}`
        );
    }
}
