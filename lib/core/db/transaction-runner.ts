import { createClient } from '@/lib/supabase/server';
import { ErrorHandler } from '../errors/error-handler';
import { ERPError } from '../errors/erp-errors';

export interface TransactionOptions {
    /**
     * الحد الأقصى للمحاولات عند حدوث Deadlock
     */
    maxRetries?: number;
    /**
     * معرف الحركة لتسهيل تتبعها في الـ Logs
     */
    correlationId?: string;
}

/**
 * Unified Transaction Runner
 * 
 * المكون المسؤول عن تشغيل الـ Database RPCs كـ Atomic Transaction.
 * 
 * - يوفر حماية من الـ Race Conditions عن طريق إعادة المحاولة تلقائياً (Intelligent Retry Logic).
 * - يعزل أخطاء قاعدة البيانات ويرميها كـ ERPErrors نظيفة.
 */
export async function executeAtomicOperation<T>(
    rpcName: string,
    payload: Record<string, any>,
    options: TransactionOptions = {}
): Promise<T> {
    const { maxRetries = 3, correlationId = `TX-${Date.now()}` } = options;
    let attempts = 0;

    const supabase = await createClient();

    while (attempts < maxRetries) {
        attempts++;

        try {
            const { data, error } = await supabase.rpc(rpcName, payload);

            if (error) {
                // إذا كان الخطأ ديدلوك (40P01)، سنحاول مرة أخرى لأن النظام مشغول مؤقتاً
                if (error.code === '40P01' && attempts < maxRetries) {
                    const delay = Math.pow(2, attempts) * 100 + Math.random() * 50; // Exponential Backoff
                    console.warn(`[TX_RETRY] Deadlock detected on ${rpcName}. Retrying in ${delay}ms... (Attempt ${attempts} of ${maxRetries}) [${correlationId}]`);
                    await new Promise(res => setTimeout(res, delay));
                    continue;
                }

                // أخطاء شائعة يتم التقاطها (كما في قاعدة بيانات بوستجريس)
                // إذا كان خطأ تحقق (Validation Error أُلقي بـ RAISE EXCEPTION)
                if (error.code === 'P0001') {
                    throw new ERPError('ERR_VALIDATION', error.message, 400, null, correlationId);
                }

                // أي خطأ آخر لم يعالج، سيتم رميه ليتعامل معه الـ Global Error Handler
                throw error;
            }

            // 🎯 نجحت العملية
            return data as T;

        } catch (err: any) {
            if (err instanceof ERPError) throw err;

            // التوقف ورمي الخطأ إذا وصلنا للحد الأقصى أو لم يكن الخطأ يعالج بالـ Retry
            if (attempts >= maxRetries) {
                console.error(`[TX_FAIL] Transaction failed after ${attempts} attempts:`, err);
                throw err;
            }
            throw err;
        }
    }

    throw new ERPError('ERR_SYSTEM', 'فشلت جميع محاولات تنفيذ الترانزكشن', 500, null, correlationId);
}
