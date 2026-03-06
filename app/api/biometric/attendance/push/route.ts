import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Admin Client for backend operations
// Note: In production, ensure these env vars are set
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
    const requestIp = request.headers.get('x-forwarded-for') || 'unknown';
    const authHeader = request.headers.get('authorization');

    // 1. Basic Token Check
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized: Missing or invalid token' }, { status: 401 });
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
            // Log failed attempt if possible, but we don't know the device_id/company_id reliably yet
            console.error('Unauthorized biometric push attempt:', requestIp);
            return NextResponse.json({ error: 'Unauthorized: Invalid device token' }, { status: 401 });
        }

        if (device.status !== 'online') {
            return NextResponse.json({ error: 'Device is marked as offline or disabled' }, { status: 403 });
        }

        // 3. Audit Log: Record the raw incoming request
        await supabase.from('biometric_device_logs').insert({
            device_id: device.id,
            company_id: device.company_id,
            request_ip: requestIp,
            payload: payload,
            status_code: 200 // Assumed success for now, will update if processing fails completely
        });

        // 4. Payload Validation
        if (!payload.logs || !Array.isArray(payload.logs)) {
            return NextResponse.json({ error: 'Invalid payload format: Expected logs array' }, { status: 400 });
        }

        const { logs } = payload;
        let successCount = 0;
        let anomalyCount = 0;
        let errors = [];

        // 5. Process Each Log (Push to Raw Logs Table)
        for (const log of logs) {
            try {
                // Resolve biometric_id to employee_id
                const { data: employee } = await supabase
                    .from('employees')
                    .select('id')
                    .eq('company_id', device.company_id) // Strict governance check
                    .eq('biometric_id', log.biometric_id)
                    .single();

                if (!employee) {
                    throw new Error(`Employee not found for biometric_id: ${log.biometric_id}`);
                }

                const punchTime = new Date(log.timestamp);

                // Debounce / Duplicate Check (60 seconds window)
                // Check if a punch exists within the last 60 seconds for this employee
                const sixtySecondsAgo = new Date(punchTime.getTime() - 60000).toISOString();

                const { data: recentLogs } = await supabase
                    .from('attendance_raw_logs')
                    .select('id')
                    .eq('employee_id', employee.id)
                    .gte('log_time', sixtySecondsAgo)
                    .lte('log_time', punchTime.toISOString())
                    .limit(1);

                const isDuplicate = recentLogs && recentLogs.length > 0;

                let anomaly_flag = false;
                let anomaly_reason = null;

                if (isDuplicate) {
                    anomaly_flag = true;
                    anomaly_reason = 'Duplicate within debounce window (60s)';
                    anomalyCount++;
                }

                // Insert into Raw Logs
                const { error: insertError } = await supabase
                    .from('attendance_raw_logs')
                    .insert({
                        company_id: device.company_id,
                        branch_id: device.branch_id,
                        employee_id: employee.id,
                        device_id: device.id,
                        log_time: punchTime.toISOString(),
                        log_type: log.punch_type || 'UNKNOWN',
                        source: 'biometric',
                        anomaly_flag: anomaly_flag,
                        anomaly_reason: anomaly_reason,
                        is_processed: false // Ready for processing engine
                    });

                if (insertError) {
                    if (insertError.code === '23505') {
                        // Idempotency: exact same second duplicate ignored silently as success
                        successCount++;
                    } else {
                        throw insertError;
                    }
                } else {
                    successCount++;
                }

            } catch (err: any) {
                errors.push({ log, error: err.message });
                console.error('Error processing biometric log:', err);
            }
        }

        // Update device last_sync
        await supabase.from('biometric_devices').update({ last_sync_at: new Date().toISOString() }).eq('id', device.id);

        return NextResponse.json({
            message: 'Logs received',
            total: logs.length,
            inserted: successCount,
            anomalies: anomalyCount,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error: any) {
        console.error('Biometric Push API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
