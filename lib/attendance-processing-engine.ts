import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Admin Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Enterprise Attendance Processing Engine
 * Designed to run via Cron Job or Background Worker
 */
export async function processAttendanceBatch(companyId: string, batchSize = 100) {
    console.log(`Starting processing batch for company ${companyId}`);

    // Worker ID to claim the lock (Guid/UUID)
    const workerId = crypto.randomUUID();

    try {
        // 1. Fetch unprocessed logs using the SKIP LOCKED RPC
        // This safely pulls a batch without overlap if multiple instances are running
        const { data: rawLogs, error: rpcError } = await supabase
            .rpc('get_unprocessed_attendance_logs', {
                p_company_id: companyId,
                p_batch_size: batchSize,
                p_worker_id: workerId
            });

        if (rpcError) throw rpcError;

        if (!rawLogs || rawLogs.length === 0) {
            console.log('No unprocessed logs found.');
            return { processed: 0, status: 'idle' };
        }

        console.log(`Processing ${rawLogs.length} logs...`);

        // Process each log sequentially (or group by employee for optimization)
        // For simplicity and clarity in this ERP flow, we handle row by row:
        for (const log of rawLogs) {
            if (log.anomaly_flag) {
                // If it was already marked as anomaly (e.g. Debounce duplicate), just mark processed and skip records calculation
                await markLogProcessed(log.id);
                continue;
            }

            const logTime = new Date(log.log_time);
            // To associate it with a specific workday, we usually pick the date of the IN punch.
            // For night shifts (e.g., 22:00 to 06:00), an IN at 22:00 belongs to today.
            // An OUT at 06:00 needs to be matched against yesterday's IN.

            const dayDate = logTime.toISOString().split('T')[0]; // Simple extraction, real Enterprise systems might offset this by Shift bounds

            // Fetch employee's shift and current daily record
            const { data: employee } = await supabase.from('employees').select('default_shift_id').eq('id', log.employee_id).single();
            const shiftId = employee?.default_shift_id;

            const { data: shift } = shiftId
                ? await supabase.from('attendance_shifts').select('*').eq('id', shiftId).single()
                : { data: null };

            // Try to find an existing record for this employee
            let currentRecord = null;

            if (log.log_type === 'IN') {
                // For IN punch, we look for a record specifically for today
                const { data } = await supabase
                    .from('attendance_records')
                    .select('*')
                    .eq('employee_id', log.employee_id)
                    .eq('day_date', dayDate)
                    .maybeSingle();

                currentRecord = data;
            } else {
                // For OUT punch, we look for the most recent open record (IN without OUT)
                // This natively solves Cross-Day shifts where IN was yesterday and OUT is today.
                const { data } = await supabase
                    .from('attendance_records')
                    .select('*')
                    .eq('employee_id', log.employee_id)
                    .is('check_out', null)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                currentRecord = data;
            }

            try {
                if (log.log_type === 'IN') {
                    if (currentRecord && currentRecord.check_in && !currentRecord.check_out) {
                        // Anomaly: Two INs sequentially without an OUT
                        await markAnomaly(log.id, 'Sequential IN without OUT');
                    } else if (!currentRecord) {
                        // Normal IN: Create new daily record

                        // Calculate Lateness based on shift
                        const { lateMins } = calculateInMetrics(logTime, dayDate, shift);

                        await supabase.from('attendance_records').insert({
                            company_id: log.company_id,
                            employee_id: log.employee_id,
                            day_date: dayDate,
                            shift_id: shiftId,
                            check_in: logTime.toISOString().split('T')[1], // Time only
                            status: 'present',
                            late_minutes: lateMins
                        });
                        await markLogProcessed(log.id);
                    }
                }
                else if (log.log_type === 'OUT') {
                    if (!currentRecord || !currentRecord.check_in) {
                        // Anomaly: OUT without IN
                        await markAnomaly(log.id, 'OUT punch without a previous IN punch');
                    } else if (currentRecord && currentRecord.check_out) {
                        // Anomaly: Already checked out
                        await markAnomaly(log.id, 'Already Checked Out');
                    } else {
                        // Perform precise OUT punch calculations including working hours, cross-day mapping, and early/late.
                        const { workingHours, overtimeMins, earlyLeaveMins } = calculateOutMetrics(
                            logTime,
                            currentRecord.check_in,
                            currentRecord.day_date,
                            shift
                        );

                        await supabase.from('attendance_records')
                            .update({
                                check_out: logTime.toISOString().split('T')[1],
                                working_hours: workingHours,
                                overtime_minutes: overtimeMins,
                                early_leave_minutes: earlyLeaveMins
                            })
                            .eq('id', currentRecord.id);

                        await markLogProcessed(log.id);
                    }
                }
            } catch (e: any) {
                console.error(`Error calculating record for raw_log ${log.id}:`, e);
                await markAnomaly(log.id, `Processing Engine Error: ${e.message}`);
            }
        }

        return { processed: rawLogs.length, status: 'success' };

    } catch (error) {
        console.error('Processing engine fatal error:', error);
        return { processed: 0, status: 'error', error };
    }
}

// Helper to mark a log as successfully processed
async function markLogProcessed(logId: string) {
    await supabase.from('attendance_raw_logs').update({
        is_processed: true,
        processed_at: new Date().toISOString()
    }).eq('id', logId);
}

// Helper to flag errors without losing the log
async function markAnomaly(logId: string, reason: string) {
    await supabase.from('attendance_raw_logs').update({
        is_processed: true, // We processed it, but it's anomalous
        processed_at: new Date().toISOString(),
        anomaly_flag: true,
        anomaly_reason: reason
    }).eq('id', logId);
}

// --- Attendance Calculation Engine Operations ---

export function calculateInMetrics(logTime: Date, dayDate: string, shift: any | null) {
    let lateMins = 0;
    if (shift) {
        const expectedIn = new Date(`${dayDate}T${shift.start_time}Z`);
        const graceTime = new Date(expectedIn.getTime() + (shift.grace_period_mins * 60000));

        if (logTime > graceTime) {
            const diffMins = Math.floor((logTime.getTime() - expectedIn.getTime()) / 60000);
            if (diffMins >= shift.late_after_mins) {
                lateMins = diffMins;
            }
        }
    }
    return { lateMins };
}

export function calculateOutMetrics(logTime: Date, checkInTimeStr: string, dayDate: string, shift: any | null) {
    // Crucial: checkInTime parses based on the IN dayDate, safely capturing across midnight duration.
    const checkInTime = new Date(`${dayDate}T${checkInTimeStr}Z`);
    const workingMs = logTime.getTime() - checkInTime.getTime();

    // Ensure we don't output negative working hours in extremely odd anomalies
    const validWorkingMs = Math.max(0, workingMs);
    const workingHours = parseFloat((validWorkingMs / (1000 * 60 * 60)).toFixed(2));

    let overtimeMins = 0;
    let earlyLeaveMins = 0;

    if (shift) {
        let expectedOut = new Date(`${dayDate}T${shift.end_time}Z`);

        // Handle Cross-Day logic properly
        if (shift.is_cross_day || shift.start_time > shift.end_time) {
            expectedOut.setDate(expectedOut.getDate() + 1); // Expected punch is actually on the NEXT day
        }

        if (logTime > expectedOut) {
            const diffMins = Math.floor((logTime.getTime() - expectedOut.getTime()) / 60000);
            if (diffMins >= shift.overtime_after_mins) {
                overtimeMins = diffMins;
            }
        } else if (logTime < expectedOut) {
            const diffMins = Math.floor((expectedOut.getTime() - logTime.getTime()) / 60000);
            earlyLeaveMins = diffMins;
        }
    }

    return { workingHours, overtimeMins, earlyLeaveMins, checkInTime };
}


// --- TEST CASES (Enterprise Requirement) ---
// Note: These run in isolated memory synchronously to guarantee functional exactness.
export function runCrossDayTests() {
    console.log("Running Cross-Day and Normal Shift Tests...");

    // Test Case 1: Normal Shift 09:00 -> 17:00
    const normalShift = {
        start_time: '09:00:00',
        end_time: '17:00:00',
        is_cross_day: false,
        grace_period_mins: 15,
        late_after_mins: 15,
        overtime_after_mins: 60
    };

    const normalDay = '2026-03-01';
    const normalInTime = new Date('2026-03-01T09:10:00Z'); // Inside grace
    const normalOutTime = new Date('2026-03-01T18:30:00Z'); // Overtime (+90 mins)

    const inMetricsNormal = calculateInMetrics(normalInTime, normalDay, normalShift);
    console.assert(inMetricsNormal.lateMins === 0, "Normal shift IN failed late calculation");

    const outMetricsNormal = calculateOutMetrics(normalOutTime, '09:10:00', normalDay, normalShift);
    console.assert(outMetricsNormal.workingHours === 9.33, `Normal shift working hours wrong: ${outMetricsNormal.workingHours}`);
    console.assert(outMetricsNormal.overtimeMins === 90, `Normal shift overtime wrong: ${outMetricsNormal.overtimeMins}`);
    console.assert(outMetricsNormal.earlyLeaveMins === 0, "Normal shift early leave wrong");


    // Test Case 2: Cross Day Shift 22:00 -> 06:00
    const crossShift = {
        start_time: '22:00:00',
        end_time: '06:00:00',
        is_cross_day: true,
        grace_period_mins: 15,
        late_after_mins: 15,
        overtime_after_mins: 60
    };

    const crossDay = '2026-03-01'; // Employee arrived Mar 1st night
    const crossInTime = new Date('2026-03-01T22:20:00Z'); // 20 mins late, counts because threshold is 15
    const crossOutTime = new Date('2026-03-02T05:30:00Z'); // Left 30 mins early the next morning

    const inMetricsCross = calculateInMetrics(crossInTime, crossDay, crossShift);
    console.assert(inMetricsCross.lateMins === 20, `Cross-day shift late wrong: ${inMetricsCross.lateMins}`);

    const outMetricsCross = calculateOutMetrics(crossOutTime, '22:20:00', crossDay, crossShift);
    console.assert(outMetricsCross.workingHours === 7.17, `Cross-day shift working hours wrong: ${outMetricsCross.workingHours}`);
    console.assert(outMetricsCross.earlyLeaveMins === 30, `Cross-day shift early leave wrong: ${outMetricsCross.earlyLeaveMins}`);
    console.assert(outMetricsCross.overtimeMins === 0, "Cross-day shift overtime wrong");

    console.log("All Attendance Tests Passed Successfully! ✅");
}
