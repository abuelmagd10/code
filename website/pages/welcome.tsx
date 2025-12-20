import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, ArrowRight, Play, BookOpen, Users, Settings } from 'lucide-react'

export default function WelcomePage() {
  const [companyId, setCompanyId] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setCompanyId(params.get('company') || '')
  }, [])

  const steps = [
    {
      icon: Settings,
      title: 'إعداد الشركة',
      desc: 'أكمل بيانات شركتك الأساسية',
      action: 'ابدأ الإعداد',
      href: '/settings'
    },
    {
      icon: Users,
      title: 'إضافة المستخدمين',
      desc: 'ادع فريقك للانضمام للنظام',
      action: 'إضافة مستخدمين',
      href: '/settings/users'
    },
    {
      icon: BookOpen,
      title: 'التدريب',
      desc: 'تعلم كيفية استخدام النظام بكفاءة',
      action: 'بدء التدريب',
      href: '/training'
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Success Message */}
          <div className="mb-12">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              مرحباً بك في 7ESAB ERP! 🎉
            </h1>
            <p className="text-xl text-gray-600 mb-6">
              تم إنشاء حسابك بنجاح. لديك الآن 30 يوماً تجربة مجانية كاملة.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-2xl mx-auto">
              <p className="text-blue-800">
                <strong>تم إرسال بيانات الدخول إلى بريدك الإلكتروني.</strong>
                <br />
                يرجى التحقق من صندوق الوارد أو مجلد الرسائل غير المرغوب فيها.
              </p>
            </div>
          </div>

          {/* Next Steps */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-8">الخطوات التالية</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {steps.map((step, index) => (
                <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                      <step.icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <CardTitle className="text-lg">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-600 mb-4">{step.desc}</p>
                    <Button className="w-full" onClick={() => window.location.href = step.href}>
                      {step.action}
                      <ArrowRight className="w-4 h-4 mr-2" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700" onClick={() => window.location.href = '/dashboard'}>
              الانتقال للوحة التحكم
              <ArrowRight className="w-5 h-5 mr-2" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => window.location.href = '/training'}>
              <Play className="w-5 h-5 ml-2" />
              مشاهدة الفيديو التعريفي
            </Button>
          </div>

          {/* Support */}
          <div className="mt-12 p-6 bg-white rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold mb-2">تحتاج مساعدة؟</h3>
            <p className="text-gray-600 mb-4">
              فريق الدعم الفني متاح 24/7 لمساعدتك في البدء
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="outline">
                💬 الدردشة المباشرة
              </Button>
              <Button variant="outline">
                📞 اتصل بنا
              </Button>
              <Button variant="outline">
                📧 البريد الإلكتروني
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}