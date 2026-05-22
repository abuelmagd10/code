"use client"
import { Calculator, Globe, Warehouse, Receipt, ShoppingBag, UserCheck, Users, Building2, Landmark, CalendarCheck, BarChart3, Bot } from "lucide-react"

export function ERPModulesSection({ appLang = 'ar' }: { appLang?: 'ar' | 'en' }) {
  const t = (ar: string, en: string) => (appLang === 'ar' ? ar : en)
  const modules = [
    { icon: <Calculator className="w-7 h-7" />, title: t('المحاسبة والمالية','Accounting & Finance'), desc: t('قيود يومية، شجرة حسابات، مراكز تكلفة، توافق IFRS','Journals, COA, cost centers, IFRS compliant'), gradient: 'from-blue-500 to-cyan-500' },
    { icon: <Globe className="w-7 h-7" />, title: t('تعدد العملات (IAS 21)','Multi-Currency (IAS 21)'), desc: t('فروق العملة الآلية، إعادة تقييم نهاية الفترة','Auto FX gain/loss, period-end revaluation'), gradient: 'from-purple-500 to-pink-500', highlight: true },
    { icon: <Warehouse className="w-7 h-7" />, title: t('المخزون والمستودعات','Inventory & Warehouses'), desc: t('FIFO/Average، تحويلات، تكلفة دقيقة','FIFO/Average, transfers, precise COGS'), gradient: 'from-orange-500 to-red-500' },
    { icon: <Receipt className="w-7 h-7" />, title: t('المبيعات والفواتير','Sales & Invoicing'), desc: t('عروض أسعار، فواتير، مرتجعات، خصومات','Quotes, invoices, returns, discounts'), gradient: 'from-green-500 to-emerald-500' },
    { icon: <ShoppingBag className="w-7 h-7" />, title: t('المشتريات والموردين','Purchases & Suppliers'), desc: t('أوامر شراء، فواتير، استلام، مردودات','POs, bills, receipts, returns'), gradient: 'from-indigo-500 to-purple-500' },
    { icon: <UserCheck className="w-7 h-7" />, title: t('إدارة العملاء (CRM)','CRM & Customers'), desc: t('بيانات العملاء، أرصدة، مراجعة الذمم','Customer data, balances, AR aging'), gradient: 'from-pink-500 to-rose-500' },
    { icon: <Users className="w-7 h-7" />, title: t('الموارد البشرية والرواتب','HR & Payroll'), desc: t('الموظفين، الحضور، الرواتب، البدلات','Employees, attendance, payroll'), gradient: 'from-violet-500 to-purple-500' },
    { icon: <Building2 className="w-7 h-7" />, title: t('تعدد الشركات والفروع','Multi-Company / Branches'), desc: t('شركات متعددة، فروع، عزل بيانات','Multiple companies, branches, isolation'), gradient: 'from-teal-500 to-cyan-500', highlight: true },
    { icon: <Landmark className="w-7 h-7" />, title: t('البنوك والخزائن','Banking & Treasury'), desc: t('حسابات متعددة العملات، تسويات بنكية','Multi-currency banks, reconciliations'), gradient: 'from-amber-500 to-orange-500' },
    { icon: <CalendarCheck className="w-7 h-7" />, title: t('الخدمات والحجوزات','Services & Bookings'), desc: t('حجز خدمات، اشتراكات، فوترة دورية','Services, subscriptions, recurring billing'), gradient: 'from-sky-500 to-blue-500' },
    { icon: <BarChart3 className="w-7 h-7" />, title: t('التقارير والتحليلات','Reports & Analytics'), desc: t('P&L، الميزانية، التدفق النقدى، KPIs','P&L, balance sheet, cash flow, KPIs'), gradient: 'from-fuchsia-500 to-pink-500' },
    { icon: <Bot className="w-7 h-7" />, title: t('مساعد الذكاء الاصطناعى','AI Copilot'), desc: t('تحليلات ذكية، توصيات، إجابات','Smart analytics, recommendations'), gradient: 'from-yellow-400 to-orange-500' },
  ]
  return (
    <section id="modules" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-4 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200">
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">{appLang === 'ar' ? '12 وحدة متكاملة' : '12 Integrated Modules'}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-gray-900 dark:text-white">{appLang === 'ar' ? 'نظام شامل لإدارة كل جوانب عملك' : 'Complete Suite'}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {modules.map((m, i) => (
            <div key={i} className={`relative p-6 rounded-2xl bg-white dark:bg-gray-900 border ${m.highlight ? 'border-blue-500/50' : 'border-gray-200 dark:border-gray-800'} hover:shadow-2xl hover:-translate-y-1 transition-all duration-300`}>
              {m.highlight && (<div className="absolute top-3 end-3 px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[10px] font-bold">{appLang === 'ar' ? 'مميز' : 'NEW'}</div>)}
              <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${m.gradient} text-white mb-4 shadow-lg`}>{m.icon}</div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{m.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{m.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
