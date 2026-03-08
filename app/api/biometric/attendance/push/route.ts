import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AttendanceService } from '@/lib/services/hr/attendance-service';

/**
 * POST /api/biometric/attendance/push
 *
 * يستقبل دفعات البصمات من أجهزة الحضور.
 *
 * قبل التحديث: كل بصمة = 3 DB Calls + Loop = يُسقط الخادم عند 500+ موظف
 * بعد التحديث: كل الدفعة = 3 DB Calls ثابتة + Queue Job خلفي لبناء الحضور اليومي
 */
export async function POST(request: Request) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const requestIp = request.headers.get('x-forwarded-for') || 'unknown';
    const authHeader = request.headers.get('authorization');

    // 1. Token Check (Device Authentication — رمز الجهاز وليس رمز المستخدم)
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
            { success: false, error: { code: 'ERR_UNAUTHORIZED', message: 'Missing or invalid device token' } },
            { status: 401 }
        );
    }

    const token = authHeader.split(' ')[1];

    try {
        const payload = await request.json();

        // 2. Authenticate Device & Check Governance
        const { data: device, error: deviceError } = await supabase
            .from('biometric_devices')
            .select('id, company_id, branch_id, status')
            .eq('api_token', token)
            .single();

        if (deviceError || !device) {
            console.warn(`[BIOMETRIC] Unauthorized push attempt from IP: ${requestIp}`);
            return NextResponse.json(
                { success: false, error: { code: 'ERR_UNAUTHORIZED', message: 'Invalid device token' } },
                { status: 401 }
            );
        }

        if (device.status !== 'online') {
            return NextResponse.json(
                { success: false, error: { code: 'ERR_FORBIDDEN_ROLE', message: 'Device is offline or disabled' } },
                { status: 403 }
            );
        }

        // 3. Payload Validation
        if (!payload.logs || !Array.isArray(payload.logs) || payload.logs.length === 0) {
            return NextResponse.json(
                { success: false, error: { code: 'ERR_VALIDATION', message: 'Invalid payload: expected non-empty logs array' } },
                { status: 400 }
            );
        }

        Promise.resolve(supabase.from('biometric_device_logs').insert({
            device_id: device.id,
            company_id: device.company_id,
            request_ip: requestIp,
            payload,
            status_code: 200
        })).catch((err: any) => console.error('[BIOMETRIC] Failed to log device push:', err));

        // 5. Enterprise Batch Processing (بدلاً من Sequential Loop!)
        const result = await AttendanceService.pushRawLogs(
            device.id,
            device.company_id,
            device.branch_id,
            payload.logs
        );

        // 6. Update device last_sync (Fire-and-Forget)
        Promise.resolve(
            supabase.from('biometric_devices')
                .update({ last_sync_at: new Date().toISOString() })
                .eq('id', device.id)
        ).catch(() => { });

        return NextResponse.json({
            success: true,
            message: 'Logs received and queued for processing',
            stats: {
                total: result.total,
                inserted: result.inserted,
                duplicates: result.duplicates,
                unknown_employees: result.unknownEmployees,
                anomalies: result.anomalies,
                daily_processing_queued: result.jobQueued
            }
        });

    } catch (error: any) {
        console.error('[BIOMETRIC] Push API Error:', error);
        return NextResponse.json(
            { success: false, error: { code: 'ERR_SYSTEM', message: 'Internal Server Error' } },
            { status: 500 }
        );
    }
}
