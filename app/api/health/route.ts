import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { globalQueue } from '@/lib/core/queue/in-process-queue';

/**
 * GET /api/health
 *
 * نقطة المراقبة الشاملة (Monitoring Endpoint)
 * تُعيد حالة النظام في الوقت الفعلي:
 * - Database Ping
 * - DB Response Latency (ms)
 * - Queue Status (pending jobs)
 * - Timestamp
 */
export async function GET() {
    const startTime = Date.now();
    let dbStatus: 'ok' | 'error' = 'error';
    let dbLatencyMs = -1;

    // 1. Database Ping
    try {
        const supabase = await createClient();
        const pingStart = Date.now();

        // استعلام خفيف جداً لقياس زمن الاستجابة
        const { error } = await supabase.from('companies').select('id').limit(1);
        dbLatencyMs = Date.now() - pingStart;

        if (!error) {
            dbStatus = 'ok';
        }
    } catch {
        dbStatus = 'error';
    }

    // 2. Queue Status
    const queueStatus = globalQueue.getStatus();

    // 3. Overall System Health
    const isHealthy = dbStatus === 'ok';

    return NextResponse.json(
        {
            status: isHealthy ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            uptime_ms: Date.now() - startTime,
            services: {
                database: {
                    status: dbStatus,
                    latency_ms: dbLatencyMs
                },
                queue: {
                    status: 'ok',
                    pending_jobs: queueStatus.pending,
                    is_processing: queueStatus.isProcessing,
                    registered_handlers: queueStatus.handlers
                }
            }
        },
        { status: isHealthy ? 200 : 503 }
    );
}
