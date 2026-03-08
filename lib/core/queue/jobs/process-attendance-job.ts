import { QueueJob } from '../in-process-queue';
import { createClient } from '@supabase/supabase-js';

/**
 * Process Attendance Job
 *
 * مهمة الطابور المسؤولة عن بناء سجل الحضور اليومي (Daily Attendance Record)
 * من الـ Raw Logs التي دفعها جهاز البصمة.
 *
 * يتم استدعاء هذه المهمة تلقائياً من الـ Queue بعد كل Batch Insert ناجح.
 */
export async function processAttendanceJob(job: QueueJob): Promise<void> {
    const { company_id, branch_id, date } = job.payload;

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!url || !serviceKey) {
        throw new Error('Database credentials not configured for queue worker');
    }

    // استخدام Service Role لأن الـ Queue يعمل بدون User Context
    const supabase = createClient(url, serviceKey);

    console.log(`[ATTENDANCE_JOB] Building daily attendance for company=${company_id}, branch=${branch_id}, date=${date}`);

    // جلب Raw Logs غير المُعالجة لهذا اليوم والفرع
    const { data: rawLogs, error: logsError } = await supabase
        .from('attendance_raw_logs')
        .select('employee_id, log_time, log_type, anomaly_flag')
        .eq('company_id', company_id)
        .eq('branch_id', branch_id)
        .eq('is_processed', false)
        .gte('log_time', `${date}T00:00:00Z`)
        .lte('log_time', `${date}T23:59:59Z`)
        .order('employee_id')
        .order('log_time');

    if (logsError) throw new Error('Failed to fetch raw logs: ' + logsError.message);
    if (!rawLogs || rawLogs.length === 0) {
        console.log(`[ATTENDANCE_JOB] No unprocessed logs found for date: ${date}`);
        return;
    }

    // تجميع الـ Logs لكل موظف
    const employeeLogsMap = new Map<string, typeof rawLogs>();
    for (const log of rawLogs) {
        if (!employeeLogsMap.has(log.employee_id)) {
            employeeLogsMap.set(log.employee_id, []);
        }
        employeeLogsMap.get(log.employee_id)!.push(log);
    }

    const attendanceRecords = [];

    for (const [employeeId, logs] of employeeLogsMap.entries()) {
        // أول سجل دخول + آخر سجل خروج
        const checkIns = logs.filter(l => ['IN', 'CHECK_IN', 'UNKNOWN'].includes(l.log_type));
        const checkOuts = logs.filter(l => ['OUT', 'CHECK_OUT'].includes(l.log_type));

        const checkIn = checkIns.length > 0 ? checkIns[0].log_time : null;
        const checkOut = checkOuts.length > 0 ? checkOuts[checkOuts.length - 1].log_time : null;

        // احتساب دقائق العمل
        let workMinutes = 0;
        if (checkIn && checkOut) {
            workMinutes = Math.round(
                (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000
            );
        }

        const hasAnomaly = logs.some(l => l.anomaly_flag);

        attendanceRecords.push({
            company_id,
            branch_id,
            employee_id: employeeId,
            attendance_date: date,
            check_in: checkIn,
            check_out: checkOut,
            work_minutes: workMinutes,
            status: checkIn ? (checkOut ? 'present' : 'incomplete') : 'absent',
            has_anomaly: hasAnomaly,
            source: 'biometric'
        });
    }

    // Batch Upsert للسجلات — استخدام upsert لمنع تكرار سجلات نفس اليوم
    if (attendanceRecords.length > 0) {
        const { error: upsertError } = await supabase
            .from('daily_attendance')
            .upsert(attendanceRecords, {
                onConflict: 'company_id, employee_id, attendance_date'
            });

        if (upsertError) throw new Error('Failed to upsert daily attendance: ' + upsertError.message);
    }

    // تعليم الـ Raw Logs بأنها معالجة
    const processedIds = rawLogs.map(l => l.employee_id);
    await supabase
        .from('attendance_raw_logs')
        .update({ is_processed: true })
        .eq('company_id', company_id)
        .eq('branch_id', branch_id)
        .gte('log_time', `${date}T00:00:00Z`)
        .lte('log_time', `${date}T23:59:59Z`);

    console.log(`[ATTENDANCE_JOB] ✅ Built ${attendanceRecords.length} attendance records for ${date}`);
}
