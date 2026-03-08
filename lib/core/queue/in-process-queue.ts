/**
 * Global In-Process Queue Worker
 *
 * طابور مهام خفيف الوزن يعمل داخل نفس Node.js Process.
 * مناسب لـ: معالجة الحضور، الـ Audit الضخم، والمهام الخلفية.
 *
 * الميزات:
 * - enqueue: إضافة Jobs
 * - process: معالجة تلقائية خلفية
 * - Rate Limiting: تحكم في عدد الـ Jobs المتزامنة لكل دفعة
 * - Retry Logic: إعادة المحاولة عند فشل الـ Job
 * - Logging: توثيق حالة كل Job
 */

export interface QueueJob {
    id: string;
    name: string;
    payload: Record<string, any>;
    attempts: number;
    maxAttempts: number;
    createdAt: Date;
}

type JobHandler = (job: QueueJob) => Promise<void>;

class InProcessQueue {
    private queue: QueueJob[] = [];
    private handlers: Map<string, JobHandler> = new Map();
    private isProcessing = false;

    // Rate Limit: معالجة X Jobs في آنٍ واحد
    private readonly concurrency: number;
    // الفترة بين كل دفعة ودفعة بـ ms
    private readonly intervalMs: number;

    constructor(concurrency = 3, intervalMs = 500) {
        this.concurrency = concurrency;
        this.intervalMs = intervalMs;
        this.startProcessingLoop();
    }

    /**
     * تسجيل Handler لـ Job محدد بالاسم
     */
    register(jobName: string, handler: JobHandler) {
        this.handlers.set(jobName, handler);
    }

    /**
     * إضافة Job جديدة إلى الطابور
     */
    enqueue(name: string, payload: Record<string, any>, maxAttempts = 3) {
        const job: QueueJob = {
            id: `JOB-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
            name,
            payload,
            attempts: 0,
            maxAttempts,
            createdAt: new Date()
        };

        this.queue.push(job);
        console.log(`[QUEUE] Enqueued job: ${job.name} | ID: ${job.id} | Queue size: ${this.queue.length}`);
    }

    /**
     * الحصول على حالة الطابور (للـ Monitoring)
     */
    getStatus() {
        return {
            pending: this.queue.length,
            isProcessing: this.isProcessing,
            handlers: Array.from(this.handlers.keys())
        };
    }

    /**
     * حلقة المعالجة الداخلية (تعمل تلقائياً)
     */
    private startProcessingLoop() {
        setInterval(async () => {
            if (this.isProcessing || this.queue.length === 0) return;

            this.isProcessing = true;

            // أخذ Batch بحجم الـ concurrency
            const batch = this.queue.splice(0, this.concurrency);

            await Promise.allSettled(
                batch.map(job => this.runJob(job))
            );

            this.isProcessing = false;
        }, this.intervalMs);
    }

    private async runJob(job: QueueJob) {
        job.attempts++;
        const handler = this.handlers.get(job.name);

        if (!handler) {
            console.error(`[QUEUE] No handler registered for job: ${job.name} | ID: ${job.id}`);
            return;
        }

        try {
            console.log(`[QUEUE] Running job: ${job.name} | Attempt: ${job.attempts}/${job.maxAttempts} | ID: ${job.id}`);
            await handler(job);
            console.log(`[QUEUE] ✅ Job completed: ${job.name} | ID: ${job.id}`);
        } catch (err: any) {
            console.error(`[QUEUE] ❌ Job failed: ${job.name} | Attempt: ${job.attempts} | Error: ${err.message}`);

            // Retry Logic: أعد الـ Job للطابور إذا لم تستنفد المحاولات
            if (job.attempts < job.maxAttempts) {
                const delay = Math.pow(2, job.attempts) * 200; // Exponential Backoff
                setTimeout(() => {
                    console.log(`[QUEUE] 🔄 Retrying job: ${job.name} after ${delay}ms | ID: ${job.id}`);
                    this.queue.push(job);
                }, delay);
            } else {
                console.error(`[QUEUE] 💀 Job permanently failed after ${job.maxAttempts} attempts: ${job.name} | ID: ${job.id}`);
            }
        }
    }
}

// Singleton — طابور واحد مشترك لكل النظام
export const globalQueue = new InProcessQueue(3, 500);
