"use client"
import { Shield, Lock, Eye, FileLock, UserCog, Activity } from "lucide-react"

export function SecuritySection({ appLang = 'ar' }: { appLang?: 'ar' | 'en' }) {
  const isAr = appLang === 'ar'
  const pillars = [
    { icon: <Lock className="w-7 h-7" />, title: isAr ? 'عزل بيانات متعدد الشركات' : 'Multi-Tenant Data Isolation', desc: isAr ? 'Row-Level Security يضمن عزل كامل لبيانات كل شركة.' : 'RLS ensures full data isolation per company.' },
    { icon: <UserCog className="w-7 h-7" />, title: isAr ? 'صلاحيات دقيقة (RBAC)' : 'Granular Permissions (RBAC)', desc: isAr ? 'صلاحيات لكل وحدة وكل إجراء.' : 'Per-module/action permissions.' },
    { icon: <FileLock className="w-7 h-7" />, title: isAr ? 'سير عمل الموافقات' : 'Approval Workflows', desc: isAr ? 'اعتمادات متعددة المستويات.' : 'Multi-level approvals.' },
    { icon: <Activity className="w-7 h-7" />, title: isAr ? 'سجل تدقيق كامل' : 'Complete Audit Trail', desc: isAr ? 'كل عملية مسجلة. soft-delete فقط.' : 'Every operation logged.' },
    { icon: <Eye className="w-7 h-7" />, title: isAr ? 'قفل الفترات المحاسبية' : 'Accounting Period Locks', desc: isAr ? 'لا تعديل بعد القفل. IAS 8.' : 'No edits after close. IAS 8.' },
    { icon: <Shield className="w-7 h-7" />, title: isAr ? 'حماية ضد الـ Overdraft' : 'Overdraft Prevention', desc: isAr ? 'منع تلقائى للسحب من حساب فارغ.' : 'Auto-prevent overdrafts.' },
  ]
  return (
    <section id="security" className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-4 rounded-full bg-red-50 dark:bg-red-950/30 border border-red-200">
            <Shield className="w-4 h-4 text-red-600" />
            <span className="text-sm font-semibold text-red-700 dark:text-red-300">{isAr ? 'أمان وحوكمة مؤسسية' : 'Enterprise Security & Governance'}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-gray-900 dark:text-white">{isAr ? 'حماية قصوى لبياناتك المالية' : 'Maximum Protection'}</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {pillars.map((p, i) => (
            <div key={i} className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-red-500/50 hover:shadow-xl transition-all">
              <div className="inline-flex p-3 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 text-white mb-4 shadow-md">{p.icon}</div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{p.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{p.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          {[
            { label: 'IAS 21', desc: isAr ? 'فروق العملة' : 'FX Effects' },
            { label: 'IAS 8', desc: isAr ? 'تصحيح الأخطاء' : 'Error Corrections' },
            { label: 'IAS 7', desc: isAr ? 'التدفق النقدى' : 'Cash Flow' },
            { label: 'SOC 2', desc: isAr ? 'أمن المعلومات' : 'Security' },
            { label: 'GDPR', desc: isAr ? 'خصوصية البيانات' : 'Data Privacy' },
          ].map((b) => (
            <div key={b.label} className="flex flex-col items-center px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 min-w-[100px]">
              <div className="text-lg font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">{b.label}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{b.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
