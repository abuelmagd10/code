'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function PaymentResultPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');
  const [details, setDetails] = useState<{ amount?: string; users?: string } | null>(null);

  useEffect(() => {
    const success = searchParams.get('success');
    const amountCents = searchParams.get('amount_cents');
    const extraUsers = searchParams.get('extra_users');

    if (success === 'true') {
      setStatus('success');
      setDetails({
        amount: amountCents ? `$${(parseInt(amountCents) / 100).toFixed(0)}` : undefined,
        users: extraUsers || undefined,
      });
      // Auto-redirect to dashboard after 5 seconds
      setTimeout(() => router.push('/dashboard'), 5000);
    } else {
      setStatus('failed');
    }
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 text-white flex items-center justify-center px-4">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 max-w-md w-full">
        {/* Loading State */}
        {status === 'loading' && (
          <div className="text-center p-12 bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl">
            <Loader2 className="w-16 h-16 text-blue-400 mx-auto mb-6 animate-spin" />
            <h1 className="text-2xl font-bold mb-2">جارٍ التحقق من الدفع...</h1>
            <p className="text-gray-400">يرجى الانتظار لحظة</p>
          </div>
        )}

        {/* Success State */}
        {status === 'success' && (
          <div className="text-center p-12 bg-gradient-to-br from-green-500/20 to-emerald-500/10 backdrop-blur-sm border border-green-500/30 rounded-3xl">
            <div className="w-24 h-24 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-green-500/30">
              <CheckCircle className="w-14 h-14" />
            </div>
            <h1 className="text-3xl font-bold mb-3 text-green-400">تم الدفع بنجاح! 🎉</h1>
            <p className="text-gray-300 text-lg mb-2">
              شكراً لاشتراكك في نظام <span className="font-bold text-white">7ESAB ERP</span>
            </p>
            {details?.users && (
              <p className="text-gray-400 mb-1">
                تم إضافة <span className="font-bold text-green-400">{details.users} مستخدم</span> إضافي لحسابك
              </p>
            )}
            {details?.amount && (
              <p className="text-gray-400 mb-8">
                المبلغ المدفوع: <span className="font-bold text-white">{details.amount} / شهر</span>
              </p>
            )}
            <div className="space-y-3">
              <Link
                href="/dashboard"
                className="flex items-center justify-center gap-2 w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl font-bold text-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg"
              >
                الانتقال للوحة التحكم
                <ArrowRight className="w-5 h-5" style={{ transform: 'scaleX(-1)' }} />
              </Link>
              <p className="text-xs text-gray-500">سيتم توجيهك تلقائياً خلال 5 ثوانٍ...</p>
            </div>
          </div>
        )}

        {/* Failed State */}
        {status === 'failed' && (
          <div className="text-center p-12 bg-gradient-to-br from-red-500/20 to-pink-500/10 backdrop-blur-sm border border-red-500/30 rounded-3xl">
            <div className="w-24 h-24 bg-gradient-to-br from-red-500 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-red-500/30">
              <XCircle className="w-14 h-14" />
            </div>
            <h1 className="text-3xl font-bold mb-3 text-red-400">فشلت عملية الدفع</h1>
            <p className="text-gray-300 text-lg mb-8">
              لم تتم معالجة دفعتك. لم يتم خصم أي مبلغ من حسابك.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => router.back()}
                className="flex items-center justify-center gap-2 w-full py-4 bg-gradient-to-r from-red-600 to-pink-600 rounded-xl font-bold text-lg hover:from-red-700 hover:to-pink-700 transition-all shadow-lg"
              >
                حاول مرة أخرى
              </button>
              <Link
                href="/"
                className="block w-full py-4 bg-white/10 border border-white/20 rounded-xl font-bold text-lg hover:bg-white/20 transition-all"
              >
                العودة للرئيسية
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
