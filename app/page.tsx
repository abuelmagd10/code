"use client"
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, ArrowRight, Play, Star, Users, Shield, BarChart3, Package, Calculator, FileText, Zap, Globe } from 'lucide-react'
import Link from 'next/link'

export default function LandingPage() {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)

  const features = [
    { icon: Calculator, title: 'محاسبة احترافية', desc: 'نظام محاسبي متكامل مع القيود التلقائية' },
    { icon: Package, title: 'إدارة المخزون', desc: 'تتبع المخزون والحركات بدقة عالية' },
    { icon: FileText, title: 'الفواتير والتقارير', desc: 'إنشاء فواتير احترافية وتقارير مفصلة' },
    { icon: Users, title: 'إدارة العملاء', desc: 'قاعدة بيانات شاملة للعملاء والموردين' },
    { icon: BarChart3, title: 'تحليلات متقدمة', desc: 'رؤى عميقة لأداء الأعمال' },
    { icon: Shield, title: 'أمان عالي', desc: 'حماية البيانات وصلاحيات محكمة' }
  ]

  const testimonials = [
    { name: 'أحمد محمد', company: 'شركة النور التجارية', text: 'نظام رائع وفر علينا الكثير من الوقت والجهد' },
    { name: 'فاطمة علي', company: 'مؤسسة الأمل', text: 'سهولة في الاستخدام وتقارير دقيقة' },
    { name: 'محمد سالم', company: 'متجر الإلكترونيات', text: 'أفضل نظام ERP استخدمته على الإطلاق' }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-3">
              <img src="/icons/icon-64x64.png" alt="7ESAB ERP" className="w-10 h-10" />
              <span className="text-2xl font-bold text-gray-900">7ESAB ERP</span>
            </div>
            <nav className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-600 hover:text-blue-600">الميزات</a>
              <a href="#pricing" className="text-gray-600 hover:text-blue-600">الأسعار</a>
              <a href="#support" className="text-gray-600 hover:text-blue-600">الدعم</a>
              <Button asChild variant="outline">
                <Link href="/auth/login">تسجيل الدخول</Link>
              </Button>
              <Button asChild>
                <Link href="/auth/sign-up">تجربة مجانية</Link>
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <Badge className="mb-6 bg-blue-100 text-blue-800 border-blue-200">
            <Zap className="w-4 h-4 mr-2" />
            نظام ERP احترافي - جاهز للإنتاج
          </Badge>
          
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            نظام إدارة الأعمال
            <span className="text-blue-600 block">الأكثر تطوراً</span>
          </h1>
          
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            حل شامل لإدارة المحاسبة والمخزون والمبيعات مع تقارير متقدمة وأمان عالي. 
            مصمم خصيصاً للشركات العربية بمعايير عالمية.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-lg px-8 py-4">
              <Link href="/auth/sign-up">
                ابدأ تجربتك المجانية
                <ArrowRight className="w-5 h-5 mr-2" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 py-4" onClick={() => setIsVideoPlaying(true)}>
              <Play className="w-5 h-5 ml-2" />
              شاهد العرض التوضيحي
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">500+</div>
              <div className="text-gray-600">شركة تثق بنا</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">99.9%</div>
              <div className="text-gray-600">وقت التشغيل</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">24/7</div>
              <div className="text-gray-600">دعم فني</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">ميزات متقدمة لإدارة أعمالك</h2>
            <p className="text-xl text-gray-600">كل ما تحتاجه لإدارة شركتك بكفاءة عالية</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="p-6 hover:shadow-lg transition-shadow">
                <CardContent className="p-0">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-blue-100 rounded-lg">
                      <feature.icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-semibold">{feature.title}</h3>
                  </div>
                  <p className="text-gray-600">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">ابدأ مجاناً، ادفع عند الحاجة فقط</h2>
            <p className="text-xl text-gray-600">مستخدم واحد مجاني إلى الأبد، مستخدمين إضافيين بـ $5 شهرياً</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Plan */}
            <Card className="p-8 border-2 border-green-500 relative">
              <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-500">مجاني إلى الأبد</Badge>
              <CardContent className="p-0">
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold mb-2">النسخة المجانية</h3>
                  <div className="text-5xl font-bold text-green-600 mb-2">$0<span className="text-lg text-gray-500">/شهر</span></div>
                  <p className="text-gray-600">مستخدم واحد مجاناً</p>
                </div>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>مستخدم واحد مجاني</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>جميع ميزات المحاسبة</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>إدارة المخزون الكاملة</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>تقارير شاملة</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>دعم فني مجاني</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>بدون حدود زمنية</span>
                  </li>
                </ul>
                <Button asChild className="w-full bg-green-600 hover:bg-green-700">
                  <Link href="/auth/sign-up">ابدأ مجاناً الآن</Link>
                </Button>
                <p className="text-xs text-center text-gray-500 mt-2">لا تحتاج بطاقة ائتمان</p>
              </CardContent>
            </Card>

            {/* Pay Per User Plan */}
            <Card className="p-8">
              <CardContent className="p-0">
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold mb-2">مستخدمين إضافيين</h3>
                  <div className="text-5xl font-bold text-blue-600 mb-2">$5<span className="text-lg text-gray-500">/مستخدم/شهر</span></div>
                  <p className="text-gray-600">لكل مستخدم إضافي</p>
                </div>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>المستخدم الأول مجاني</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>$5 لكل مستخدم إضافي</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>جميع الميزات لكل مستخدم</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>صلاحيات متقدمة</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>إدارة الفرق</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span>دعم أولوية</span>
                  </li>
                </ul>
                <Button className="w-full" variant="outline">أضف مستخدمين</Button>
                <p className="text-xs text-center text-gray-500 mt-2">ادفع فقط عند الحاجة</p>
              </CardContent>
            </Card>
          </div>

          {/* Pricing Examples */}
          <div className="mt-12 bg-white rounded-lg p-8 shadow-sm">
            <h3 className="text-xl font-bold text-center mb-6">أمثلة على التكلفة الشهرية</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">$0</div>
                <div className="text-sm text-gray-600">مستخدم واحد</div>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">$5</div>
                <div className="text-sm text-gray-600">مستخدمين (1+1)</div>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">$15</div>
                <div className="text-sm text-gray-600">4 مستخدمين (1+3)</div>
              </div>
              <div className="p-4 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">$45</div>
                <div className="text-sm text-gray-600">10 مستخدمين (1+9)</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">ماذا يقول عملاؤنا</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="p-6">
                <CardContent className="p-0">
                  <div className="flex items-center gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-gray-600 mb-4">"{testimonial.text}"</p>
                  <div>
                    <div className="font-semibold">{testimonial.name}</div>
                    <div className="text-sm text-gray-500">{testimonial.company}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="max-w-4xl mx-auto text-center px-4">
          <h2 className="text-4xl font-bold mb-4">جاهز لتطوير أعمالك؟</h2>
          <p className="text-xl mb-8">ابدأ تجربتك المجانية اليوم ولا تحتاج لبطاقة ائتمان</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="bg-white text-blue-600 hover:bg-gray-100 text-lg px-8 py-4">
              <Link href="/auth/sign-up">تجربة مجانية لمدة 30 يوم</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600 text-lg px-8 py-4">
              <Link href="/auth/login">تحدث مع خبير</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img src="/icons/icon-64x64.png" alt="7ESAB ERP" className="w-8 h-8" />
                <span className="text-xl font-bold">7ESAB ERP</span>
              </div>
              <p className="text-gray-400">نظام إدارة الأعمال الأكثر تطوراً للشركات العربية</p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">المنتج</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#features" className="hover:text-white">الميزات</a></li>
                <li><a href="#pricing" className="hover:text-white">الأسعار</a></li>
                <li><a href="#" className="hover:text-white">الأمان</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">الدعم</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">مركز المساعدة</a></li>
                <li><a href="#" className="hover:text-white">تواصل معنا</a></li>
                <li><a href="#" className="hover:text-white">التدريب</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">الشركة</h3>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">من نحن</a></li>
                <li><a href="#" className="hover:text-white">المدونة</a></li>
                <li><a href="#" className="hover:text-white">الوظائف</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 7ESAB ERP. جميع الحقوق محفوظة.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}