"use client"
import Link from "next/link"
import { ArrowRight, Play, Sparkles, Shield, Globe2 } from "lucide-react"

export function HeroSection({ appLang = 'ar' }: { appLang?: 'ar' | 'en' }) {
  const t = (ar: string, en: string) => (appLang === 'ar' ? ar : en)
  return (
    <section className="relative pt-28 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-20 -right-32 w-96 h-96 bg-blue-500/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-10 -left-32 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="text-center lg:text-start">
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                {t('Enterprise ERP جاهز للإنتاج · IAS 21 Compliant','Enterprise ERP — Production Ready · IAS 21 Compliant')}
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold mb-6 leading-tight">
              <span className="block text-gray-900 dark:text-white">{t('نظام إدارة موارد المؤسسات','Enterprise Resource Planning')}</span>
              <span className="block mt-2 bg-gradient-to-r from-blue-600 via-cyan-500 to-purple-600 bg-clip-text text-transparent">
                {t('بمعايير عالمية','World-Class Standard')}
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
              {t('منصة محاسبية وإدارية متكاملة تدعم تعدد الشركات والفروع والعملات، مع حوكمة صارمة وأمان مؤسسى وتوافق كامل مع المعايير المحاسبية الدولية.','Integrated accounting & management platform with multi-company, multi-branch, multi-currency support — enterprise security, strict governance, and full IFRS/IAS compliance.')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-8">
              <Link href="/auth/sign-up" className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold shadow-lg hover:-translate-y-0.5 transition-all">
                {t('ابدأ تجربتك المجانية','Start Free Trial')}
                <ArrowRight className="w-5 h-5 rtl:rotate-180" />
              </Link>
              <Link href="#demo" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border-2 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white font-semibold hover:border-blue-500 hover:text-blue-600 transition-colors">
                <Play className="w-5 h-5" />
                {t('شاهد العرض التوضيحى','Watch Demo')}
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-green-500" /><span>{t('بدون بطاقة ائتمان','No credit card')}</span></div>
              <div className="flex items-center gap-2"><Globe2 className="w-4 h-4 text-blue-500" /><span>{t('دعم عربى/إنجليزى','Arabic/English')}</span></div>
              <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-500" /><span>AI Copilot</span></div>
            </div>
          </div>
          <div className="relative hidden lg:block">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-blue-500/20 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <div className="flex-1 mx-3"><div className="px-3 py-1 rounded text-xs text-gray-500 bg-white dark:bg-gray-800">7esab.com/dashboard</div></div>
              </div>
              <div className="p-6 bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-950">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    { label: t('المبيعات','Sales'), val: '£ 1.24M', color: 'from-blue-500 to-cyan-500', up: '+12.5%' },
                    { label: t('الأرباح','Profit'), val: '£ 387K', color: 'from-green-500 to-emerald-500', up: '+8.2%' },
                    { label: t('العملاء','Customers'), val: '1,847', color: 'from-purple-500 to-pink-500', up: '+5.1%' },
                    { label: t('الفواتير','Invoices'), val: '342', color: 'from-orange-500 to-red-500', up: '+18%' },
                  ].map((k) => (
                    <div key={k.label} className={`p-3 rounded-lg bg-gradient-to-br ${k.color} text-white shadow-md`}>
                      <div className="text-xs opacity-90">{k.label}</div>
                      <div className="text-lg font-bold mt-1">{k.val}</div>
                      <div className="text-xs mt-1 opacity-90">{k.up}</div>
                    </div>
                  ))}
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-3 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('أداء آخر 12 شهر','Last 12 months')}</span>
                    <span className="text-xs text-gray-500">EGP</span>
                  </div>
                  <svg viewBox="0 0 240 80" className="w-full h-20">
                    <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" /><stop offset="100%" stopColor="#3b82f6" stopOpacity="0" /></linearGradient></defs>
                    <path d="M0,60 L20,55 L40,45 L60,50 L80,30 L100,35 L120,20 L140,25 L160,15 L180,20 L200,10 L220,15 L240,5 L240,80 L0,80 Z" fill="url(#g1)" />
                    <path d="M0,60 L20,55 L40,45 L60,50 L80,30 L100,35 L120,20 L140,25 L160,15 L180,20 L200,10 L220,15 L240,5" stroke="#3b82f6" strokeWidth="2" fill="none" />
                  </svg>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {['USD 31.20','EUR 33.85','GBP 39.42','SAR 8.31'].map((c) => (
                    <div key={c} className="flex-1 px-2 py-1.5 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-center text-gray-700 dark:text-gray-300">{c}</div>
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute -top-3 -right-3 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold shadow-lg animate-bounce">IAS 21 ✓</div>
            <div className="absolute -bottom-3 -left-3 px-3 py-1.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold shadow-lg">{t('متعدد العملات','Multi-Currency')}</div>
          </div>
        </div>
      </div>
    </section>
  )
}
