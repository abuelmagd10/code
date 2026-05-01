'use client';
import { useState } from 'react';
import { Users, CreditCard, Loader2, CheckCircle, Minus, Plus, X } from 'lucide-react';

interface UpgradeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  userId: string;
  userEmail: string;
  userName: string;
}

export default function UpgradeDialog({
  isOpen,
  onClose,
  companyId,
  userId,
  userEmail,
  userName,
}: UpgradeDialogProps) {
  const [users, setUsers] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pricePerUser = 500; // 500 EGP per additional user
  const totalPrice = users * pricePerUser;

  const handlePayment = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Create payment intention on our backend
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          additionalUsers: users,
          companyId,
          userId,
          userEmail,
          userName,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.client_secret) {
        throw new Error(data.error || 'فشل في إنشاء طلب الدفع');
      }

      // 2. Redirect to Paymob Unified Checkout
      const paymobUrl = `https://accept.paymob.com/unifiedcheckout/?publicKey=${data.public_key}&clientSecret=${data.client_secret}`;
      window.location.href = paymobUrl;

    } catch (err: any) {
      setError(err.message || 'حدث خطأ. يرجى المحاولة لاحقاً.');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 rounded-3xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="p-6 border-b border-white/10 bg-gradient-to-r from-blue-600/20 to-purple-600/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">ترقية الاشتراك</h2>
                <p className="text-gray-400 text-sm">إضافة مستخدمين إضافيين إلى حسابك</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">

          {/* User Counter */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <label className="text-sm text-gray-400 mb-3 block">عدد المستخدمين الإضافيين</label>
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={() => setUsers(Math.max(1, users - 1))}
                className="w-12 h-12 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl flex items-center justify-center transition-all"
              >
                <Minus className="w-5 h-5" />
              </button>
              <span className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                {users}
              </span>
              <button
                onClick={() => setUsers(Math.min(50, users + 1))}
                className="w-12 h-12 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl flex items-center justify-center transition-all"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Price Breakdown */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-400">
              <span>{users} مستخدم × 500 جنيه / شهر</span>
              <span>{totalPrice.toLocaleString('ar-EG')} جنيه</span>
            </div>
            <div className="border-t border-white/10 pt-2 flex justify-between font-bold text-lg">
              <span>الإجمالي الشهري</span>
              <span className="text-blue-400">{totalPrice.toLocaleString('ar-EG')} جنيه</span>
            </div>
          </div>

          {/* What you get */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 space-y-2">
            {[
              'جميع ميزات النظام لكل مستخدم جديد',
              'إلغاء الاشتراك في أي وقت بدون التزامات',
              'دعم فني ذو أولوية 24/7',
              'تفعيل فوري بعد إتمام الدفع',
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                <span className="text-gray-300">{item}</span>
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400 text-center">
              {error}
            </div>
          )}

          {/* Pay Button */}
          <button
            onClick={handlePayment}
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl font-bold text-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                جارٍ تحضير الدفع...
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                ادفع {totalPrice.toLocaleString('ar-EG')} جنيه الآن
              </>
            )}
          </button>

          <p className="text-center text-xs text-gray-500">
            مدفوعات آمنة ومشفرة 🔒 بواسطة <span className="text-blue-400 font-bold">Paymob</span>
          </p>
        </div>
      </div>
    </div>
  );
}
