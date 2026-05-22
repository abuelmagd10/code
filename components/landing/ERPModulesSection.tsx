"use client"
import {
  Calculator, Globe, Warehouse, Receipt, ShoppingBag, UserCheck,
  Users, Building2, Landmark, CalendarCheck, BarChart3, Bot
} from "lucide-react"

interface Module {
  icon: React.ReactNode
  title: { ar: string; en: string }
  desc: { ar: string; en: string }
  gradient: string
  highlight?: boolean
}

export function ERPModulesSection({ appLang = 'ar' }: { appLang?: 'ar' | 'en' }) {
  const t = (obj: { ar: string; en: string }) => obj[appLang]

  const modules: Module[] = [
    {
      icon: <Calculator className="w-7 h-7" />,
      title: { ar: 'المحاسبة والمالية', en: 'Accounting & Finance' },
      desc: { ar: 'قيود يومية، شجرة حسابات، مراكز تكلفة، إغلاق سنوى، توافق IFRS', en: 'Journals, COA, cost centers, year-end close, IFRS compliant' },
      gradient: 'from-blue-500 to-cyan-500',
    },
    {
      icon: <Globe className="w-7 h-7" />,
      title: { ar: 'تعدد العملات (IAS 21)', en: 'Multi-Currency (IAS 21)' },
      desc: { ar: 'فروق العملة الآلية، إعادة تقييم نهاية الفترة، Live/Manual rates', en: 'Auto FX gain/loss, period-end revaluation, live/manual rates' },
      gradient: 'from-purple-500 to-pink-500',
      highlight: true,
    },
    {
      icon: <Warehouse className="w-7 h-7" />,
      title: { ar: 'المخزون والمستودعات', en: 'Inventory & Warehouses' },
      desc: { ar: 'FIFO/Average، تحويلات، تتبع فورى، تكلفة دقيقة لكل صنف', en: 'FIFO/Average, transfers, real-time tracking, precise COGS' },
      gradient: 'from-orange-500 to-red-500',
    },
    {
      icon: <Receipt className="w-7 h-7" />,
      title: { ar: 'المبيعات والفواتير', en: 'Sales & Invoicing' },
      desc: { ar: 'عروض أسعار، فواتير، مرتجعات، خصومات، أرصدة دائنة', en: 'Quotes, invoices, returns, discounts, credit notes' },
      gradient: 'from-green-500 to-emerald-500',
    },
    {
      icon: <ShoppingBag className="w-7 h-7" />,
      title: { ar: 'المشتريات والموردين', en: 'Purchases & Suppliers' },
      desc: { ar: 'أوامر شراء، فواتير، استلام، مردودات، إدارة الموردين', en: 'POs, bills, receipts, returns, supplier management' },
      gradient: 'from-indigo-500 to-purple-500',
    },
    {
      icon: <UserCheck className="w-7 h-7" />,
      title: { ar: 'إدارة العملاء (CRM)', en: 'CRM & Customers' },
      desc: { ar: 'بيانات العملاء، أرصدة، تواصل، مراجعة الذمم', en: 'Customer data, balances, communications, AR aging' },
      gradient: 'from-pink-500 to-rose-500',
    },
    {
      icon: <Users className="w-7 h-7" />,
      title: { ar: 'الموارد البشرية والرواتب', en: 'HR & Payroll' },
      desc: { ar: 'الموظفين، الحضور، الرواتب، البدلات، العمولات', en: 'Employees, attendance, payroll, allowances, commissions' },
      gradient: 'from-violet-500 to-purple-500',
    },
    {
      icon: <Building2 className="w-7 h-7" />,
      title: { ar: 'تعدد الشركات والفروع', en: 'Multi-Company / Branches' },
      desc: { ar: 'شركات متعددة، فروع، عزل بيانات، مراكز تكلفة', en: 'Multiple companies, branches, data isolation, cost centers' },
      gradient: 'from-teal-500 to-cyan-500',
      highlight: true,
    },
    {
      icon: <Landmark className="w-7 h-7" />,
      title: { ar: 'البنوك والخزائن', en: 'Banking & Treasury' },
      desc: { ar: 'حسابات بنكية متعددة العملات، تحويلات، تسويات بنكية', en: 'Multi-currency banks, transfers, reconciliations' },
      gradient: 'from-amber-500 to-orange-500',
    },
    {
      icon: <CalendarCheck className="w-7 h-7" />,
      title: { ar: 'الخدمات والحجوزات', en: 'Services & Bookings' },
      desc: { ar: 'حجز خدمات، مواعيد، اشتراكات، فوترة دورية', en: 'Service booking, appointments, subscriptions, recurring billing' },
      gradient: 'from-sky-500 to-blue-500',
    },
    {
      icon: <BarChart3 className="w-7 h-7" />,
      title: { ar: 'التقارير والتحليلات', en: 'Reports & Analytics' },
      desc: { ar: 'P&L، الميزانية، التدفق النقدى، KPIs، تقارير مخصصة', en: 'P&L, balance sheet, cash flow, KPIs, custom reports' },
      gradient: 'from-fuchsia-500 to-pink-500',
    },
    {
      icon: <Bot className="w-7 h-7" />,
      title: { ar: 'مساعد الذكاء الاصطناعى', en: 'AI Copilot' },
      desc: { ar: 'تحليلات ذكية، توصيات، إجابات على استفسارات النظام', en: 'Smart analytics, recommendations, in-app Q&A' },
      gradient: 'from-yellow-400 to-orange-500',
    },
  ]

  return (
    <section id="modules" className="py-20 px-4 sm:px-6 lg:px-8 relative">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-4 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900">
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
              {appLang === 'ar' ? '12 وحدة متكاملة' : '12 Integrated Modules'}
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-gray-900 dark:text-white">
            {appLang === 'ar' ? 'نظام شامل لإدارة كل جوانب عملك' : 'Complete Suite for Every Aspect of Your Business'}
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            {appLang === 'ar'
              ? 'كل ما تحتاجه فى منصة واحدة، مع تكامل لحظى بين كل الوحدات'
              : 'Everything you need on one platform, with real-time integration across all modules'}
          </p>
        </div>

        {/* Modules grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {modules.map((m, i) => (
            <div
              key={i}
              className={`group relative p-6 rounded-2xl bg-white dark:bg-gray-900 border ${m.highlight ? 'border-blue-500/50' : 'border-gray-200 dark:border-gray-800'} hover:border-transparent hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1 transition-all duration-300 overflow-hidden`}
            >
              {/* Gradient hover overlay */}
              <div className={`absolute inset-0 bg-gradient-to-br ${m.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />

              {/* "Featured" badge for highlight modules */}
              {m.highlight && (
                <div className="absolute top-3 end-3 px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[10px] font-bold">
                  {appLang === 'ar' ? 'مميز' : 'NEW'}
                </div>
              )}

              {/* Icon */}
              <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${m.gradient} text-white mb-4 shadow-lg`}>
                {m.icon}
              </div>

              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 leading-tight">
                {t(m.title)}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {t(m.desc)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
