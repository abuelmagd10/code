"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Building2, Globe, Coins, CheckCircle2, ArrowRight, ArrowLeft, Loader2, Sparkles, MapPin, Phone, FileText, Rocket, LayoutGrid } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { createDefaultChartOfAccounts } from "@/lib/default-chart-of-accounts"
import { OPTIONAL_MODULES, MODULE_LABELS, type ModuleKey } from "@/lib/module-manifest"

// Professional currency list
const CURRENCIES = [
  { code: "EGP", name: "Egyptian Pound", nameAr: "الجنيه المصري", symbol: "£", flag: "🇪🇬" },
  { code: "USD", name: "US Dollar", nameAr: "الدولار الأمريكي", symbol: "$", flag: "🇺🇸" },
  { code: "EUR", name: "Euro", nameAr: "اليورو", symbol: "€", flag: "🇪🇺" },
  { code: "GBP", name: "British Pound", nameAr: "الجنيه الإسترليني", symbol: "£", flag: "🇬🇧" },
  { code: "SAR", name: "Saudi Riyal", nameAr: "الريال السعودي", symbol: "﷼", flag: "🇸🇦" },
  { code: "AED", name: "UAE Dirham", nameAr: "الدرهم الإماراتي", symbol: "د.إ", flag: "🇦🇪" },
  { code: "KWD", name: "Kuwaiti Dinar", nameAr: "الدينار الكويتي", symbol: "د.ك", flag: "🇰🇼" },
  { code: "QAR", name: "Qatari Riyal", nameAr: "الريال القطري", symbol: "﷼", flag: "🇶🇦" },
  { code: "BHD", name: "Bahraini Dinar", nameAr: "الدينار البحريني", symbol: "د.ب", flag: "🇧🇭" },
  { code: "OMR", name: "Omani Rial", nameAr: "الريال العماني", symbol: "﷼", flag: "🇴🇲" },
  { code: "JOD", name: "Jordanian Dinar", nameAr: "الدينار الأردني", symbol: "د.أ", flag: "🇯🇴" },
  { code: "MAD", name: "Moroccan Dirham", nameAr: "الدرهم المغربي", symbol: "د.م", flag: "🇲🇦" },
  { code: "TRY", name: "Turkish Lira", nameAr: "الليرة التركية", symbol: "₺", flag: "🇹🇷" },
  { code: "INR", name: "Indian Rupee", nameAr: "الروبية الهندية", symbol: "₹", flag: "🇮🇳" },
]

export default function OnboardingPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)

  // Form data
  const [companyName, setCompanyName] = useState("")
  const [currency, setCurrency] = useState("EGP")
  const [language, setLanguage] = useState("ar")
  const [address, setAddress] = useState("")
  const [city, setCity] = useState("")
  const [country, setCountry] = useState("")
  const [phone, setPhone] = useState("")
  const [taxId, setTaxId] = useState("")
  // v3.74.261 — اختيار الوحدات وقت الإنشاء. الافتراضى: كل الوحدات
  // الاختيارية مفعّلة، عشان المالك يلغّى اللى ما يحتاجهاش بدل ما يفكّر
  // فى اللى عاوزه من الصفر. لو خلاها فاضية بنخزّن مصفوفة فاضية ([]) —
  // مش null — عشان نفرّق بين "اختار قصداً ما يفعّل حاجة" و"شركة قديمة
  // ما اختارتش".
  const [selectedModules, setSelectedModules] = useState<Set<ModuleKey>>(
    () => new Set<ModuleKey>(OPTIONAL_MODULES as readonly ModuleKey[])
  )

  // Load saved preferences
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedCurrency = localStorage.getItem('app_currency')
      const savedLanguage = localStorage.getItem('app_language')
      const savedCompanyName = localStorage.getItem('pending_company_name')
      if (savedCurrency) setCurrency(savedCurrency)
      if (savedLanguage) setLanguage(savedLanguage)
      if (savedCompanyName) setCompanyName(savedCompanyName)
    }
  }, [])

  // Check if user is authenticated and has no company
  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      // Check if user already has a company (through company_members)
      const { data: memberships } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1)

      if (memberships && memberships.length > 0) {
        // User already has a company, redirect to dashboard
        router.push('/dashboard')
        return
      }

      setCheckingAuth(false)
    }
    checkAuth()
  }, [router])

  const texts = {
    ar: {
      title: "مرحباً بك في نظام ERP",
      subtitle: "دعنا نساعدك في إعداد شركتك",
      step1Title: "معلومات الشركة الأساسية",
      step2Title: "إعدادات العملة واللغة",
      step3Title: "معلومات الاتصال",
      step4Title: "الوحدات اللى تحتاجها",
      step4Subtitle: "اختار اللى يخص شغلك — تقدر تغيّر الاختيار لاحقاً من الإعدادات → المستخدمون",
      companyName: "اسم الشركة",
      currency: "العملة الأساسية",
      language: "لغة النظام",
      arabic: "العربية",
      english: "English",
      address: "العنوان",
      city: "المدينة",
      country: "الدولة",
      phone: "رقم الهاتف",
      taxId: "الرقم الضريبي",
      next: "التالي",
      back: "رجوع",
      finish: "إنشاء الشركة",
      creating: "جاري الإنشاء...",
      currencyNote: "⚠️ اختر العملة بعناية - تغييرها لاحقاً قد يتطلب تحويل جميع المبالغ",
      optional: "(اختياري)",
      required: "مطلوب",
    },
    en: {
      title: "Welcome to ERP System",
      subtitle: "Let us help you set up your company",
      step1Title: "Basic Company Information",
      step2Title: "Currency & Language Settings",
      step3Title: "Contact Information",
      step4Title: "Modules You Need",
      step4Subtitle: "Pick what fits your business — you can change this later from Settings → Users",
      companyName: "Company Name",
      currency: "Base Currency",
      language: "System Language",
      arabic: "Arabic",
      english: "English",
      address: "Address",
      city: "City",
      country: "Country",
      phone: "Phone Number",
      taxId: "Tax ID",
      next: "Next",
      back: "Back",
      finish: "Create Company",
      creating: "Creating...",
      currencyNote: "⚠️ Choose currency carefully - changing it later may require converting all amounts",
      optional: "(Optional)",
      required: "Required",
    }
  }
  const L = language === "en" ? texts.en : texts.ar

  // Update document direction
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dir = language === "en" ? "ltr" : "rtl"
      document.documentElement.lang = language === "en" ? "en" : "ar"
    }
  }, [language])

  const totalSteps = 4
  const progress = (step / totalSteps) * 100

  // v3.74.261 — toggle for the new step's switches
  const toggleModule = (k: ModuleKey) => {
    setSelectedModules((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  const handleNext = () => {
    if (step === 1 && !companyName.trim()) {
      toast({ title: language === 'en' ? 'Error' : 'خطأ', description: language === 'en' ? 'Company name is required' : 'اسم الشركة مطلوب', variant: 'destructive' })
      return
    }
    setStep(step + 1)
  }

  const handleBack = () => setStep(step - 1)

  const handleFinish = async () => {
    if (!companyName.trim()) {
      toast({ title: language === 'en' ? 'Error' : 'خطأ', description: language === 'en' ? 'Company name is required' : 'اسم الشركة مطلوب', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      // Create the company with base_currency (using global currencies system)
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({
          name: companyName.trim(),
          user_id: user.id,
          email: user.email || '',
          base_currency: currency,
          address: address || null,
          city: city || null,
          country: country || null,
          phone: phone || null,
          tax_id: taxId || null,
          // v3.74.261 — persist the wizard's pick. Empty array = "owner
          // chose nothing optional" (sidebar shows core only). null is
          // reserved for legacy companies that pre-date this column.
          enabled_modules: Array.from(selectedModules).sort(),
        })
        .select()
        .single()

      if (companyError) throw companyError

      // Create company_members entry for owner
      try {
        await supabase
          .from('company_members')
          .insert({
            company_id: company.id,
            user_id: user.id,
            role: 'owner'
          })
      } catch (e) {
        console.error('Error creating company member:', e)
      }

      // Note: No need to create currencies - using global_currencies table now

      // Create default chart of accounts for the new company (IFRS-compliant)
      try {
        const coaResult = await createDefaultChartOfAccounts(supabase, company.id, language as 'ar' | 'en')
        if (!coaResult.success) {
          console.warn('Warning: Could not create chart of accounts:', coaResult.error)
        } else {
          console.log(`✅ Created ${coaResult.accountsCreated} default accounts (IFRS-compliant)`)
        }
      } catch (e) {
        console.error('Error creating default chart of accounts:', e)
      }

      // Save preferences to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('app_currency', currency)
        localStorage.setItem('app_language', language)
        localStorage.setItem('original_system_currency', currency)
        localStorage.setItem('active_company_id', company.id)
        localStorage.setItem('company_name', companyName.trim())
        localStorage.removeItem('pending_company_name')
        document.cookie = `app_currency=${currency}; path=/; max-age=31536000`
        document.cookie = `app_language=${language}; path=/; max-age=31536000`

        // Dispatch events
        window.dispatchEvent(new Event('app_currency_changed'))
        window.dispatchEvent(new Event('app_language_changed'))
        window.dispatchEvent(new Event('company_updated'))
      }

      toast({
        title: language === 'en' ? 'Success!' : 'تم بنجاح!',
        description: language === 'en' ? 'Your company has been created' : 'تم إنشاء شركتك بنجاح',
      })

      // Redirect to dashboard
      router.push('/dashboard')
    } catch (error) {
      console.error('Error creating company:', error)
      toast({
        title: language === 'en' ? 'Error' : 'خطأ',
        description: language === 'en' ? 'Failed to create company' : 'فشل في إنشاء الشركة',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-violet-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">{language === 'en' ? 'Loading...' : 'جاري التحميل...'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-violet-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-violet-600 to-purple-700 rounded-3xl shadow-xl shadow-violet-500/30 mb-6">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{L.title}</h1>
          <p className="text-gray-600 dark:text-gray-400">{L.subtitle}</p>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className={`flex items-center gap-2 ${s <= step ? 'text-violet-600' : 'text-gray-400 dark:text-gray-500'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${s < step ? 'bg-green-500 text-white' : s === step ? 'bg-violet-600 text-white' : 'bg-gray-200 dark:bg-slate-700'}`}>
                  {s < step ? <CheckCircle2 className="w-5 h-5" /> : s}
                </div>
                <span className="text-sm font-medium hidden sm:inline">
                  {s === 1 ? L.step1Title : s === 2 ? L.step2Title : s === 3 ? L.step3Title : L.step4Title}
                </span>
              </div>
            ))}
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Card */}
        <Card className="shadow-2xl border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm">
          <CardContent className="p-8">
            {/* Step 1: Company Name */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <Building2 className="w-12 h-12 text-violet-600 mx-auto mb-3" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{L.step1Title}</h2>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <Building2 className="w-4 h-4" />
                    {L.companyName} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder={language === 'en' ? 'Enter your company name' : 'أدخل اسم شركتك'}
                    className="h-12 text-lg bg-gray-50 dark:bg-slate-800"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Currency & Language */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <Coins className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{L.step2Title}</h2>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Coins className="w-4 h-4" />
                      {L.currency}
                    </Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger className="h-12 bg-gray-50 dark:bg-slate-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            <span className="flex items-center gap-3">
                              <span className="text-lg">{c.flag}</span>
                              <span className="font-semibold">{c.code}</span>
                              <span className="text-gray-500 dark:text-gray-400">-</span>
                              <span>{language === 'en' ? c.name : c.nameAr}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg">
                      {L.currencyNote}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Globe className="w-4 h-4" />
                      {L.language}
                    </Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="h-12 bg-gray-50 dark:bg-slate-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ar"><span className="flex items-center gap-2">🇪🇬 {L.arabic}</span></SelectItem>
                        <SelectItem value="en"><span className="flex items-center gap-2">🇺🇸 {L.english}</span></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Contact Info */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <MapPin className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{L.step3Title}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{L.optional}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label className="flex items-center gap-2"><MapPin className="w-4 h-4" />{L.address}</Label>
                    <Input value={address} onChange={(e) => setAddress(e.target.value)} className="bg-gray-50 dark:bg-slate-800" />
                  </div>
                  <div className="space-y-2">
                    <Label>{L.city}</Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} className="bg-gray-50 dark:bg-slate-800" />
                  </div>
                  <div className="space-y-2">
                    <Label>{L.country}</Label>
                    <Input value={country} onChange={(e) => setCountry(e.target.value)} className="bg-gray-50 dark:bg-slate-800" />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Phone className="w-4 h-4" />{L.phone}</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-gray-50 dark:bg-slate-800" />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><FileText className="w-4 h-4" />{L.taxId}</Label>
                    <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} className="bg-gray-50 dark:bg-slate-800" />
                  </div>
                </div>
              </div>
            )}

            {/* v3.74.261 — Step 4: Modules pick (writes to companies.enabled_modules) */}
            {step === 4 && (
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <LayoutGrid className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{L.step4Title}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{L.step4Subtitle}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(OPTIONAL_MODULES as readonly ModuleKey[]).map((k) => {
                    const meta = MODULE_LABELS[k]
                    const on = selectedModules.has(k)
                    const label = language === 'en' ? meta.en : meta.ar
                    const desc = language === 'en' ? meta.description?.en : meta.description?.ar
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => toggleModule(k)}
                        className={`flex items-start justify-between p-4 rounded-xl border-2 text-right transition-all
                          ${on
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-600 shadow-sm'
                            : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700'}`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white">{label}</div>
                          {desc && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{desc}</div>
                          )}
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors
                          ${on
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'bg-white dark:bg-slate-800 border-gray-300 dark:border-slate-600'}`}
                        >
                          {on && <CheckCircle2 className="w-4 h-4 text-white" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-4 mt-8 pt-6 border-t border-gray-200 dark:border-slate-700">
              {step > 1 && (
                <Button variant="outline" onClick={handleBack} className="flex-1 h-12 gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  {L.back}
                </Button>
              )}
              {step < totalSteps ? (
                <Button onClick={handleNext} className="flex-1 h-12 gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700">
                  {L.next}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={handleFinish} disabled={loading} className="flex-1 h-12 gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700">
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />{L.creating}</>
                  ) : (
                    <><Rocket className="w-4 h-4" />{L.finish}</>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

