"use client"
import { Shield, Lock, Eye, FileLock, UserCog, Activity } from "lucide-react"

export function SecuritySection({ appLang = 'ar' }: { appLang?: 'ar' | 'en' }) {
  const isAr = appLang === 'ar'

  const pillars = [
    {
      icon: <Lock className="w-7 h-7" />,
      title: isAr ? 'عزل بيانات متعدد الشركات' : 'Multi-Tenant Data Isolation',
      desc: isAr ? 'Row-Level Security يضمن أن كل شركة ترى بياناتها فقط، حتى لو كنت تدير عدة شركات بنفس الحساب.' : 'Row-Level Security ensures each company sees only its own data — even with multiple companies on the same account.',
    },
    {
      icon: <UserCog className="w-7 h-7" />,
      title: isAr ? 'صلاحيات دقيقة (RBAC)' : 'Granular Permissions (RBAC)',
      desc: isAr ? 'صلاحيات لكل وحدة وكل إجراء (قراءة/كتابة/تحديث/حذف/اعتماد). أدوار مرنة قابلة للتخصيص.' : 'Per-module, per-action permissions (read/write/update/delete/approve). Flexible customizable roles.',
    },
    {
      icon: <FileLock className="w-7 h-7" />,
      title: isAr ? 'سير عمل الموافقات' : 'Approval Workflows',
      desc: isAr ? 'اعتمادات متعددة المستويات للمصروفات، المرتجعات، الاسترداد. منع التلاعب وفصل الصلاحيات.' : 'Multi-level approvals for expenses, returns, refunds. Prevent fraud, enforce segregation of duties.',
    },
    {
      icon: <Activity className="w-7 h-7" />,
      title: isAr ? 'سجل تدقيق كامل' : 'Complete Audit Trail',
      desc: isAr ? 'كل عملية مالية مسجلة مع المستخدم، التاريخ، البيانات قبل وبعد. لا حذف نهائى — soft-delete فقط.' : 'Every financial operation logged with user, timestamp, before/after data. No hard deletes — soft-delete only.',
    },
    {
      icon: <Eye className="w-7 h-7" />,
      title: isAr ? 'قفل الفترات المحاسبية' : 'Accounting Period Locks',
      desc: isAr ? 'بعد إغلاق الفترة، لا يمكن تعديل أى قيد. الإصلاحات تتم عبر prior-period adjustments (IAS 8).' : 'Once a period is closed, no entries can be modified. Corrections via prior-period adjustments (IAS 8).',
    },
    {
      icon: <Shield className="w-7 h-7" />,
      title: isAr ? 'حماية ضد الـ Overdraft' : 'Overdraft Prevention',
      desc: isAr ? 'النظام يمنع تلقائياً سحب أكثر من رصيد الحساب. ضمان عدم وجود حسابات نقدية سالبة.' : 'System prevents withdrawing more than account balance. Guarantees no negative cash accounts.',
    },
  ]

  return (
    <section id="security" className="py-24 px-4 sm:px-6 lg:px-8 relative bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-4 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
            <Shield className="w-4 h-4 text-red-600 dark:text-red-400" />
            <span className="text-sm font-semibold text-red-700 dark:text-red-300">
              {isAr ? 'أمان وحوكمة مؤسسية' : 'Enterprise Security & Governance'}
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-gray-900 dark:text-white">
            {isAr ? 'حماية قصوى لبياناتك المالية' : 'Maximum Protection for Your Financial Data'}
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            {isAr
              ? 'ستة طبقات من الحماية المؤسسية تضمن سلامة بياناتك وامتثالك للمعايير العالمية'
              : 'Six layers of enterprise-grade protection ensure your data integrity and global compliance'}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {pillars.map((p, i) => (
            <div key={i} className="group relative p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-red-500/50 hover:shadow-xl hover:shadow-red-500/10 transition-all">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
              <div className="relative">
                <div className="inline-flex p-3 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 text-white mb-4 shadow-md">
                  {p.icon}
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{p.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Compliance badges */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
          {[
            { label: 'IAS 21', desc: isAr ? 'فروق العملة' : 'FX Effects' },
            { label: 'IAS 8', desc: isAr ? 'تصحيح الأخطاء' : 'Error Corrections' },
            { label: 'IAS 7', desc: isAr ? 'التدفق النقدى' : 'Cash Flow' },
            { label: 'SOC 2', desc: isAr ? 'أمن المعلومات' : 'Security' },
            { label: 'GDPR', desc: isAr ? 'خصوصية البيانات' : 'Data Privacy' },
          ].map((b) => (
            <div key={b.label} className="flex flex-col items-center px-4 py-3 rounded-xl bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 border border-gray-200 dark:border-gray-700 min-w-[100px]">
              <div className="text-lg font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">{b.label}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{b.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
