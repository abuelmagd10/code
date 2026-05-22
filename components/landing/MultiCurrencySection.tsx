"use client"
import { Globe2, TrendingUp, RefreshCw, FileCheck, Banknote, Coins } from "lucide-react"

export function MultiCurrencySection({ appLang = 'ar' }: { appLang?: 'ar' | 'en' }) {
  const isAr = appLang === 'ar'

  const features = [
    {
      icon: <Globe2 className="w-6 h-6" />,
      title: isAr ? 'دعم كامل لتعدد العملات' : 'Full Multi-Currency Support',
      desc: isAr ? 'EGP, USD, EUR, GBP, SAR, AED + أى عملة' : 'EGP, USD, EUR, GBP, SAR, AED + any currency',
    },
    {
      icon: <FileCheck className="w-6 h-6" />,
      title: isAr ? 'متوافق مع IAS 21' : 'IAS 21 Compliant',
      desc: isAr ? 'تسجيل فروق العملة المحققة وغير المحققة بدقة' : 'Accurate realized & unrealized FX recording',
    },
    {
      icon: <TrendingUp className="w-6 h-6" />,
      title: isAr ? 'فروق العملة الآلية' : 'Automated FX Gain/Loss',
      desc: isAr ? 'تسجيل تلقائى عند الدفع والاسترداد والتحويل' : 'Auto-post on payments, refunds, transfers',
    },
    {
      icon: <RefreshCw className="w-6 h-6" />,
      title: isAr ? 'إعادة تقييم نهاية الفترة' : 'Period-end Revaluation',
      desc: isAr ? 'Cash + AR + AP، مع قيد عكسى تلقائى' : 'Cash + AR + AP, with auto-reversal',
    },
    {
      icon: <Banknote className="w-6 h-6" />,
      title: isAr ? 'حسابات بنكية متعددة العملات' : 'Multi-Currency Bank Accounts',
      desc: isAr ? 'كل حساب يحتفظ بعملته الأصلية + ما يعادل بالعملة الأساسية' : 'Each account keeps native + base equivalent',
    },
    {
      icon: <Coins className="w-6 h-6" />,
      title: isAr ? 'أسعار صرف Live أو Manual' : 'Live or Manual Exchange Rates',
      desc: isAr ? 'تحكم كامل لكل شركة، مع audit trail' : 'Full per-company control with audit trail',
    },
  ]

  return (
    <section id="multi-currency" className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-purple-950/20 dark:via-gray-950 dark:to-blue-950/20" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-300/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-300/20 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left content */}
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-4 rounded-full bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30">
              <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
              <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                {isAr ? '⭐ ميزة متفردة' : '⭐ Unique Capability'}
              </span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 text-gray-900 dark:text-white leading-tight">
              {isAr ? 'نظام عملات احترافى ' : 'Professional Multi-Currency '}
              <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                {isAr ? 'بمعايير عالمية' : 'World-Class System'}
              </span>
            </h2>

            <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
              {isAr
                ? 'النظام الوحيد فى منطقتنا الذى يطبق المعايير المحاسبية الدولية (IAS 21) بشكل كامل: من تسجيل فروق العملة عند كل معاملة، إلى إعادة تقييم نهاية الفترة للذمم المدينة والدائنة والحسابات النقدية — كله تلقائى وقابل للتدقيق.'
                : 'The only system in our region implementing IAS 21 fully: from FX gain/loss recording at every transaction, to period-end revaluation for AR/AP/Cash — all automated and audit-ready.'}
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              {features.map((f, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg bg-white/50 dark:bg-gray-900/50 border border-gray-200/50 dark:border-gray-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-900 transition-colors">
                  <div className="flex-shrink-0 p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                    {f.icon}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white text-sm">{f.title}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: animated FX showcase */}
          <div className="relative">
            <div className="relative p-6 rounded-3xl bg-gradient-to-br from-gray-900 to-blue-950 shadow-2xl shadow-purple-500/30 border border-purple-500/20">
              {/* Code header */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-gray-400 font-mono">{isAr ? 'مثال — قيد فروق العملة التلقائى' : 'Example — Auto FX Adjustment'}</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-green-500/20 text-green-300 font-mono">v3.27.7</span>
              </div>

              {/* Mock invoice */}
              <div className="p-4 rounded-lg bg-black/30 mb-4 border border-white/10">
                <div className="text-xs text-gray-400 mb-2">Invoice INV-001</div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm">USD 1,000</span>
                  <span className="text-purple-300 text-xs">@ rate 30.00</span>
                </div>
                <div className="text-xs text-gray-400">→ AR booked: <span className="text-green-300 font-mono">30,000 EGP</span></div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center my-2">
                <div className="w-px h-6 bg-gradient-to-b from-purple-500 to-transparent" />
              </div>

              {/* Payment with rate change */}
              <div className="p-4 rounded-lg bg-black/30 mb-4 border border-white/10">
                <div className="text-xs text-gray-400 mb-2">{isAr ? 'دفعة بعد شهر' : 'Payment after 1 month'}</div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm">USD 1,000</span>
                  <span className="text-orange-300 text-xs">@ rate 31.50</span>
                </div>
                <div className="text-xs text-gray-400">→ Cash in: <span className="text-green-300 font-mono">31,500 EGP</span></div>
              </div>

              {/* Auto-generated entry */}
              <div className="p-4 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-400/50">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkle />
                  <span className="text-xs font-bold text-purple-200">{isAr ? 'قيد تلقائى مُنشأ' : 'Auto-generated entry'}</span>
                </div>
                <div className="font-mono text-xs space-y-1">
                  <div className="text-cyan-300">Dr Cash               31,500</div>
                  <div className="text-cyan-300">   Cr AR                 30,000</div>
                  <div className="text-yellow-300">   Cr FX Gain (4320)      1,500</div>
                </div>
                <div className="mt-2 pt-2 border-t border-white/10 text-[10px] text-gray-400">
                  {isAr ? 'مرجع: fx_payment_adjustment · IAS 21 §28' : 'ref: fx_payment_adjustment · IAS 21 §28'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Sparkle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-300">
      <path d="M12 2l1.5 5L19 8l-5 1.5L12 15l-2-5.5L5 8l5.5-1L12 2z" />
    </svg>
  )
}
