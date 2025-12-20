import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, CreditCard, Building, User, Mail, Phone, MapPin, ArrowLeft } from 'lucide-react'

export default function SignupPage() {
  const [selectedPlan, setSelectedPlan] = useState('professional')
  const [billingCycle, setBillingCycle] = useState('monthly')
  const [formData, setFormData] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    country: '',
    city: '',
    industry: ''
  })

  const plans = {
    basic: { name: 'الخطة الأساسية', monthly: 29, yearly: 290, users: 3 },
    professional: { name: 'الخطة الاحترافية', monthly: 79, yearly: 790, users: 10 },
    enterprise: { name: 'خطة المؤسسات', monthly: 199, yearly: 1990, users: 'غير محدود' }
  }

  const currentPlan = plans[selectedPlan as keyof typeof plans]
  const price = billingCycle === 'monthly' ? currentPlan.monthly : currentPlan.yearly
  const savings = billingCycle === 'yearly' ? Math.round((currentPlan.monthly * 12 - currentPlan.yearly) / (currentPlan.monthly * 12) * 100) : 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const response = await fetch('/api/subscription/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: selectedPlan,
          billingCycle,
          ...formData
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        // Redirect to payment or dashboard
        window.location.href = data.redirectUrl
      } else {
        alert('حدث خطأ: ' + data.message)
      }
    } catch (error) {
      alert('حدث خطأ في الاتصال')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-3">
              <img src="/icons/icon-64x64.svg" alt="7ESAB ERP" className="w-10 h-10" />
              <span className="text-2xl font-bold text-gray-900">7ESAB ERP</span>
            </div>
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              العودة
            </Button>
          </div>
        </div>
      </header>

      <div className="py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">ابدأ مجاناً إلى الأبد</h1>
            <p className="text-xl text-gray-600">مستخدم واحد مجاني، مستخدمين إضافيين بـ $5 شهرياً</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Free Forever Plan */}
            <div>
              <h2 className="text-2xl font-bold mb-6">النسخة المجانية</h2>
              
              <Card className="mb-8 border-2 border-green-500 bg-green-50">
                <CardContent className="p-8">
                  <div className="text-center mb-6">
                    <div className="text-5xl font-bold text-green-600 mb-2">$0</div>
                    <div className="text-lg text-gray-600">مجاني إلى الأبد</div>
                    <Badge className="mt-2 bg-green-600">مستخدم واحد مجاني</Badge>
                  </div>
                  
                  <ul className="space-y-3 mb-6">
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
                  
                  <Button className="w-full bg-green-600 hover:bg-green-700 text-lg py-6">
                    ابدأ مجاناً الآن
                  </Button>
                  <p className="text-xs text-center text-gray-500 mt-2">لا تحتاج بطاقة ائتمان</p>
                </CardContent>
              </Card>

              {/* Additional Users */}
              <Card>
                <CardHeader>
                  <CardTitle>مستخدمين إضافيين</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center mb-4">
                    <div className="text-3xl font-bold text-blue-600">$5<span className="text-lg text-gray-500">/مستخدم/شهر</span></div>
                    <p className="text-gray-600">لكل مستخدم إضافي</p>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                      <span>2 مستخدم (1+1)</span>
                      <span className="font-bold">$5/شهر</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                      <span>5 مستخدم (1+4)</span>
                      <span className="font-bold">$20/شهر</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                      <span>10 مستخدم (1+9)</span>
                      <span className="font-bold">$45/شهر</span>
                    </div>
                  </div>
                  
                  <Button className="w-full mt-4" variant="outline">
                    أضف مستخدمين لاحقاً
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Company Information Form */}
            <div>
              <h2 className="text-2xl font-bold mb-6">معلومات الشركة</h2>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building className="w-5 h-5" />
                      بيانات الشركة
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="companyName">اسم الشركة *</Label>
                      <Input
                        id="companyName"
                        required
                        value={formData.companyName}
                        onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                        placeholder="اسم شركتك"
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="country">الدولة *</Label>
                        <Select value={formData.country} onValueChange={(value) => setFormData({...formData, country: value})}>
                          <SelectTrigger>
                            <SelectValue placeholder="اختر الدولة" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sa">السعودية</SelectItem>
                            <SelectItem value="ae">الإمارات</SelectItem>
                            <SelectItem value="eg">مصر</SelectItem>
                            <SelectItem value="jo">الأردن</SelectItem>
                            <SelectItem value="kw">الكويت</SelectItem>
                            <SelectItem value="qa">قطر</SelectItem>
                            <SelectItem value="bh">البحرين</SelectItem>
                            <SelectItem value="om">عمان</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label htmlFor="city">المدينة *</Label>
                        <Input
                          id="city"
                          required
                          value={formData.city}
                          onChange={(e) => setFormData({...formData, city: e.target.value})}
                          placeholder="المدينة"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="industry">نوع النشاط</Label>
                      <Select value={formData.industry} onValueChange={(value) => setFormData({...formData, industry: value})}>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر نوع النشاط" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="retail">تجارة التجزئة</SelectItem>
                          <SelectItem value="wholesale">تجارة الجملة</SelectItem>
                          <SelectItem value="manufacturing">التصنيع</SelectItem>
                          <SelectItem value="services">الخدمات</SelectItem>
                          <SelectItem value="construction">الإنشاءات</SelectItem>
                          <SelectItem value="technology">التكنولوجيا</SelectItem>
                          <SelectItem value="healthcare">الرعاية الصحية</SelectItem>
                          <SelectItem value="education">التعليم</SelectItem>
                          <SelectItem value="other">أخرى</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="w-5 h-5" />
                      بيانات الاتصال
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="contactName">اسم المسؤول *</Label>
                      <Input
                        id="contactName"
                        required
                        value={formData.contactName}
                        onChange={(e) => setFormData({...formData, contactName: e.target.value})}
                        placeholder="الاسم الكامل"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="email">البريد الإلكتروني *</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        placeholder="email@company.com"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="phone">رقم الهاتف *</Label>
                      <Input
                        id="phone"
                        required
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        placeholder="+966 50 123 4567"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="w-5 h-5" />
                      معلومات الدفع
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="font-medium">مجاني إلى الأبد</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        لا تحتاج بطاقة ائتمان للبدء. ادفع فقط عند إضافة مستخدمين.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-lg py-6">
                  ابدأ مجاناً الآن
                  <ArrowLeft className="w-5 h-5 mr-2" />
                </Button>

                <p className="text-xs text-gray-500 text-center">
                  بالمتابعة، أنت توافق على <a href="#" className="text-blue-600 hover:underline">شروط الخدمة</a> و 
                  <a href="#" className="text-blue-600 hover:underline"> سياسة الخصوصية</a>
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}