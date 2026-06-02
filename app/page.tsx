"use client"
import React, { useState, useEffect } from 'react'
import { ArrowRight, CheckCircle, Menu, X, Sparkles, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { HeroSection } from '@/components/landing/HeroSection'
import { ERPModulesSection } from '@/components/landing/ERPModulesSection'
import { MultiCurrencySection } from '@/components/landing/MultiCurrencySection'
import { SecuritySection } from '@/components/landing/SecuritySection'
import { IndustriesSection } from '@/components/landing/IndustriesSection'

const ERPWebsite = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    try { setAppLang(localStorage.getItem('app_language') === 'en' ? 'en' : 'ar') } catch { }
  }, [])

  const isAr = appLang === 'ar'

  // ✅ v3.64.0 — إحصائيات تَقنية صادقة بدلاً من أرقام مُختَلَقة
  // كل ما هنا قابل للتَّحقُّق من الكود/الـ DB، لا "500+ شركة" كاذبة
  const stats = [
    { num: '150+', label: isAr ? 'ميزة وحدة كاملة' : 'Full features' },
    { num: 'IAS 21', label: isAr ? 'تَعدُّد عملات كامل' : 'Multi-currency' },
    { num: 'AES-256', label: isAr ? 'تشفير نسخك الاحتياطية' : 'Backup encryption' },
    { num: 'Paymob', label: isAr ? 'دفع بالجنيه المصرى' : 'EGP payments' },
  ]

  const workProcess = [
    { num: 1, title: isAr ? 'التسجيل المجانى' : 'Free Signup', desc: isAr ? 'أنشئ حسابك فى دقائق' : 'Create your account' },
    { num: 2, title: isAr ? 'إعداد النظام' : 'System Setup', desc: isAr ? 'خصص النظام لاحتياجاتك' : 'Customize for your needs' },
    { num: 3, title: isAr ? 'استيراد البيانات' : 'Data Import', desc: isAr ? 'انقل بياناتك بسهولة' : 'Transfer your data' },
    { num: 4, title: isAr ? 'ابدأ العمل' : 'Start Working', desc: isAr ? 'إدارة باحتراف' : 'Manage professionally' },
  ]

  const faqs = [
    { q: isAr ? 'هل النظام مناسب للشركات الصغيرة والمتوسطة؟' : 'Is the system suitable for SMBs?', a: isAr ? 'نعم، مصمم لجميع أحجام الشركات.' : 'Yes, designed for all company sizes.' },
    { q: isAr ? 'هل يدعم النظام اللغة العربية بالكامل؟' : 'Does it fully support Arabic?', a: isAr ? 'نعم، دعم كامل للعربية مع RTL.' : 'Full Arabic RTL support.' },
    { q: isAr ? 'كيف يتم التعامل مع المعاملات بعملات مختلفة؟' : 'How are multi-currency transactions handled?', a: isAr ? 'النظام يطبق معيار IAS 21 الكامل.' : 'Full IAS 21 compliance.' },
    { q: isAr ? 'هل البيانات آمنة؟' : 'Is data secure?', a: isAr ? 'نعم، RLS + multi-tenant + audit trail.' : 'Yes - RLS + multi-tenant + audit trail.' },
    { q: isAr ? 'هل يمكن إدارة عدة شركات؟' : 'Can I manage multiple companies?', a: isAr ? 'نعم، دعم كامل لتعدد الشركات.' : 'Yes, full multi-company support.' },
  ]

  const FAQItem = ({ faq }: { faq: { q: string; a: string } }) => {
    const [isOpen, setIsOpen] = useState(false)
    return (
      <div className="border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden bg-white dark:bg-gray-900">
        <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-5 text-start hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <span className="font-semibold text-gray-900 dark:text-white">{faq.q}</span>
          <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform flex-shrink-0 ms-3 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (<div className="px-5 pb-5 text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-800 pt-4">{faq.a}</div>)}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-blue-950 text-gray-900 dark:text-white" dir={isAr ? 'rtl' : 'ltr'}>
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrollY > 20 ? 'bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2">
              <img src="/icons/icon-64x64.png" alt="7ESAB ERP" width={36} height={36} className="w-9 h-9 rounded-lg shadow-md object-contain" />
              <span className="text-lg font-bold text-gray-900 dark:text-white">7ESAB <span className="text-xs text-blue-600">ERP</span></span>
            </Link>
            <div className="hidden md:flex items-center gap-6">
              <a href="#modules" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600">{isAr ? 'الوحدات' : 'Modules'}</a>
              <a href="#multi-currency" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600">{isAr ? 'تعدد العملات' : 'Multi-Currency'}</a>
              <a href="#security" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600">{isAr ? 'الأمان' : 'Security'}</a>
              <a href="#pricing" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600">{isAr ? 'الأسعار' : 'Pricing'}</a>
              <a href="#faq" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600">{isAr ? 'الأسئلة' : 'FAQ'}</a>
              <button onClick={() => { const n = isAr ? 'en' : 'ar'; setAppLang(n); try { localStorage.setItem('app_language', n) } catch { } }} className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors">{isAr ? 'EN' : 'عربى'}</button>
              <Link href="/auth/login" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600">{isAr ? 'تسجيل الدخول' : 'Sign In'}</Link>
              <Link href="/auth/sign-up" className="text-sm font-semibold px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">{isAr ? 'تجربة مجانية' : 'Free Trial'}</Link>
            </div>
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="md:hidden p-2 text-gray-700 dark:text-gray-300">
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        {isMenuOpen && (
          <div className="md:hidden bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800">
            <div className="px-4 py-4 space-y-3">
              {[
                { href: '#modules', label: isAr ? 'الوحدات' : 'Modules' },
                { href: '#multi-currency', label: isAr ? 'تعدد العملات' : 'Multi-Currency' },
                { href: '#security', label: isAr ? 'الأمان' : 'Security' },
                { href: '#pricing', label: isAr ? 'الأسعار' : 'Pricing' },
                { href: '#faq', label: isAr ? 'الأسئلة' : 'FAQ' },
              ].map((i) => (<a key={i.href} href={i.href} onClick={() => setIsMenuOpen(false)} className="block text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600">{i.label}</a>))}
              <div className="pt-3 border-t border-gray-200 dark:border-gray-800 flex flex-col gap-2">
                <Link href="/auth/login" className="text-sm font-medium text-center py-2 rounded-lg border border-gray-300 dark:border-gray-700">{isAr ? 'تسجيل الدخول' : 'Sign In'}</Link>
                <Link href="/auth/sign-up" className="text-sm font-semibold text-center py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white">{isAr ? 'تجربة مجانية' : 'Free Trial'}</Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      <HeroSection appLang={appLang} />

      <section className="py-12 px-4 sm:px-6 lg:px-8 border-y border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {stats.map((s, i) => (
            <div key={i}>
              <div className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">{s.num}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <ERPModulesSection appLang={appLang} />
      <MultiCurrencySection appLang={appLang} />
      <SecuritySection appLang={appLang} />
      <IndustriesSection appLang={appLang} />

      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900 dark:text-white">{isAr ? 'كيف تبدأ؟' : 'How to Start?'}</h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">{isAr ? '٤ خطوات بسيطة للانطلاق' : '4 simple steps to launch'}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {workProcess.map((step) => (
              <div key={step.num} className="relative p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:shadow-xl transition-shadow">
                <div className="absolute -top-4 -start-2 w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-md">{step.num}</div>
                <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-white mb-2">{step.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />{isAr ? 'مستخدم واحد مجانى للأبد' : 'One user free forever'}
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-3 text-gray-900 dark:text-white">{isAr ? 'ابدأ مجاناً، ادفع عند الحاجة' : 'Start Free, Pay Only When You Need'}</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { badge: isAr ? 'مجانى للأبد' : 'Free forever', title: isAr ? 'النسخة المجانية' : 'Free Plan', price: isAr ? 'مجانى' : 'Free', period: isAr ? '/للأبد' : '/forever', note: '', features: [isAr ? 'مستخدم واحد للأبد' : '1 user forever', isAr ? 'جميع ميزات المحاسبة' : 'All accounting features', isAr ? 'إدارة المخزون الكاملة' : 'Full inventory', isAr ? 'تقارير شاملة' : 'Reports', isAr ? 'دعم فنى مجانى' : 'Free support', isAr ? 'بدون حدود زمنية' : 'No time limits'], cta: isAr ? 'ابدأ مجاناً' : 'Start Free', highlight: false },
              { badge: isAr ? 'ادفع عند الحاجة' : 'Pay as you grow', title: isAr ? 'مستخدمين إضافيين' : 'Additional Users', price: '$10', period: isAr ? '/مستخدم/شهر' : '/user/month', note: isAr ? 'يُحاسَب بالجنيه المصرى بسعر الصرف اللحظى عند الدفع عبر Paymob' : 'Billed in EGP at the current exchange rate via Paymob at checkout', features: [isAr ? 'كل مزايا النسخة المجانية' : 'All free features', isAr ? 'صلاحيات متقدمة' : 'Advanced permissions', isAr ? 'إدارة الفرق' : 'Team management', isAr ? 'دعم بأولوية' : 'Priority support', isAr ? 'دفع بالجنيه عبر Paymob' : 'EGP payment via Paymob', isAr ? 'فاتورة ضريبية' : 'Tax-compliant invoice'], cta: isAr ? 'أضف مستخدمين' : 'Add Users', highlight: true },
            ].map((plan, i) => (
              <div key={i} className={`relative p-8 rounded-3xl border-2 ${plan.highlight ? 'border-blue-500 bg-gradient-to-br from-blue-50/50 to-purple-50/50 dark:from-blue-950/30 dark:to-purple-950/30 shadow-xl' : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'}`}>
                <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">{plan.badge}</div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{plan.title}</h3>
                <div className="flex items-baseline mb-2"><span className="text-5xl font-extrabold text-gray-900 dark:text-white">{plan.price}</span><span className="text-gray-500 ms-2">{plan.period}</span></div>
                {plan.note && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">{plan.note}</p>
                )}
                {!plan.note && <div className="mb-6" />}
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, j) => (<li key={j} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"><CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" /><span>{f}</span></li>))}
                </ul>
                <Link href="/auth/sign-up" className={`block w-full text-center py-3 rounded-xl font-semibold transition-all ${plan.highlight ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg' : 'border-2 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white'}`}>{plan.cta}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ✅ v3.64.0 — قسم "Early adopter" بدلاً من شهادات مُختَلَقة */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-white to-blue-50 dark:from-gray-900 dark:to-blue-950/20">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-2 border-amber-200 dark:border-amber-900 p-8 sm:p-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              {isAr ? 'إطلاق 2026' : 'Launching 2026'}
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
              {isAr ? 'كن من أوائل العملاء — مع امتيازات حقيقية' : 'Be one of our first customers — with real perks'}
            </h2>
            <p className="text-lg text-gray-700 dark:text-gray-300 mb-6 leading-relaxed">
              {isAr
                ? 'نحن منصة جديدة وصادقون فى ذلك. لا ندَّعى شهادات وَهْمية ولا نُلصق أرقاماً لم نَحقِّقها. بَدَلاً من ذلك، نُقدِّم للـ 20 شركة الأولى:'
                : "We're new and we're honest about it. We don't fake testimonials or invent numbers. Instead, our first 20 customers get:"}
            </p>
            <ul className="space-y-3 mb-8">
              {[
                isAr ? '🎯 30% خصم دائم على الاشتراك' : '🎯 30% lifetime discount',
                isAr ? '📞 خط دعم مباشر معى شخصياً عبر WhatsApp' : '📞 Direct WhatsApp support line with the founder',
                isAr ? '✏️ تَأثير حقيقى على الميزات القادمة' : '✏️ Real influence on upcoming features',
                isAr ? '🏆 شهادة "Founding Customer" تَظهر هنا (لو وافقت)' : '🏆 "Founding Customer" badge shown here (if you opt-in)',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-gray-800 dark:text-gray-200">
                  <span className="text-xl">{item.split(' ')[0]}</span>
                  <span className="font-medium">{item.split(' ').slice(1).join(' ')}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/auth/sign-up" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white font-bold shadow-lg hover:shadow-xl transition-all">
                {isAr ? 'انضم كأحد الأوائل' : 'Join as a founder'}
                <ArrowRight className="w-5 h-5 rtl:rotate-180" />
              </Link>
              <Link href="/contact" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border-2 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 font-bold hover:bg-amber-100/50 transition-all">
                {isAr ? 'تَحدَّث معى أولاً' : 'Talk to me first'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12"><h2 className="text-3xl sm:text-4xl font-bold mb-3 text-gray-900 dark:text-white">{isAr ? 'الأسئلة الشائعة' : 'Frequently Asked Questions'}</h2></div>
          <div className="space-y-3">{faqs.map((faq, i) => <FAQItem key={i} faq={faq} />)}</div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="relative p-10 sm:p-16 rounded-3xl bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 text-white text-center overflow-hidden shadow-2xl">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-4">{isAr ? 'جاهز لتطوير أعمالك؟' : 'Ready to Grow Your Business?'}</h2>
            <p className="text-lg sm:text-xl mb-8 opacity-90">{isAr ? 'ابدأ مجاناً اليوم - بدون بطاقة ائتمان' : 'Start free today - no credit card required'}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
              <Link href="/auth/sign-up" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white text-blue-600 font-bold shadow-lg">{isAr ? 'تجربة مجانية' : 'Start Free Trial'}<ArrowRight className="w-5 h-5 rtl:rotate-180" /></Link>
              <a href="mailto:info@7esab.com" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border-2 border-white/30 text-white font-bold hover:bg-white/10 transition-colors">{isAr ? 'تحدث مع خبير' : 'Talk to Expert'}</a>
            </div>
            <div className="text-sm opacity-80 flex flex-wrap items-center justify-center gap-3">
              <span>{isAr ? 'للتواصل:' : 'Contact us:'}</span>
              <a href="mailto:info@7esab.com" className="underline hover:text-white font-semibold">info@7esab.com</a>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
        <div className="max-w-7xl mx-auto">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <img src="/icons/icon-64x64.png" alt="7ESAB ERP" width={36} height={36} className="w-9 h-9 rounded-lg object-contain" />
                <span className="font-bold text-gray-900 dark:text-white">7ESAB ERP</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{isAr ? 'منصة ERP احترافية متكاملة.' : 'Professional integrated ERP platform.'}</p>
              <a href="mailto:info@7esab.com" className="inline-block mt-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">info@7esab.com</a>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3">{isAr ? 'المنتج' : 'Product'}</h4>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li><a href="#modules" className="hover:text-blue-600">{isAr ? 'الوحدات' : 'Modules'}</a></li>
                <li><a href="#multi-currency" className="hover:text-blue-600">{isAr ? 'تعدد العملات' : 'Multi-Currency'}</a></li>
                <li><a href="#security" className="hover:text-blue-600">{isAr ? 'الأمان' : 'Security'}</a></li>
                <li><a href="#pricing" className="hover:text-blue-600">{isAr ? 'الأسعار' : 'Pricing'}</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3">{isAr ? 'الدعم' : 'Support'}</h4>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li><a href="#faq" className="hover:text-blue-600">{isAr ? 'الأسئلة الشائعة' : 'FAQ'}</a></li>
                <li><Link href="/contact" className="hover:text-blue-600">{isAr ? 'تواصل معنا' : 'Contact'}</Link></li>
                <li><a href="mailto:info@7esab.com" className="hover:text-blue-600 font-medium text-blue-600 dark:text-blue-400">info@7esab.com</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3">{isAr ? 'قانونى' : 'Legal'}</h4>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li><Link href="/legal/terms" className="hover:text-blue-600">{isAr ? 'شروط الاستخدام' : 'Terms of Service'}</Link></li>
                <li><Link href="/legal/privacy" className="hover:text-blue-600">{isAr ? 'سياسة الخصوصية' : 'Privacy Policy'}</Link></li>
                <li><Link href="/legal/refund" className="hover:text-blue-600">{isAr ? 'سياسة الاسترداد' : 'Refund Policy'}</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-sm text-gray-500">{`© ${new Date().getFullYear()} 7ESAB ERP. ${isAr ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}`}</div>
            {/* v3.64.0 — ادعاءات صادقة فقط. شَهادات لم نَحصُل عليها (مثل التَّدقيق الخارجى) تَم حَذفها. */}
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-900" title={isAr ? 'تَعدُّد عملات وفقاً للمعيار' : ''}>IAS 21</span>
              <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-900">IFRS</span>
              <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-900" title={isAr ? 'قانون حماية البيانات المصرى' : ''}>PDPL</span>
              <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-900">AES-256</span>
              <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-900">RLS</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default ERPWebsite
