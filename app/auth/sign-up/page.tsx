"use client"

import type React from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { Building2, Globe, Mail, Lock, CheckCircle2, Eye, EyeOff, DollarSign } from "lucide-react"

// Professional currency list with symbols and flags
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
  { code: "LBP", name: "Lebanese Pound", nameAr: "الليرة اللبنانية", symbol: "ل.ل", flag: "🇱🇧" },
  { code: "MAD", name: "Moroccan Dirham", nameAr: "الدرهم المغربي", symbol: "د.م", flag: "🇲🇦" },
  { code: "TND", name: "Tunisian Dinar", nameAr: "الدينار التونسي", symbol: "د.ت", flag: "🇹🇳" },
  { code: "DZD", name: "Algerian Dinar", nameAr: "الدينار الجزائري", symbol: "د.ج", flag: "🇩🇿" },
  { code: "IQD", name: "Iraqi Dinar", nameAr: "الدينار العراقي", symbol: "د.ع", flag: "🇮🇶" },
  { code: "SYP", name: "Syrian Pound", nameAr: "الليرة السورية", symbol: "ل.س", flag: "🇸🇾" },
  { code: "YER", name: "Yemeni Rial", nameAr: "الريال اليمني", symbol: "﷼", flag: "🇾🇪" },
  { code: "SDG", name: "Sudanese Pound", nameAr: "الجنيه السوداني", symbol: "ج.س", flag: "🇸🇩" },
  { code: "LYD", name: "Libyan Dinar", nameAr: "الدينار الليبي", symbol: "ل.د", flag: "🇱🇾" },
  { code: "TRY", name: "Turkish Lira", nameAr: "الليرة التركية", symbol: "₺", flag: "🇹🇷" },
  { code: "INR", name: "Indian Rupee", nameAr: "الروبية الهندية", symbol: "₹", flag: "🇮🇳" },
  { code: "CNY", name: "Chinese Yuan", nameAr: "اليوان الصيني", symbol: "¥", flag: "🇨🇳" },
  { code: "JPY", name: "Japanese Yen", nameAr: "الين الياباني", symbol: "¥", flag: "🇯🇵" },
]

export default function SignUpPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [repeatPassword, setRepeatPassword] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [currency, setCurrency] = useState("EGP")
  const [language, setLanguage] = useState("ar")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [step, setStep] = useState(1) // 1: Account, 2: Company
  const router = useRouter()
  const envOk = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Texts based on language
  const texts = {
    ar: {
      title: "إنشاء حساب جديد",
      subtitle: "ابدأ رحلتك مع نظام ERP الاحترافي",
      step1: "معلومات الحساب",
      step2: "إعداد الشركة",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      confirmPassword: "تأكيد كلمة المرور",
      companyName: "اسم الشركة",
      currency: "العملة الأساسية",
      language: "لغة النظام",
      arabic: "العربية",
      english: "English",
      next: "التالي",
      back: "رجوع",
      createAccount: "إنشاء الحساب",
      creating: "جاري الإنشاء...",
      haveAccount: "لديك حساب بالفعل؟",
      login: "تسجيل الدخول",
      passwordMismatch: "كلمتا المرور غير متطابقتين",
      passwordWeak: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
      envError: "الرجاء ضبط مفاتيح Supabase في البيئة قبل إنشاء الحساب",
      selectCurrency: "اختر العملة",
      selectLanguage: "اختر اللغة",
      currencyNote: "⚠️ العملة الأساسية مهمة جداً - يُنصح باختيارها بعناية لأن تغييرها لاحقاً قد يتطلب تحويل جميع المبالغ",
    },
    en: {
      title: "Create New Account",
      subtitle: "Start your journey with professional ERP system",
      step1: "Account Info",
      step2: "Company Setup",
      email: "Email",
      password: "Password",
      confirmPassword: "Confirm Password",
      companyName: "Company Name",
      currency: "Base Currency",
      language: "System Language",
      arabic: "Arabic",
      english: "English",
      next: "Next",
      back: "Back",
      createAccount: "Create Account",
      creating: "Creating...",
      haveAccount: "Already have an account?",
      login: "Login",
      passwordMismatch: "Passwords do not match",
      passwordWeak: "Password must be at least 6 characters",
      envError: "Please set Supabase keys in environment before creating account",
      selectCurrency: "Select Currency",
      selectLanguage: "Select Language",
      currencyNote: "⚠️ Base currency is very important - choose carefully as changing it later may require converting all amounts",
    }
  }
  const L = language === "en" ? texts.en : texts.ar

  // Update document direction on language change
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dir = language === "en" ? "ltr" : "rtl"
      document.documentElement.lang = language === "en" ? "en" : "ar"
    }
  }, [language])

  const validateStep1 = () => {
    if (!email.trim()) {
      setError(language === "en" ? "Email is required" : "البريد الإلكتروني مطلوب")
      return false
    }
    if (password.length < 6) {
      setError(L.passwordWeak)
      return false
    }
    if (password !== repeatPassword) {
      setError(L.passwordMismatch)
      return false
    }
    setError(null)
    return true
  }

  const handleNext = () => {
    if (validateStep1()) {
      setStep(2)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate company name is required
    if (!companyName.trim()) {
      setError(language === "en" ? "Company name is required" : "اسم الشركة مطلوب")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      if (!envOk) throw new Error(L.envError)
      const supabase = createClient()

      // Save all company data to localStorage BEFORE signup
      // This ensures data is available when callback creates the company
      if (typeof window !== 'undefined') {
        try {
          // Save pending company data (to be used by callback)
          localStorage.setItem('pending_company_name', companyName)
          localStorage.setItem('pending_currency', currency)
          localStorage.setItem('pending_language', language)
          localStorage.setItem('pending_user_email', email)
          // Also save as current preferences
          localStorage.setItem('app_currency', currency)
          localStorage.setItem('app_language', language)
          localStorage.setItem('original_system_currency', currency)
          document.cookie = `app_currency=${currency}; path=/; max-age=31536000`
          document.cookie = `app_language=${language}; path=/; max-age=31536000`
          console.log('Saved pending company data:', { companyName, currency, language })
        } catch (e) {
          console.error('Error saving to localStorage:', e)
        }
      }

      // Create the user account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?type=signup`,
          data: {
            company_name: companyName,
            preferred_currency: currency,
            preferred_language: language,
          }
        },
      })
      if (authError) throw authError

      // Check if email confirmation is needed
      // If user is immediately confirmed (autoconfirm enabled), redirect to create company
      if (authData?.user?.confirmed_at || authData?.session) {
        // User is confirmed - create company directly
        router.push("/auth/callback?type=signup&auto=true")
      } else {
        // Email confirmation required
        router.push("/auth/sign-up-success")
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : (language === "en" ? "Error creating account" : "خطأ في إنشاء الحساب"))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4 md:p-10 bg-gradient-to-br from-violet-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl shadow-lg shadow-violet-500/30 mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{L.title}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{L.subtitle}</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${step === 1 ? 'bg-violet-600 text-white shadow-lg' : 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300'}`}>
            <span className="w-6 h-6 flex items-center justify-center rounded-full bg-white/20 text-sm font-bold">1</span>
            <span className="text-sm font-medium hidden sm:inline">{L.step1}</span>
          </div>
          <div className="w-8 h-0.5 bg-gray-300 dark:bg-slate-600" />
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${step === 2 ? 'bg-violet-600 text-white shadow-lg' : 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-gray-300'}`}>
            <span className="w-6 h-6 flex items-center justify-center rounded-full bg-white/20 text-sm font-bold">2</span>
            <span className="text-sm font-medium hidden sm:inline">{L.step2}</span>
          </div>
        </div>

        <Card className="shadow-xl border-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
          <CardContent className="pt-6">
            <form onSubmit={handleSignUp} className="space-y-5">
              {/* Step 1: Account Info */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Mail className="w-4 h-4" />
                      {L.email}
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="example@company.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Lock className="w-4 h-4" />
                      {L.password}
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-11 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 pr-10"
                      />
                      <button
                        type="button"
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="repeat-password" className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <CheckCircle2 className="w-4 h-4" />
                      {L.confirmPassword}
                    </Label>
                    <Input
                      id="repeat-password"
                      type="password"
                      required
                      value={repeatPassword}
                      onChange={(e) => setRepeatPassword(e.target.value)}
                      className="h-11 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700"
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Company Setup */}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyName" className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Building2 className="w-4 h-4" />
                      {L.companyName}
                    </Label>
                    <Input
                      id="companyName"
                      type="text"
                      placeholder={language === "en" ? "My Company" : "شركتي"}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="h-11 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <DollarSign className="w-4 h-4" />
                      {L.currency}
                    </Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger className="h-11 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700">
                        <SelectValue placeholder={L.selectCurrency} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            <span className="flex items-center gap-2">
                              <span>{c.flag}</span>
                              <span className="font-medium">{c.code}</span>
                              <span className="text-gray-500">-</span>
                              <span className="text-gray-600 dark:text-gray-400">{language === "en" ? c.name : c.nameAr}</span>
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
                      <SelectTrigger className="h-11 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700">
                        <SelectValue placeholder={L.selectLanguage} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ar">
                          <span className="flex items-center gap-2">
                            <span>🇪🇬</span>
                            {L.arabic}
                          </span>
                        </SelectItem>
                        <SelectItem value="en">
                          <span className="flex items-center gap-2">
                            <span>🇺🇸</span>
                            {L.english}
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex gap-3 pt-2">
                {step === 2 && (
                  <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1 h-11">
                    {L.back}
                  </Button>
                )}
                {step === 1 ? (
                  <Button type="button" onClick={handleNext} className="w-full h-11 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700" disabled={!envOk}>
                    {L.next}
                  </Button>
                ) : (
                  <Button type="submit" className="flex-1 h-11 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700" disabled={isLoading || !envOk}>
                    {isLoading ? L.creating : L.createAccount}
                  </Button>
                )}
              </div>

              {!envOk && (
                <p className="text-xs text-amber-600 text-center">{L.envError}</p>
              )}
            </form>

            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-slate-700 text-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">{L.haveAccount} </span>
              <Link href="/auth/login" className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 font-medium">
                {L.login}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
