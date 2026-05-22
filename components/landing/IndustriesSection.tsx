"use client"
import { Store, Factory, Truck, Stethoscope, GraduationCap, Hotel, Briefcase, Wrench } from "lucide-react"

export function IndustriesSection({ appLang = 'ar' }: { appLang?: 'ar' | 'en' }) {
  const isAr = appLang === 'ar'
  const industries = [
    { icon: <Store />, name: isAr ? 'تجارة التجزئة' : 'Retail', color: 'from-blue-500 to-cyan-500' },
    { icon: <Factory />, name: isAr ? 'التصنيع' : 'Manufacturing', color: 'from-orange-500 to-red-500' },
    { icon: <Truck />, name: isAr ? 'التوزيع واللوجستيات' : 'Distribution & Logistics', color: 'from-green-500 to-emerald-500' },
    { icon: <Stethoscope />, name: isAr ? 'الرعاية الصحية' : 'Healthcare', color: 'from-pink-500 to-rose-500' },
    { icon: <GraduationCap />, name: isAr ? 'التعليم' : 'Education', color: 'from-purple-500 to-indigo-500' },
    { icon: <Hotel />, name: isAr ? 'الضيافة والفنادق' : 'Hospitality', color: 'from-amber-500 to-yellow-500' },
    { icon: <Briefcase />, name: isAr ? 'الخدمات المهنية' : 'Professional Services', color: 'from-slate-500 to-gray-600' },
    { icon: <Wrench />, name: isAr ? 'الصيانة والخدمات' : 'Maintenance & Services', color: 'from-teal-500 to-cyan-600' },
  ]
  return (
    <section id="industries" className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900 dark:text-white">{isAr ? 'مصمم لكل القطاعات' : 'Built for Every Industry'}</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {industries.map((ind, i) => (
            <div key={i} className="group flex flex-col items-center p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:shadow-xl transition-all">
              <div className={`p-4 rounded-2xl bg-gradient-to-br ${ind.color} text-white mb-3 group-hover:scale-110 transition-transform`}>{ind.icon}</div>
              <span className="text-sm font-semibold text-gray-900 dark:text-white text-center">{ind.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
