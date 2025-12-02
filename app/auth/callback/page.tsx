"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { Loader2, CheckCircle2, Building2 } from "lucide-react"
import { createDefaultChartOfAccounts, CURRENCY_SYMBOLS, CURRENCY_NAMES } from "@/lib/default-chart-of-accounts"

function CallbackInner() {
  const params = useSearchParams()
  const router = useRouter()
  const supabase = useSupabase()
  const [status, setStatus] = useState<string>("جاري التحقق...")
  const [error, setError] = useState<string>("")
  const ran = useRef(false)

  // Function to create company automatically from user metadata
  const createCompanyFromMetadata = async (userId: string, userMetadata: any) => {
    // Get company data from localStorage first (saved during sign-up step 2)
    const localCompanyName = localStorage.getItem('pending_company_name')
    const localCurrency = localStorage.getItem('pending_currency')
    const localLanguage = localStorage.getItem('pending_language')

    // Use localStorage data first (most reliable), then user_metadata, then defaults
    const companyName = localCompanyName || userMetadata?.company_name || 'شركتي'
    const currency = localCurrency || userMetadata?.preferred_currency || 'EGP'
    const language = (localLanguage || userMetadata?.preferred_language || 'ar') as 'ar' | 'en'

    console.log('Creating company with:', { companyName, currency, language })
    setStatus("جاري إنشاء شركتك...")

    // Create company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        name: companyName,
        currency: currency,
        fiscal_year_start: 1,
        address: '',
        phone: '',
        email: '',
        tax_number: '',
        logo_url: ''
      })
      .select('id')
      .single()

    if (companyError) throw new Error('فشل في إنشاء الشركة: ' + companyError.message)

    // Add user as owner in company_members
    const { error: memberError } = await supabase
      .from('company_members')
      .insert({
        company_id: company.id,
        user_id: userId,
        role: 'owner',
        invited_by: null
      })

    if (memberError) throw new Error('فشل في إضافة المستخدم للشركة: ' + memberError.message)

    // Get currency details for base currency
    const currencySymbol = CURRENCY_SYMBOLS[currency] || currency
    const currencyName = CURRENCY_NAMES[currency]?.[language] || currency

    console.log('Creating base currency:', { currency, currencyName, currencySymbol })

    // Create base currency record with correct name and symbol
    const { error: currencyError } = await supabase
      .from('currencies')
      .insert({
        company_id: company.id,
        code: currency,
        name: currencyName,
        symbol: currencySymbol,
        exchange_rate: 1,
        is_base: true,
        is_active: true,
        decimals: 2
      })

    if (currencyError) {
      console.warn('Warning: Could not create base currency record:', currencyError)
    }

    // Add other common currencies (non-base) for multi-currency support
    const otherCurrencies = Object.entries(CURRENCY_NAMES)
      .filter(([code]) => code !== currency)
      .slice(0, 5) // Add top 5 other currencies
      .map(([code, names]) => ({
        company_id: company.id,
        code,
        name: names[language],
        symbol: CURRENCY_SYMBOLS[code] || code,
        exchange_rate: 1,
        is_base: false,
        is_active: true,
        decimals: 2
      }))

    if (otherCurrencies.length > 0) {
      const { error: otherCurrError } = await supabase
        .from('currencies')
        .insert(otherCurrencies)
      if (otherCurrError) console.warn('Warning: Could not create other currencies:', otherCurrError)
    }

    // Create default chart of accounts
    setStatus("جاري إنشاء الشجرة الحسابية...")
    const coaResult = await createDefaultChartOfAccounts(supabase, company.id, language)
    if (!coaResult.success) {
      console.warn('Warning: Could not create default chart of accounts:', coaResult.error)
    } else {
      console.log(`Created ${coaResult.accountsCreated} default accounts`)
    }

    // Save to localStorage and cookies
    try {
      localStorage.setItem('active_company_id', company.id)
      localStorage.setItem('app_currency', currency)
      localStorage.setItem('app_language', language)
      localStorage.setItem('original_system_currency', currency)
      // Clean up pending data
      localStorage.removeItem('pending_company_name')
      localStorage.removeItem('pending_currency')
      localStorage.removeItem('pending_language')
      localStorage.removeItem('pending_user_email')
      document.cookie = `active_company_id=${company.id}; path=/; max-age=31536000`
      document.cookie = `app_currency=${currency}; path=/; max-age=31536000`
      document.cookie = `app_language=${language}; path=/; max-age=31536000`
    } catch {}

    return company.id
  }

  useEffect(() => {
    const run = async () => {
      if (ran.current) return
      ran.current = true
      setError("")
      try {
        const token_hash = params?.get("token_hash") || params?.get("token") || ""
        const type = (params?.get("type") || "").toLowerCase()
        const isAutoSignup = params?.get("auto") === "true"

        // Handle auto signup (when email confirmation is disabled)
        if (isAutoSignup && type === "signup") {
          const { data: { user } } = await supabase.auth.getUser()
          if (user?.id) {
            // Check if user already has a company
            const { data: membership } = await supabase
              .from("company_members")
              .select("company_id")
              .eq("user_id", user.id)
              .limit(1)

            if (!membership || membership.length === 0) {
              try {
                await createCompanyFromMetadata(user.id, user.user_metadata)
                setStatus("تم إنشاء الشركة بنجاح! جاري توجيهك للوحة التحكم...")
                setTimeout(() => router.replace("/dashboard"), 2000)
                return
              } catch (createErr: any) {
                console.error('Error creating company:', createErr)
                setStatus("سيتم توجيهك لإعداد شركتك...")
                setTimeout(() => router.replace("/onboarding"), 1500)
                return
              }
            } else {
              const companyId = membership[0].company_id
              try {
                localStorage.setItem('active_company_id', String(companyId))
                document.cookie = `active_company_id=${String(companyId)}; path=/; max-age=31536000`
              } catch {}
              setStatus("تم التحقق بنجاح، سيتم توجيهك...")
              setTimeout(() => router.replace("/dashboard"), 1500)
              return
            }
          }
        }

        if (!token_hash && !isAutoSignup) {
          setError("رابط الدعوة غير صالح أو مفقود")
          return
        }

        if (!type && !isAutoSignup) {
          setError("نوع الطلب غير محدد")
          return
        }

        // Map Supabase types
        const validTypes = ["invite","signup","magiclink","recovery","email_change"] as const
        const mapped = validTypes.includes(type as any) ? (type as any) : "signup"
        const { error: verErr } = await supabase.auth.verifyOtp({ type: mapped as any, token_hash })

        if (verErr) {
          setError(verErr.message || "فشل التحقق من الرابط")
          return
        }

        const { data: { user } } = await supabase.auth.getUser()

        // Check if this is a new signup
        if (type === "signup" && user?.id) {
          // Check membership via company_members table
          const { data: membership } = await supabase
            .from("company_members")
            .select("company_id")
            .eq("user_id", user.id)
            .limit(1)

          if (!membership || membership.length === 0) {
            // New user without company - CREATE COMPANY AUTOMATICALLY
            try {
              const companyId = await createCompanyFromMetadata(user.id, user.user_metadata)
              setStatus("تم إنشاء الشركة بنجاح! جاري توجيهك للوحة التحكم...")
              setTimeout(() => router.replace("/dashboard"), 2000)
              return
            } catch (createErr: any) {
              console.error('Error creating company:', createErr)
              // Fallback to onboarding if auto-creation fails
              setStatus("سيتم توجيهك لإعداد شركتك...")
              setTimeout(() => router.replace("/onboarding"), 1500)
              return
            }
          } else {
            // User has company - set active company and redirect to dashboard
            const companyId = membership[0].company_id
            try {
              localStorage.setItem('active_company_id', String(companyId))
              document.cookie = `active_company_id=${String(companyId)}; path=/; max-age=31536000`
            } catch {}
            setStatus("تم التحقق بنجاح، سيتم توجيهك...")
            setTimeout(() => router.replace("/dashboard"), 1500)
            return
          }
        }

        // Handle invites
        if (type === "invite" && user?.email && user?.id) {
          try {
            const res = await fetch('/api/accept-membership', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email: user.email, userId: user.id })
            })
            const js = await res.json()
            if (res.ok && js?.companyId) {
              try {
                localStorage.setItem('active_company_id', String(js.companyId))
                document.cookie = `active_company_id=${String(js.companyId)}; path=/; max-age=31536000`
              } catch {}
              setStatus("تم قبول الدعوة بنجاح، سيتم توجيهك لتعيين كلمة المرور...")
              setTimeout(() => router.replace(`/auth/force-change-password?cid=${js.companyId}`), 1500)
              return
            }
          } catch {}
        }

        // Default redirect to dashboard
        setStatus("تم التحقق بنجاح، سيتم توجيهك...")
        setTimeout(() => router.replace("/dashboard"), 1500)
      } catch (e: any) {
        setError(e?.message || String(e))
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <Card className="w-full max-w-md shadow-xl border-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl shadow-lg shadow-violet-500/30 mx-auto mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="flex items-center justify-center gap-2">
            {error ? (
              <span className="text-red-600">خطأ في التحقق</span>
            ) : (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-violet-600" />
                <span>معالجة الطلب</span>
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{error}</p>
              <Button variant="outline" onClick={() => router.replace("/auth/login")} className="w-full">
                العودة لصفحة الدخول
              </Button>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
              <p className="text-sm text-gray-700 dark:text-gray-300">{status}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<div className="p-4">جاري التحميل...</div>}>
      <CallbackInner />
    </Suspense>
  )
}