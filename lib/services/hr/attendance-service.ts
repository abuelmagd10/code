import { createClient } from '@supabase/supabase-js';
import { globalQueue } from '@/lib/core/queue/in-process-queue';
import { processAttendanceJob } from '@/lib/core/queue/jobs/process-attendance-job';

// تسجيل الـ Handler مرة واحدة عند استيراد الموديول
globalQueue.register('process-attendance', processAttendanceJob);

export interface RawLogInput {
    biometric_id: string;
    timestamp: string;
    punch_type?: string;
}

export interface PushResult {
    total: number;
    inserted: number;
    duplicates: number;
    unknownEmployees: number;
    anomalies: number;
    jobQueued: boolean;
}

/**
 * Attendance Service (HR Service Layer)
 *
 * الخدمة المسؤولة عن معالجة بيانات الحضور القادمة من أجهزة البصمة.
 *
 * المشكلة القديمة: Sequential Loop = 3 DB calls × عدد الـ Logs
 * الحل الجديد:    Batch Query + Batch Insert = عدد ثابت من الـ DB Calls بغض النظر عن الحجم
 */
export class AttendanceService {

    /**
     * معالجة دفعة بصمات من جهاز محدد
     *
     * الأداء: بدلاً من N*3 DB Calls، أصبح 3 DB Calls ثابتة مهما كان حجم الـ Batch
     */
    static async pushRawLogs(
        deviceId: string,
        companyId: string,
        branchId: string,
        logs: RawLogInput[]
    ): Promise<PushResult> {
        const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        const supabase = createClient(url, serviceKey);

        const result: PushResult = {
            total: logs.length,
            inserted: 0,
            duplicates: 0,
            unknownEmployees: 0,
            anomalies: 0,
            jobQueued: false
        };

        if (logs.length === 0) return result;

        // ── Step 1: جلب جميع الموظفين بـ biometric_id دفعة واحدة ──
        const biometricIds = [...new Set(logs.map(l => l.biometric_id))];

        const { data: employees, error: empError } = await supabase
            .from('employees')
            .select('id, biometric_id')
            .eq('company_id', companyId)
            .in('biometric_id', biometricIds);

        if (empError) throw new Error('Failed to fetch employees: ' + empError.message);

        // Map: biometric_id → employee_id
        const employeeMap = new Map<string, string>();
        for (const emp of employees || []) {
            employeeMap.set(emp.biometric_id, emp.id);
        }

        // ── Step 2: حل الـ Timestamps وبناء Payload للـ Insert ──
        const punchTimes = logs
            .filter(l => employeeMap.has(l.biometric_id))
            .map(l => new Date(l.timestamp).toISOString());

        // جلب السجلات المكررة في نافذة 60 ثانية (Debounce) دفعة واحدة
        const minTime = punchTimes.length > 0
            ? new Date(Math.min(...punchTimes.map(t => new Date(t).getTime())) - 60000).toISOString()
            : null;

        const recentLogsSet = new Set<string>(); // key: `employee_id:minute_timestamp`

        if (minTime) {
            const { data: recentLogs } = await supabase
                .from('attendance_raw_logs')
                .select('employee_id, log_time')
                .eq('company_id', companyId)
                .gte('log_time', minTime);

            for (const rl of recentLogs || []) {
                const minute = new Date(rl.log_time).toISOString().substring(0, 16); // YYYY-MM-DDTHH:MM
                recentLogsSet.add(`${rl.employee_id}:${minute}`);
            }
        }

        // ── Step 3: بناء Records للـ Batch Insert ──
        const toInsert = [];
        const processingDate = new Set<string>();

        for (const log of logs) {
            const employeeId = employeeMap.get(log.biometric_id);

            if (!employeeId) {
                result.unknownEmployees++;
                continue;
            }

            const punchTime = new Date(log.timestamp);
            const minute = punchTime.toISOString().substring(0, 16);
            const isDuplicate = recentLogsSet.has(`${employeeId}:${minute}`);

            if (isDuplicate) {
                result.duplicates++;
                result.anomalies++;
            }

            const logDate = punchTime.toISOString().split('T')[0];
            processingDate.add(`${branchId}:${logDate}`);

            toInsert.push({
                company_id: companyId,
                branch_id: branchId,
                employee_id: employeeId,
                device_id: deviceId,
                log_time: punchTime.toISOString(),
                log_type: log.punch_type || 'UNKNOWN',
                source: 'biometric',
                anomaly_flag: isDuplicate,
                anomaly_reason: isDuplicate ? 'Duplicate within 60s window' : null,
                is_processed: false
            });
        }

        // ── Step 4: Batch Insert (سطر واحد لكل الـ Logs) ──
        if (toInsert.length > 0) {
            const { error: insertError } = await supabase
                .from('attendance_raw_logs')
                .insert(toInsert);

            if (insertError && insertError.code !== '23505') {
                throw new Error('Batch insert failed: ' + insertError.message);
            }

            result.inserted = toInsert.length - result.duplicates;
        }

        // ── Step 5: Queue Job لمعالجة الحضور اليومي في الخلفية ──
        // نُدرج Job منفصلة لكل تاريخ × فرع
        for (const key of processingDate) {
            const [bId, date] = key.split(':');
            globalQueue.enqueue('process-attendance', {
                company_id: companyId,
                branch_id: bId,
                date
            });
        }
        result.jobQueued = processingDate.size > 0;

        return result;
    }
}
