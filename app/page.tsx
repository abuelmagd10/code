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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-gray-900">7ESAB ERP</span>
            </div>
            <nav className="flex items-center gap-4">
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
            <Button asChild size="lg" variant="outline" className="text-lg px-8 py-4">
              <Link href="/auth/login">
                تسجيل الدخول
              </Link>
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">مجاني</div>
              <div className="text-gray-600">للمستخدم الأول</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">$5</div>
              <div className="text-gray-600">لكل مستخدم إضافي</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">24/7</div>
              <div className="text-gray-600">دعم فني</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
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

      {/* CTA Section */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="max-w-4xl mx-auto text-center px-4">
          <h2 className="text-4xl font-bold mb-4">جاهز لتطوير أعمالك؟</h2>
          <p className="text-xl mb-8">ابدأ تجربتك المجانية اليوم ولا تحتاج لبطاقة ائتمان</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="bg-white text-blue-600 hover:bg-gray-100 text-lg px-8 py-4">
              <Link href="/auth/sign-up">تجربة مجانية</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-blue-600 text-lg px-8 py-4">
              <Link href="/auth/login">تسجيل الدخول</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
