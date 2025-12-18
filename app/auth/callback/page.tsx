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
  const createCompanyFromMetadata = async (userId: string, userMetadata: any, userEmail?: string) => {
    let companyName = 'شركتي'
    let currency = 'EGP'
    let language: 'ar' | 'en' = 'ar'

    // PRIORITY 1: Get from database (pending_companies table) - most reliable!
    if (userEmail) {
      try {
        const { data: pendingData } = await supabase
          .from('pending_companies')
          .select('*')
          .eq('user_email', userEmail.toLowerCase())
          .single()

        if (pendingData) {
          console.log('Found pending company in database:', pendingData)
          companyName = pendingData.company_name || companyName
          currency = pendingData.currency || currency
          language = (pendingData.language || language) as 'ar' | 'en'

          // Clean up pending data after reading
          await supabase
            .from('pending_companies')
            .delete()
            .eq('user_email', userEmail.toLowerCase())
        }
      } catch (e) {
        console.log('No pending company found in database, checking other sources')
      }
    }

    // PRIORITY 2: Get from localStorage (for same-session auto-confirm)
    if (companyName === 'شركتي') {
      const localCompanyName = localStorage.getItem('pending_company_name')
      const localCurrency = localStorage.getItem('pending_currency')
      const localLanguage = localStorage.getItem('pending_language')

      if (localCompanyName) companyName = localCompanyName
      if (localCurrency) currency = localCurrency
      if (localLanguage) language = localLanguage as 'ar' | 'en'
    }

    // PRIORITY 3: Get from user_metadata (fallback)
    if (companyName === 'شركتي') {
      companyName = userMetadata?.company_name || companyName
      currency = userMetadata?.preferred_currency || currency
      language = (userMetadata?.preferred_language || language) as 'ar' | 'en'
    }

    console.log('Creating company with:', { companyName, currency, language })
    setStatus("جاري إنشاء شركتك...")

    // Create company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        name: companyName,
        base_currency: currency,
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

    // === GLOBAL CURRENCIES SYSTEM ===
    // No need to create currencies - they are stored in global_currencies table
    // Company's base_currency is already set in companies table above
    console.log('Company created with base_currency:', currency)
    console.log('Using global_currencies table - no per-company currencies needed')

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
        // Get all possible URL parameters
        const token_hash = params?.get("token_hash") || params?.get("token") || ""
        const type = (params?.get("type") || "").toLowerCase()
        const isAutoSignup = params?.get("auto") === "true"
        const code = params?.get("code") || "" // For PKCE flow
        const error_description = params?.get("error_description") || ""

        console.log('Callback params:', { token_hash: !!token_hash, type, isAutoSignup, code: !!code })

        // Check for error in URL
        if (error_description) {
          setError(error_description)
          return
        }

        // METHOD 1: Handle PKCE code exchange (new Supabase method)
        if (code) {
          setStatus("جاري التحقق من الرابط...")
          const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

          if (exchangeError) {
            console.error('Code exchange error:', exchangeError)
            setError(exchangeError.message || "فشل التحقق من الرابط")
            return
          }

          if (sessionData?.user) {
            await handleUserAfterVerification(sessionData.user)
            return
          }
        }

        // METHOD 2: Handle auto signup (when email confirmation is disabled)
        if (isAutoSignup && type === "signup") {
          const { data: { user } } = await supabase.auth.getUser()
          if (user?.id) {
            await handleUserAfterVerification(user)
            return
          }
        }

        // METHOD 3: Handle token_hash verification (legacy method)
        if (token_hash) {
          setStatus("جاري التحقق من الرابط...")
          const validTypes = ["invite","signup","magiclink","recovery","email_change"] as const
          const mapped = validTypes.includes(type as any) ? (type as any) : "signup"
          const { error: verErr } = await supabase.auth.verifyOtp({ type: mapped as any, token_hash })

          if (verErr) {
            console.error('OTP verification error:', verErr)
            setError(verErr.message || "فشل التحقق من الرابط")
            return
          }

          const { data: { user } } = await supabase.auth.getUser()
          if (user?.id) {
            await handleUserAfterVerification(user)
            return
          }
        }

        // METHOD 4: Check if user is already logged in (session might be set via URL hash)
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          await handleUserAfterVerification(session.user)
          return
        }

        // No valid method found
        setError("رابط التحقق غير صالح أو منتهي الصلاحية. يرجى طلب رابط جديد.")
        return

      } catch (err: any) {
        console.error('Callback error:', err)
        setError(err.message || "حدث خطأ غير متوقع")
      }
    }

    // Helper function to handle user after verification
    const handleUserAfterVerification = async (user: any) => {
      // Check if user already has a company
      const { data: membership } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", user.id)
        .limit(1)

      if (!membership || membership.length === 0) {
        // New user without company - check if they have a pending invitation first!

        // PRIORITY: Check for pending invitation
        if (user.email) {
          const { data: pendingInvitation } = await supabase
            .from('company_invitations')
            .select('company_id, role, accept_token, companies(name)')
            .eq('email', user.email.toLowerCase())
            .eq('accepted', false)
            .gt('expires_at', new Date().toISOString())
            .limit(1)
            .single()

          if (pendingInvitation) {
            // User has a pending invitation - redirect to accept it instead of creating company
            setStatus("لديك دعوة معلقة للانضمام إلى شركة! جاري توجيهك...")
            setTimeout(() => {
              router.replace(`/invitations/accept?token=${pendingInvitation.accept_token}`)
            }, 1500)
            return
          }
        }

        // No pending invitation - CREATE COMPANY AUTOMATICALLY (for new users only)
        try {
          await createCompanyFromMetadata(user.id, user.user_metadata, user.email)
          setStatus("تم إنشاء الشركة بنجاح! جاري توجيهك للوحة التحكم...")
          setTimeout(async () => {
            try {
              const res = await fetch("/api/first-allowed-page")
              const data = await res.json()
              router.replace(data.path || "/dashboard")
            } catch {
              router.replace("/dashboard")
            }
          }, 2000)
        } catch (createErr: any) {
          console.error('Error creating company:', createErr)
          setStatus("سيتم توجيهك لإعداد شركتك...")
          setTimeout(() => router.replace("/onboarding"), 1500)
        }
      } else {
        // User already has company
        const companyId = membership[0].company_id
        try {
          localStorage.setItem('active_company_id', String(companyId))
          document.cookie = `active_company_id=${String(companyId)}; path=/; max-age=31536000`
        } catch {}
        setStatus("تم التحقق بنجاح، سيتم توجيهك...")
        setTimeout(async () => {
          try {
            const res = await fetch("/api/first-allowed-page")
            const data = await res.json()
            router.replace(data.path || "/dashboard")
          } catch {
            router.replace("/dashboard")
          }
        }, 1500)
      }
    }

    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, supabase, router])

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