/**
 * Auth Audit Logging
 * تسجيل عمليات تسجيل الدخول والخروج ومحاولات الوصول غير المصرح
 */

/**
 * تسجيل عملية تسجيل دخول
 */
export async function logLogin(
    userId: string,
    email: string,
    companyId?: string,
    ipAddress?: string,
    userAgent?: string
): Promise<void> {
    try {
        await fetch('/api/audit-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'LOGIN',
                companyId: companyId || null,
                userId,
                details: {
                    user_email: email,
                    user_name: email,
                    ip_address: ipAddress,
                    user_agent: userAgent,
                    target_table: 'auth_sessions',
                    record_identifier: `login_${email}_${new Date().toISOString()}`
                }
            })
        })
    } catch (error) {
        console.error('Failed to log login:', error)
        // لا نوقف العملية إذا فشل التسجيل
    }
}

/**
 * تسجيل عملية تسجيل خروج
 */
export async function logLogout(
    userId: string,
    email: string,
    companyId?: string
): Promise<void> {
    try {
        await fetch('/api/audit-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'LOGOUT',
                companyId: companyId || null,
                userId,
                details: {
                    user_email: email,
                    user_name: email,
                    target_table: 'auth_sessions',
                    record_identifier: `logout_${email}_${new Date().toISOString()}`
                }
            })
        })
    } catch (error) {
        console.error('Failed to log logout:', error)
    }
}

/**
 * تسجيل محاولة وصول غير مصرح بها
 */
export async function logAccessDenied(
    userId: string | null,
    email: string | null,
    resource: string,
    reason: string,
    companyId?: string,
    ipAddress?: string
): Promise<void> {
    try {
        await fetch('/api/audit-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'ACCESS_DENIED',
                companyId: companyId || null,
                userId: userId || null,
                details: {
                    user_email: email,
                    user_name: email,
                    target_table: 'access_control',
                    record_identifier: resource,
                    reason,
                    ip_address: ipAddress,
                    new_data: { resource, reason, timestamp: new Date().toISOString() }
                }
            })
        })
    } catch (error) {
        console.error('Failed to log access denied:', error)
    }
}

/**
 * تسجيل تغيير في الإعدادات
 */
export async function logSettingsChange(
    userId: string,
    email: string,
    companyId: string,
    settingName: string,
    oldValue: any,
    newValue: any,
    reason?: string
): Promise<void> {
    try {
        await fetch('/api/audit-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'SETTINGS',
                companyId,
                userId,
                details: {
                    user_email: email,
                    user_name: email,
                    target_table: 'settings',
                    record_identifier: settingName,
                    old_data: { [settingName]: oldValue },
                    new_data: { [settingName]: newValue },
                    reason
                }
            })
        })
    } catch (error) {
        console.error('Failed to log settings change:', error)
    }
}
