"use client"
import React, { useState, useEffect } from 'react'
import {
  ArrowRight, CheckCircle, Menu, X, Sparkles,
  ChevronDown, Star
} from 'lucide-react'
import Link from 'next/link'
import { HeroSection } from '@/components/landing/HeroSection'
import { ERPModulesSection } from '@/components/landing/ERPModulesSection'
import { MultiCurrencySection } from '@/components/landing/MultiCurrencySection'
import { SecuritySection } from '@/components/landing/SecuritySection'
import { IndustriesSection } from '@/components/landing/IndustriesSection'

const ERPWebsite = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const [activeTestimonial, setActiveTestimonial] = useState(0)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % 3)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    try {
      setAppLang(localStorage.getItem('app_language') === 'en' ? 'en' : 'ar')
    } catch { }
  }, [])

  const isAr = appLang === 'ar'

  const stats = [
    { num: '500+', label: isAr ? 'شركة تثق بنا' : 'Companies Trust Us' },
    { num: '99.9%', label: isAr ? 'وقت التشغيل' : 'Uptime' },
    { num: '24/7', label: isAr ? 'دعم فنى' : 'Support' },
    { num: '50K+', label: isAr ? 'معاملة شهرياً' : 'Monthly Transactions' },
  ]

  const testimonials = [
    {
      name: isAr ? 'أحمد محمد' : 'Ahmed Mohamed',
      role: isAr ? 'مدير عام' : 'CEO',
      company: isAr ? 'شركة النور التجارية' : 'Al-Nour Trading',
      text: isAr
        ? 'نظام رائع وفر علينا أكثر من 40% من الوقت فى العمليات اليومية. التقارير التلقائية أحدثت فرقاً كبيراً فى اتخاذ القرارات.'
        : 'Saved us 40% of daily ops time. Automated reports transformed our decision-making.',
    },
    {
      name: isAr ? 'فاطمة على' : 'Fatima Ali',
      role: isAr ? 'مديرة مالية' : 'CFO',
      company: isAr ? 'مؤسسة الأمل' : 'Al-Amal Foundation',
      text: isAr
        ? 'سهولة استثنائية فى الاستخدام مع دقة عالية فى التقارير المالية. الدعم الفنى متميز وسريع الاستجابة.'
        : 'Exceptional ease with high accuracy in financial reports. Tech support is outstanding.',
    },
    {
      name: isAr ? 'محمد سالم' : 'Mohamed Salem',
      role: isAr ? 'صاحب عمل' : 'Business Owner',
      company: isAr ? 'متجر الإلكترونيات' : 'Electronics Store',
      text: isAr
        ? 'أفضل استثمار قمنا به هذا العام. النظام شامل ومتكامل ويغطى كل احتياجاتنا بسعر منافس جداً.'
        : 'Best investment this year. Complete integration covers all our needs at competitive pricing.',
    },
  ]

  const workProcess = [
    { num: 1, title: isAr ? 'التسجيل المجانى' : 'Free Signup', desc: isAr ? 'أنشئ حسابك فى دقائق' : 'Create your account in minutes' },
    { num: 2, title: isAr ? 'إعداد النظام' : 'System Setup', desc: isAr ? 'خصص النظام لاحتياجاتك' : 'Customize the system to your needs' },
    { num: 3, title: isAr ? 'استيراد البيانات' : 'Data Import', desc: isAr ? 'انقل بياناتك بسهولة' : 'Transfer your data easily' },
    { num: 4, title: isAr ? 'ابدأ العمل' : 'Start Working', desc: isAr ? 'إدارة باحتراف' : 'Manage professionally' },
  ]

  const faqs = [
    {
      q: isAr ? 'هل النظام مناسب للشركات الصغيرة والمتوسطة؟' : 'Is the system suitable for SMBs?',
      a: isAr
        ? 'نعم، النظام مصمم لجميع أحجام الشركات، من المؤسسات الفردية إلى الشركات الكبرى متعددة الفروع.'
        : 'Yes, designed for all company sizes — from sole proprietors to large multi-branch enterprises.',
    },
    {
      q: isAr ? 'هل يدعم النظام اللغة العربية بالكامل؟' : 'Does it fully support Arabic?',
      a: isAr
        ? 'نعم، دعم كامل للعربية مع RTL، وكذلك الإنجليزية. التبديل سهل من إعدادات المستخدم.'
        : 'Full Arabic RTL support, plus English. Easy switching from user settings.',
    },
    {
      q: isAr ? 'كيف يتم التعامل مع المعاملات بعملات مختلفة؟' : 'How are multi-currency transactions handled?',
      a: isAr
        ? 'النظام يطبق معيار IAS 21 الكامل: تسجيل تلقائى لفروق العملة عند كل معاملة + إعادة تقييم نهاية الفترة للحسابات بعملة أجنبية.'
        : 'Full IAS 21 compliance: automatic FX gain/loss recording on every transaction + period-end revaluation for FC accounts.',
    },
    {
      q: isAr ? 'هل البيانات آمنة؟' : 'Is data secure?',
      a: isAr
        ? 'نعم، Row-Level Security + عزل multi-tenant + audit trail كامل + period locks. توافق مع IFRS و SOC 2 و GDPR.'
        : 'Yes — RLS + multi-tenant isolation + complete audit trail + period locks. IFRS, SOC 2, GDPR compliant.',
    },
    {
      q: isAr ? 'هل يمكن إدارة عدة شركات؟' : 'Can I manage multiple companies?',
      a: isAr
        ? 'نعم، النظام يدعم تعدد الشركات بشكل كامل مع عزل البيانات بين الشركات وتقارير مجمعة اختيارية.'
        : 'Yes, full multi-company support with data isolation between companies and optional consolidated reports.',
    },
  ]

  const FAQItem = ({ faq, index }: { faq: { q: string; a: string }; index: number }) => {
    const [isOpen, setIsOpen] = useState(false)
    return (
      <div className="border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden bg-white dark:bg-gray-900">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between p-5 text-start hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <span className="font-semibold text-gray-900 dark:text-white">{faq.q}</span>
          <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform flex-shrink-0 ms-3 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="px-5 pb-5 text-gray-600 dark:text-gray-300 leading-relaxed border-t border-gray-100 dark:border-gray-800 pt-4">
            {faq.a}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-blue-950 text-gray-900 dark:text-white" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrollY > 20 ? 'bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                7E
              </div>
              <span className="text-lg font-bold text-gray-900 dark:text-white">7ESAB <span className="text-xs text-blue-600">ERP</span></span>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#modules" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 transition-colors">{isAr ? 'الوحدات' : 'Modules'}</a>
              <a href="#multi-currency" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 transition-colors">{isAr ? 'تعدد العملات' : 'Multi-Currency'}</a>
              <a href="#security" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 transition-colors">{isAr ? 'الأمان' : 'Security'}</a>
              <a href="#pricing" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 transition-colors">{isAr ? 'الأسعار' : 'Pricing'}</a>
              <a href="#faq" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 transition-colors">{isAr ? 'الأسئلة الشائعة' : 'FAQ'}</a>
              <button
                onClick={() => {
                  const next = isAr ? 'en' : 'ar'
                  setAppLang(next)
                  try { localStorage.setItem('app_language', next) } catch { }
                }}
                className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors"
              >
                {isAr ? 'EN' : 'عربى'}
              </button>
              <Link href="/auth/login" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 transition-colors">
                {isAr ? 'تسجيل الدخول' : 'Sign In'}
              </Link>
              <Link href="/auth/sign-up" className="text-sm font-semibold px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
                {isAr ? 'تجربة مجانية' : 'Free Trial'}
              </Link>
            </div>

            {/* Mobile menu button */}
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="md:hidden p-2 text-gray-700 dark:text-gray-300">
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800">
            <div className="px-4 py-4 space-y-3">
              {[
                { href: '#modules', label: isAr ? 'الوحدات' : 'Modules' },
                { href: '#multi-currency', label: isAr ? 'تعدد العملات' : 'Multi-Currency' },
                { href: '#security', label: isAr ? 'الأمان' : 'Security' },
                { href: '#pricing', label: isAr ? 'الأسعار' : 'Pricing' },
                { href: '#faq', label: isAr ? 'الأسئلة الشائعة' : 'FAQ' },
              ].map((item) => (
                <a key={item.href} href={item.href} onClick={() => setIsMenuOpen(false)} className="block text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600">
                  {item.label}
                </a>
              ))}
              <div className="pt-3 border-t border-gray-200 dark:border-gray-800 flex flex-col gap-2">
                <Link href="/auth/login" className="text-sm font-medium text-center py-2 rounded-lg border border-gray-300 dark:border-gray-700">
                  {isAr ? 'تسجيل الدخول' : 'Sign In'}
                </Link>
                <Link href="/auth/sign-up" className="text-sm font-semibold text-center py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white">
                  {isAr ? 'تجربة مجانية' : 'Free Trial'}
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <HeroSection appLang={appLang} />

      {/* Stats Bar */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 border-y border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {stats.map((s, i) => (
            <div key={i}>
              <div className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                {s.num}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ERP Modules */}
      <ERPModulesSection appLang={appLang} />

      {/* Multi-Currency Highlight */}
      <MultiCurrencySection appLang={appLang} />

      {/* Enterprise Security */}
      <SecuritySection appLang={appLang} />

      {/* Industries Served */}
      <IndustriesSection appLang={appLang} />

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900 dark:text-white">{isAr ? 'كيف تبدأ؟' : 'How to Start?'}</h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">{isAr ? '٤ خطوات بسيطة للانطلاق' : '4 simple steps to launch'}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {workProcess.map((step) => (
              <div key={step.num} className="relative p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:shadow-xl transition-shadow">
                <div className="absolute -top-4 -start-2 w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
                  {step.num}
                </div>
                <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-white mb-2">{step.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              {isAr ? 'مستخدم واحد مجانى للأبد' : 'One user free forever'}
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-3 text-gray-900 dark:text-white">{isAr ? 'ابدأ مجاناً، ادفع عند الحاجة' : 'Start Free, Pay Only When You Need'}</h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">{isAr ? 'مستخدم واحد مجاناً، إضافيين بـ $10 شهرياً' : 'First user free, additional users at $10/month'}</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                badge: isAr ? 'مجانى للأبد' : 'Free forever',
                title: isAr ? 'النسخة المجانية' : 'Free Plan',
                price: '$0',
                period: isAr ? '/شهر' : '/month',
                features: [
                  isAr ? 'مستخدم واحد مجانى' : '1 user free',
                  isAr ? 'جميع ميزات المحاسبة' : 'All accounting features',
                  isAr ? 'إدارة المخزون الكاملة' : 'Full inventory management',
                  isAr ? 'تقارير شاملة' : 'Comprehensive reports',
                  isAr ? 'دعم فنى مجانى' : 'Free tech support',
                  isAr ? 'بدون حدود زمنية' : 'No time limits',
                ],
                cta: isAr ? 'ابدأ مجاناً' : 'Start Free',
                highlight: false,
              },
              {
                badge: isAr ? 'ادفع عند الحاجة' : 'Pay as you grow',
                title: isAr ? 'مستخدمين إضافيين' : 'Additional Users',
                price: '$10',
                period: isAr ? '/مستخدم/شهر' : '/user/month',
                features: [
                  isAr ? 'كل مزايا النسخة المجانية' : 'All free features',
                  isAr ? 'صلاحيات متقدمة' : 'Advanced permissions',
                  isAr ? 'إدارة الفرق' : 'Team management',
                  isAr ? 'دعم أولوية' : 'Priority support',
                  isAr ? 'تكامل API' : 'API integrations',
                  isAr ? 'تقارير مخصصة' : 'Custom reports',
                ],
                cta: isAr ? 'أضف مستخدمين' : 'Add Users',
                highlight: true,
              },
            ].map((plan, i) => (
              <div key={i} className={`relative p-8 rounded-3xl border-2 ${plan.highlight ? 'border-blue-500 bg-gradient-to-br from-blue-50/50 to-purple-50/50 dark:from-blue-950/30 dark:to-purple-950/30 shadow-xl' : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'}`}>
                <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">{plan.badge}</div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{plan.title}</h3>
                <div className="flex items-baseline mb-6">
                  <span className="text-5xl font-extrabold text-gray-900 dark:text-white">{plan.price}</span>
                  <span className="text-gray-500 ms-2">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/auth/sign-up" className={`block w-full text-center py-3 rounded-xl font-semibold transition-all ${plan.highlight ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg hover:shadow-xl' : 'border-2 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white hover:border-blue-500'}`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-white to-blue-50 dark:from-gray-900 dark:to-blue-950/20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3 text-gray-900 dark:text-white">{isAr ? 'ماذا يقول عملاؤنا' : 'What Our Customers Say'}</h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">{isAr ? 'قصص نجاح حقيقية' : 'Real success stories'}</p>
          </div>
          <div className="relative">
            <div className="p-8 sm:p-12 rounded-3xl bg-white dark:bg-gray-900 shadow-xl border border-gray-200 dark:border-gray-800">
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-lg sm:text-xl text-gray-700 dark:text-gray-300 leading-relaxed mb-6">
                "{testimonials[activeTestimonial].text}"
              </p>
              <div>
                <div className="font-bold text-gray-900 dark:text-white">{testimonials[activeTestimonial].name}</div>
                <div className="text-sm text-gray-500">{testimonials[activeTestimonial].role} — {testimonials[activeTestimonial].company}</div>
              </div>
            </div>
            <div className="flex justify-center gap-2 mt-6">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveTestimonial(i)}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${i === activeTestimonial ? 'bg-blue-600 w-8' : 'bg-gray-300 dark:bg-gray-700'}`}
                  aria-label={`Testimonial ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3 text-gray-900 dark:text-white">{isAr ? 'الأسئلة الشائعة' : 'Frequently Asked Questions'}</h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">{isAr ? 'كل ما تحتاج معرفته قبل البدء' : 'Everything you need to know before starting'}</p>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => <FAQItem key={i} faq={faq} index={i} />)}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="relative p-10 sm:p-16 rounded-3xl bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 text-white text-center overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%23ffffff%22 fill-opacity=%220.05%22%3E%3Cpath d=%22M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-30" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-4">{isAr ? 'جاهز لتطوير أعمالك؟' : 'Ready to Grow Your Business?'}</h2>
              <p className="text-lg sm:text-xl mb-8 opacity-90">{isAr ? 'ابدأ مجاناً اليوم — بدون بطاقة ائتمان' : 'Start free today — no credit card required'}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/auth/sign-up" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white text-blue-600 font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">
                  {isAr ? 'تجربة مجانية' : 'Start Free Trial'}
                  <ArrowRight className="w-5 h-5 rtl:rotate-180" />
                </Link>
                <Link href="/auth/login" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border-2 border-white/30 text-white font-bold hover:bg-white/10 transition-colors">
                  {isAr ? 'تحدث مع خبير' : 'Talk to Expert'}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
        <div className="max-w-7xl mx-auto">
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm">7E</div>
                <span className="font-bold text-gray-900 dark:text-white">7ESAB ERP</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isAr ? 'منصة ERP احترافية متكاملة تدعم تعدد الشركات والعملات وفقاً لأعلى المعايير الدولية.' : 'Professional integrated ERP platform with multi-company & multi-currency support per international standards.'}
              </p>
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
                <li><a href="#" className="hover:text-blue-600">{isAr ? 'تواصل معنا' : 'Contact'}</a></li>
                <li><a href="#" className="hover:text-blue-600">{isAr ? 'التدريب' : 'Training'}</a></li>
                <li><a href="#" className="hover:text-blue-600">API</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3">{isAr ? 'الشركة' : 'Company'}</h4>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li><a href="#" className="hover:text-blue-600">{isAr ? 'من نحن' : 'About'}</a></li>
                <li><a href="#" className="hover:text-blue-600">{isAr ? 'المدونة' : 'Blog'}</a></li>
                <li><a href="#" className="hover:text-blue-600">{isAr ? 'الشراكات' : 'Partners'}</a></li>
                <li><a href="#" className="hover:text-blue-600">{isAr ? 'الوظائف' : 'Careers'}</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-sm text-gray-500">© {new Date().getFullYear()} 7ESAB ERP. {isAr ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}</div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-900">IAS 21</span>
              <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-900">IFRS</span>
              <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-900">SOC 2</span>
              <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-900">GDPR</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default ERPWebsite
