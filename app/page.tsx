"use client"
import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, CheckCircle, Users, BarChart3, Shield, Zap, 
  TrendingUp, Clock, Award, Star, Menu, X, Database,
  FileText, ShoppingCart, DollarSign, Package, PieChart,
  ChevronDown, Play, Home
} from 'lucide-react';
import Link from 'next/link';

const ERPWebsite = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const [currentPage, setCurrentPage] = useState('home');

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTestimonial((prev) => (prev + 1) % 3);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const navigateToPage = (page) => {
    setCurrentPage(page);
    setIsMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToSection = (section) => {
    setIsMenuOpen(false);
    if (currentPage !== 'home') {
      setCurrentPage('home');
      setTimeout(() => {
        const element = document.getElementById(section);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);
    } else {
      const element = document.getElementById(section);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  useEffect(() => {
    if (currentPage === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentPage]);

  const features = [
    { 
      icon: <DollarSign className="w-8 h-8" />, 
      title: 'محاسبة احترافية',
      desc: 'نظام محاسبي متكامل مع القيود التلقائية والتقارير المالية',
      gradient: 'from-blue-500 to-cyan-500'
    },
    { 
      icon: <Package className="w-8 h-8" />, 
      title: 'إدارة المخزون',
      desc: 'تتبع المخزون في الوقت الفعلي مع تنبيهات ذكية',
      gradient: 'from-purple-500 to-pink-500'
    },
    { 
      icon: <FileText className="w-8 h-8" />, 
      title: 'الفواتير والتقارير',
      desc: 'إنشاء فواتير احترافية وتقارير تحليلية شاملة',
      gradient: 'from-orange-500 to-red-500'
    },
    { 
      icon: <Users className="w-8 h-8" />, 
      title: 'إدارة العملاء',
      desc: 'قاعدة بيانات متكاملة للعملاء والموردين',
      gradient: 'from-green-500 to-emerald-500'
    },
    { 
      icon: <PieChart className="w-8 h-8" />, 
      title: 'تحليلات متقدمة',
      desc: 'رؤى عميقة وذكاء اصطناعي لدعم القرارات',
      gradient: 'from-indigo-500 to-purple-500'
    },
    { 
      icon: <Shield className="w-8 h-8" />, 
      title: 'أمان عالي المستوى',
      desc: 'تشفير متقدم وصلاحيات محكمة لحماية بياناتك',
      gradient: 'from-red-500 to-pink-500'
    },
  ];

  const testimonials = [
    { name: 'أحمد محمد', role: 'مدير عام', company: 'شركة النور التجارية', text: 'نظام رائع وفر علينا أكثر من 40% من الوقت في العمليات اليومية. التقارير التلقائية أحدثت فرقاً كبيراً في اتخاذ القرارات.' },
    { name: 'فاطمة علي', role: 'مديرة مالية', company: 'مؤسسة الأمل', text: 'سهولة استثنائية في الاستخدام مع دقة عالية في التقارير المالية. الدعم الفني متميز وسريع الاستجابة.' },
    { name: 'محمد سالم', role: 'صاحب عمل', company: 'متجر الإلكترونيات', text: 'أفضل استثمار قمنا به هذا العام. النظام شامل ومتكامل ويغطي كل احتياجاتنا بسعر منافس جداً.' },
  ];

  const stats = [
    { num: '500+', label: 'شركة تثق بنا' },
    { num: '99.9%', label: 'وقت التشغيل' },
    { num: '24/7', label: 'دعم فني' },
    { num: '50K+', label: 'معاملة شهرياً' },
  ];

  const workProcess = [
    { step: '1', title: 'التسجيل المجاني', desc: 'أنشئ حسابك في دقائق بدون بطاقة ائتمان' },
    { step: '2', title: 'إعداد النظام', desc: 'قم بتخصيص النظام حسب احتياجات عملك' },
    { step: '3', title: 'استيراد البيانات', desc: 'انقل بياناتك بسهولة من أي نظام آخر' },
    { step: '4', title: 'ابدأ العمل', desc: 'ابدأ بإدارة عملك بكفاءة واحترافية' },
  ];

  const faqs = [
    {
      q: 'هل النسخة المجانية محدودة الوقت؟',
      a: 'لا، النسخة المجانية لمستخدم واحد مجانية إلى الأبد بدون أي حدود زمنية. يمكنك استخدام جميع الميزات الأساسية مجاناً دائماً.'
    },
    {
      q: 'كم يكلف إضافة مستخدمين إضافيين؟',
      a: 'كل مستخدم إضافي يكلف 5 دولار شهرياً فقط. المستخدم الأول دائماً مجاني، وتدفع فقط مقابل المستخدمين الإضافيين الذين تحتاجهم.'
    },
    {
      q: 'هل يمكنني استيراد بياناتي من نظام آخر؟',
      a: 'نعم، نوفر أدوات استيراد سهلة لنقل بياناتك من Excel أو أي نظام آخر. كما يتوفر فريق الدعم الفني لمساعدتك في عملية الانتقال.'
    },
    {
      q: 'هل البيانات آمنة ومحمية؟',
      a: 'نعم، نستخدم تشفير SSL 256-bit، نسخ احتياطي يومي تلقائي، وخوادم آمنة. بياناتك محمية بأعلى معايير الأمان العالمية.'
    },
    {
      q: 'هل يدعم النظام اللغة العربية بالكامل؟',
      a: 'نعم، النظام مصمم خصيصاً للشركات العربية. الواجهة، التقارير، والفواتير كلها باللغة العربية مع دعم كامل للتاريخ الهجري.'
    },
    {
      q: 'هل يمكنني إلغاء الاشتراك في أي وقت؟',
      a: 'نعم، يمكنك إلغاء الاشتراك في أي وقت بدون أي رسوم أو التزامات. النسخة المجانية تبقى متاحة لك دائماً.'
    },
    {
      q: 'ما هي طرق الدفع المتاحة؟',
      a: 'نقبل جميع البطاقات الائتمانية الرئيسية (Visa, Mastercard, American Express) والدفع الإلكتروني عبر PayPal وطرق دفع محلية أخرى.'
    },
    {
      q: 'هل يتوفر دعم فني؟',
      a: 'نعم، نوفر دعم فني مجاني 24/7 عبر البريد الإلكتروني والشات المباشر. العملاء المدفوعين يحصلون على دعم أولوية مع استجابة أسرع.'
    },
    {
      q: 'هل يمكن تخصيص النظام حسب احتياجاتي؟',
      a: 'نعم، النظام قابل للتخصيص بشكل كامل. يمكنك تخصيص الحقول، التقارير، والصلاحيات حسب احتياجات عملك الخاصة.'
    },
    {
      q: 'هل يدعم النظام عدة فروع أو شركات؟',
      a: 'نعم، يمكنك إدارة عدة فروع أو شركات من نفس الحساب مع إمكانية الفصل الكامل بين البيانات أو دمجها حسب الحاجة.'
    },
    {
      q: 'ما هي متطلبات تشغيل النظام؟',
      a: 'النظام يعمل عبر المتصفح فقط، لا يحتاج أي تثبيت. كل ما تحتاجه هو اتصال بالإنترنت ومتصفح حديث. يعمل على جميع الأجهزة.'
    },
    {
      q: 'هل تتوفر نسخة تجريبية؟',
      a: 'نعم، يمكنك البدء بتجربة مجانية لمدة 30 يوم تشمل جميع الميزات المتقدمة. بعدها يمكنك الاستمرار بالنسخة المجانية أو الترقية.'
    }
  ];

  // FAQ Item Component
  const FAQItem = ({ faq, index }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden hover:bg-white/10 transition-all">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-6 py-5 flex items-center justify-between text-right"
        >
          <span className="font-bold text-lg">{faq.q}</span>
          <ChevronDown className={`w-6 h-6 transition-transform flex-shrink-0 mr-4 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96' : 'max-h-0'}`}>
          <div className="px-6 pb-5 text-gray-400 leading-relaxed">
            {faq.a}
          </div>
        </div>
      </div>
    );
  };
  // FAQ Page Component
  const FAQPage = () => (
    <div className="min-h-screen pt-24 pb-20">
      {/* Hero Section */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-block mb-6">
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-sm">
              <Database className="w-4 h-4 text-blue-400" />
              <span>مركز المساعدة</span>
            </div>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            <span className="block mb-2">الأسئلة</span>
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              الشائعة
            </span>
          </h1>
          <p className="text-xl text-gray-400 leading-relaxed">
            إجابات على أكثر الأسئلة شيوعاً حول نظام 7ESAB ERP
          </p>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-4 mb-12">
            {faqs.map((faq, idx) => (
              <FAQItem key={idx} faq={faq} index={idx} />
            ))}
          </div>

          {/* Contact Card */}
          <div className="mt-16 text-center p-10 bg-gradient-to-br from-blue-500/20 to-purple-500/20 backdrop-blur-sm border border-blue-500/30 rounded-3xl">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
              <Users className="w-10 h-10" />
            </div>
            <h3 className="text-3xl font-bold mb-3">لم تجد إجابة لسؤالك؟</h3>
            <p className="text-gray-300 text-lg mb-6">فريق الدعم جاهز لمساعدتك في أي وقت</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button className="px-8 py-4 bg-white text-blue-900 rounded-xl font-bold hover:bg-gray-100 transition-all shadow-xl">
                تواصل معنا عبر البريد
              </button>
              <button className="px-8 py-4 bg-blue-600 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-xl">
                الشات المباشر
              </button>
            </div>
          </div>

          {/* Additional Resources */}
          <div className="mt-16 grid md:grid-cols-3 gap-6">
            <div className="p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl hover:bg-white/10 transition-all text-center">
              <FileText className="w-10 h-10 text-blue-400 mx-auto mb-4" />
              <h4 className="font-bold mb-2">دليل المستخدم</h4>
              <p className="text-sm text-gray-400 mb-4">شرح شامل لجميع ميزات النظام</p>
              <button className="text-blue-400 hover:text-blue-300 text-sm font-bold">
                عرض الدليل ←
              </button>
            </div>
            <div className="p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl hover:bg-white/10 transition-all text-center">
              <Play className="w-10 h-10 text-purple-400 mx-auto mb-4" />
              <h4 className="font-bold mb-2">فيديوهات تعليمية</h4>
              <p className="text-sm text-gray-400 mb-4">شروحات مرئية خطوة بخطوة</p>
              <button className="text-purple-400 hover:text-purple-300 text-sm font-bold">
                شاهد الآن ←
              </button>
            </div>
            <div className="p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl hover:bg-white/10 transition-all text-center">
              <Award className="w-10 h-10 text-pink-400 mx-auto mb-4" />
              <h4 className="font-bold mb-2">التدريب المباشر</h4>
              <p className="text-sm text-gray-400 mb-4">احجز جلسة تدريب مع خبرائنا</p>
              <button className="text-pink-400 hover:text-pink-300 text-sm font-bold">
                احجز الآن ←
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
  // Home Page Component
  const HomePage = () => (
    <>
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center space-y-8">
            <div className="inline-block">
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-sm">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span>نظام ERP احترافي - جاهز للإنتاج</span>
              </div>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              <span className="block mb-2">نظام إدارة الأعمال</span>
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                الأكثر تطوراً
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
              حل شامل لإدارة المحاسبة والمخزون والمبيعات مع تقارير متقدمة وأمان عالي.
              <span className="block mt-2 text-blue-400">مصمم خصيصاً للشركات العربية بمعايير عالمية</span>
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/auth/sign-up" className="group px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl font-bold text-lg shadow-2xl hover:shadow-blue-500/50 transition-all transform hover:-translate-y-1 flex items-center gap-2">
                ابدأ تجربتك المجانية
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" style={{ transform: 'scaleX(-1)' }} />
              </Link>
              <button className="group px-8 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl font-bold text-lg hover:bg-white/20 transition-all flex items-center gap-2">
                <Play className="w-5 h-5" />
                شاهد العرض التوضيحي
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-16 max-w-4xl mx-auto">
              {stats.map((stat, idx) => (
                <div key={idx} className="p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl hover:bg-white/10 transition-all transform hover:-translate-y-1">
                  <div className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
                    {stat.num}
                  </div>
                  <div className="text-gray-400 text-sm">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              ميزات متقدمة لإدارة أعمالك
            </h2>
            <p className="text-xl text-gray-400">كل ما تحتاجه لإدارة شركتك بكفاءة عالية</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <div 
                key={idx}
                className="group p-8 bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl hover:bg-white/10 transition-all transform hover:-translate-y-2 hover:shadow-2xl"
              >
                <div className={`w-16 h-16 bg-gradient-to-br ${feature.gradient} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-lg`}>
                  {feature.icon}
                </div>
                <h3 className="text-2xl font-bold mb-3">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">كيف تبدأ؟</h2>
            <p className="text-xl text-gray-400">أربع خطوات بسيطة للانطلاق</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {workProcess.map((process, idx) => (
              <div key={idx} className="relative text-center">
                <div className="mb-6">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto text-3xl font-bold shadow-lg">
                    {process.step}
                  </div>
                </div>
                <h3 className="text-xl font-bold mb-3">{process.title}</h3>
                <p className="text-gray-400">{process.desc}</p>
                {idx < workProcess.length - 1 && (
                  <div className="hidden lg:block absolute top-10 left-full w-full h-0.5 bg-gradient-to-r from-blue-600 to-purple-600" style={{ width: 'calc(100% - 5rem)' }}></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-block px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full text-sm text-green-400 mb-4">
              مستخدم واحد مجاني إلى الأبد
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              ابدأ مجاناً، ادفع عند الحاجة فقط
            </h2>
            <p className="text-xl text-gray-400">مستخدم واحد مجاني إلى الأبد، مستخدمين إضافيين بـ $5 شهرياً</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-16">
            {/* Free Plan */}
            <div className="relative p-8 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm border-2 border-green-500/50 rounded-3xl hover:border-green-500 transition-all transform hover:-translate-y-2 shadow-xl">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 px-4 py-1 bg-green-500 rounded-full text-sm font-bold">
                مجاني إلى الأبد
              </div>
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold mb-2">النسخة المجانية</h3>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-6xl font-bold">$0</span>
                  <span className="text-gray-400">/شهر</span>
                </div>
                <p className="text-sm text-gray-400 mt-2">مستخدم واحد مجاناً</p>
              </div>
              <ul className="space-y-4 mb-8">
                {['مستخدم واحد مجاني', 'جميع ميزات المحاسبة', 'إدارة المخزون الكاملة', 'تقارير شاملة', 'دعم فني مجاني', 'بدون حدود زمنية'].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href="/auth/sign-up" className="block w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl font-bold hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg text-center">
                ابدأ مجاناً الآن
              </Link>
              <p className="text-center text-sm text-gray-400 mt-4">لا تحتاج بطاقة ائتمان</p>
            </div>

            {/* Paid Plan */}
            <div className="relative p-8 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm border-2 border-blue-500/50 rounded-3xl hover:border-blue-500 transition-all transform hover:-translate-y-2 shadow-xl">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 px-4 py-1 bg-blue-500 rounded-full text-sm font-bold">
                ادفع عند الحاجة
              </div>
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold mb-2">مستخدمين إضافيين</h3>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-6xl font-bold">$5</span>
                  <span className="text-gray-400">/مستخدم/شهر</span>
                </div>
                <p className="text-sm text-gray-400 mt-2">لكل مستخدم إضافي</p>
              </div>
              <ul className="space-y-4 mb-8">
                {['المستخدم الأول مجاني', '$5 لكل مستخدم إضافي', 'جميع الميزات لكل مستخدم', 'صلاحيات متقدمة', 'إدارة الفرق', 'دعم أولوية'].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <button className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl font-bold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg">
                أضف مستخدمين
              </button>
              <p className="text-center text-sm text-gray-400 mt-4">ادفع فقط عند الحاجة</p>
            </div>
          </div>

          {/* Pricing Examples */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8">
            <h3 className="text-2xl font-bold mb-8 text-center">أمثلة على التكلفة الشهرية</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { users: 'مستخدم واحد', cost: '$0' },
                { users: 'مستخدمين (1+1)', cost: '$5' },
                { users: '4 مستخدمين (1+3)', cost: '$15' },
                { users: '10 مستخدمين (1+9)', cost: '$45' }
              ].map((example, idx) => (
                <div key={idx} className="text-center p-6 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-all">
                  <div className="text-3xl font-bold text-blue-400 mb-2">{example.cost}</div>
                  <div className="text-sm text-gray-400">{example.users}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">ماذا يقول عملاؤنا</h2>
            <p className="text-xl text-gray-400">قصص نجاح حقيقية من عملائنا</p>
          </div>

          <div className="relative">
            {testimonials.map((testimonial, idx) => (
              <div
                key={idx}
                className={`transition-all duration-500 ${idx === activeTestimonial ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
              >
                <div className="p-8 md:p-12 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm border border-white/10 rounded-3xl">
                  <div className="flex gap-1 mb-6 justify-center">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-6 h-6 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-xl md:text-2xl text-center mb-8 leading-relaxed text-gray-200">
                    "{testimonial.text}"
                  </p>
                  <div className="text-center">
                    <div className="font-bold text-lg mb-1">{testimonial.name}</div>
                    <div className="text-blue-400 text-sm mb-1">{testimonial.role}</div>
                    <div className="text-gray-400 text-sm">{testimonial.company}</div>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex justify-center gap-2 mt-6">
              {testimonials.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveTestimonial(idx)}
                  className={`w-3 h-3 rounded-full transition-all ${idx === activeTestimonial ? 'bg-blue-500 w-8' : 'bg-gray-600'}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-5xl mx-auto">
          <div className="relative p-12 md:p-16 bg-gradient-to-br from-blue-600/20 to-purple-600/20 backdrop-blur-sm border border-blue-500/30 rounded-3xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-purple-600/10"></div>
            <div className="relative text-center space-y-6">
              <h2 className="text-4xl md:text-5xl font-bold">جاهز لتطوير أعمالك؟</h2>
              <p className="text-xl text-gray-300">ابدأ تجربتك المجانية اليوم ولا تحتاج لبطاقة ائتمان</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/auth/sign-up" className="px-8 py-4 bg-white text-blue-900 rounded-xl font-bold text-lg hover:bg-gray-100 transition-all shadow-xl">
                  تجربة مجانية لمدة 30 يوم
                </Link>
                <Link href="/auth/login" className="px-8 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl font-bold text-lg hover:bg-white/20 transition-all">
                  تحدث مع خبير
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 text-white overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Header */}
      <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrollY > 50 ? 'bg-slate-900/95 backdrop-blur-lg shadow-lg' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <button onClick={() => navigateToPage('home')} className="flex items-center gap-4">
              <img src="/icons/icon-64x64.png" alt="7ESAB ERP" className="w-12 h-12 rounded-xl shadow-lg" />
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">7ESAB</h1>
                <p className="text-xs text-gray-400">ERP System</p>
              </div>
            </button>
            
            <nav className="hidden md:flex items-center space-x-8 space-x-reverse">
              <button onClick={() => navigateToPage('home')} className="hover:text-blue-400 transition-colors">الرئيسية</button>
              <button onClick={() => navigateToSection('features')} className="hover:text-blue-400 transition-colors">الميزات</button>
              <button onClick={() => navigateToSection('pricing')} className="hover:text-blue-400 transition-colors">الأسعار</button>
              <button onClick={() => navigateToSection('testimonials')} className="hover:text-blue-400 transition-colors">العملاء</button>
              <button onClick={() => navigateToPage('faq')} className="hover:text-blue-400 transition-colors">الأسئلة الشائعة</button>
              <Link href="/auth/login" className="px-4 py-2 text-blue-400 hover:text-blue-300 transition-colors">تسجيل الدخول</Link>
              <Link href="/auth/sign-up" className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                تجربة مجانية
              </Link>
            </nav>

            <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-slate-900/95 backdrop-blur-lg border-t border-slate-800">
            <div className="px-4 py-4 space-y-3">
              <button onClick={() => navigateToPage('home')} className="block w-full text-right py-2 hover:text-blue-400">الرئيسية</button>
              <button onClick={() => navigateToSection('features')} className="block w-full text-right py-2 hover:text-blue-400">الميزات</button>
              <button onClick={() => navigateToSection('pricing')} className="block w-full text-right py-2 hover:text-blue-400">الأسعار</button>
              <button onClick={() => navigateToSection('testimonials')} className="block w-full text-right py-2 hover:text-blue-400">العملاء</button>
              <button onClick={() => navigateToPage('faq')} className="block w-full text-right py-2 hover:text-blue-400">الأسئلة الشائعة</button>
              <Link href="/auth/login" className="block py-2 text-blue-400">تسجيل الدخول</Link>
              <Link href="/auth/sign-up" className="block w-full py-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg text-center">
                تجربة مجانية
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Page Content */}
      <div className="relative">
        {currentPage === 'home' ? <HomePage /> : <FAQPage />}
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img src="/icons/icon-64x64.png" alt="7ESAB ERP" className="w-10 h-10 rounded-lg" />
                <span className="text-xl font-bold">7ESAB ERP</span>
              </div>
              <p className="text-gray-400 text-sm">نظام إدارة الأعمال الأكثر تطوراً للشركات العربية</p>
            </div>
            <div>
              <h4 className="font-bold mb-4">المنتج</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><button onClick={() => navigateToSection('features')} className="hover:text-white transition-colors">الميزات</button></li>
                <li><button onClick={() => navigateToSection('pricing')} className="hover:text-white transition-colors">الأسعار</button></li>
                <li><a href="#" className="hover:text-white transition-colors">الأمان</a></li>
                <li><a href="#" className="hover:text-white transition-colors">التحديثات</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">الدعم</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><button onClick={() => navigateToPage('faq')} className="hover:text-white transition-colors">الأسئلة الشائعة</button></li>
                <li><a href="#" className="hover:text-white transition-colors">تواصل معنا</a></li>
                <li><a href="#" className="hover:text-white transition-colors">التدريب</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">الشركة</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">من نحن</a></li>
                <li><a href="#" className="hover:text-white transition-colors">المدونة</a></li>
                <li><a href="#" className="hover:text-white transition-colors">الوظائف</a></li>
                <li><a href="#" className="hover:text-white transition-colors">الشركاء</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 text-center text-gray-400 text-sm">
            <p>© 2024 7ESAB ERP. جميع الحقوق محفوظة.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default ERPWebsite;