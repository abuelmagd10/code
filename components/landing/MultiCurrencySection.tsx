"use client"
import { Globe2, TrendingUp, RefreshCw, FileCheck, Banknote, Coins } from "lucide-react"

export function MultiCurrencySection({ appLang = 'ar' }: { appLang?: 'ar' | 'en' }) {
  const isAr = appLang === 'ar'
  const features = [
    { icon: <Globe2 className="w-6 h-6" />, title: isAr ? 'دعم كامل لتعدد العملات' : 'Full Multi-Currency Support', desc: isAr ? 'EGP, USD, EUR, GBP + أى عملة' : 'EGP, USD, EUR, GBP + any currency' },
    { icon: <FileCheck className="w-6 h-6" />, title: isAr ? 'متوافق مع IAS 21' : 'IAS 21 Compliant', desc: isAr ? 'فروق العملة المحققة وغير المحققة' : 'Realized & unrealized FX' },
    { icon: <TrendingUp className="w-6 h-6" />, title: isAr ? 'فروق العملة الآلية' : 'Automated FX', desc: isAr ? 'تسجيل تلقائى عند الدفع' : 'Auto-post on payments' },
    { icon: <RefreshCw className="w-6 h-6" />, title: isAr ? 'إعادة تقييم نهاية الفترة' : 'Period-end Revaluation', desc: isAr ? 'Cash + AR + AP، مع قيد عكسى' : 'Cash + AR + AP, auto-reversal' },
    { icon: <Banknote className="w-6 h-6" />, title: isAr ? 'حسابات بنكية متعددة العملات' : 'Multi-Currency Banks', desc: isAr ? 'كل حساب بعملته الأصلية' : 'Each account in native currency' },
    { icon: <Coins className="w-6 h-6" />, title: isAr ? 'أسعار صرف Live/Manual' : 'Live or Manual Rates', desc: isAr ? 'تحكم كامل لكل شركة' : 'Per-company control' },
  ]
  return (
    <section id="multi-currency" className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-purple-950/20 dark:via-gray-950 dark:to-blue-950/20">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-4 rounded-full bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30">
              <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
              <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">{isAr ? '⭐ ميزة متفردة' : '⭐ Unique Capability'}</span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 text-gray-900 dark:text-white leading-tight">
              {isAr ? 'نظام عملات احترافى ' : 'Professional Multi-Currency '}
              <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">{isAr ? 'بمعايير عالمية' : 'World-Class System'}</span>
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">{isAr ? 'النظام يطبق المعايير المحاسبية الدولية (IAS 21) بشكل كامل: فروق العملة فى كل معاملة + إعادة تقييم نهاية الفترة.' : 'Full IAS 21 implementation: FX at every transaction + period-end revaluation.'}</p>
            <div className="grid sm:grid-cols-2 gap-4">
              {features.map((f, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg bg-white/50 dark:bg-gray-900/50 border border-gray-200/50 dark:border-gray-800/50 hover:bg-white dark:hover:bg-gray-900 transition-colors">
                  <div className="flex-shrink-0 p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 text-white">{f.icon}</div>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white text-sm">{f.title}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="p-6 rounded-3xl bg-gradient-to-br from-gray-900 to-blue-950 shadow-2xl shadow-purple-500/30 border border-purple-500/20">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-gray-400 font-mono">{isAr ? 'مثال - قيد فروق العملة' : 'Example - FX Adjustment'}</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-green-500/20 text-green-300 font-mono">v3.27.7</span>
              </div>
              <div className="p-4 rounded-lg bg-black/30 mb-3 border border-white/10">
                <div className="text-xs text-gray-400 mb-1">Invoice INV-001</div>
                <div className="flex items-center justify-between"><span className="text-white text-sm">USD 1,000</span><span className="text-purple-300 text-xs">@ rate 30.00</span></div>
                <div className="text-xs text-gray-400 mt-1">AR booked: <span className="text-green-300 font-mono">30,000 EGP</span></div>
              </div>
              <div className="p-4 rounded-lg bg-black/30 mb-3 border border-white/10">
                <div className="text-xs text-gray-400 mb-1">{isAr ? 'دفعة بعد شهر' : 'Payment 1 month later'}</div>
                <div className="flex items-center justify-between"><span className="text-white text-sm">USD 1,000</span><span className="text-orange-300 text-xs">@ rate 31.50</span></div>
                <div className="text-xs text-gray-400 mt-1">Cash in: <span className="text-green-300 font-mono">31,500 EGP</span></div>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-400/50">
                <div className="text-xs font-bold text-purple-200 mb-2">{isAr ? 'قيد تلقائى' : 'Auto entry'}</div>
                <div className="font-mono text-xs space-y-1">
                  <div className="text-cyan-300">Dr Cash             31,500</div>
                  <div className="text-cyan-300">   Cr AR              30,000</div>
                  <div className="text-yellow-300">   Cr FX Gain          1,500</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
