"use client"

import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, Shield, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"

export default function NoPermissionsPage() {
  const router = useRouter()
  const supabase = useSupabase()
  const [companyName, setCompanyName] = useState<string>("")
  const [appLang, setAppLang] = useState<string>("ar")

  useEffect(() => {
    const loadCompany = async () => {
      try {
        const cid = await getActiveCompanyId(supabase)
        if (cid) {
          const { data: company } = await supabase
            .from("companies")
            .select("name")
            .eq("id", cid)
            .maybeSingle()
          if (company) {
            setCompanyName(company.name || "")
          }
        }
      } catch {}
    }
    loadCompany()
    
    const lang = typeof window !== 'undefined' ? (localStorage.getItem('app_language') || 'ar') : 'ar'
    setAppLang(lang === 'en' ? 'en' : 'ar')
  }, [supabase])

  const handleGoToSettings = () => {
    router.push('/settings/profile')
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="max-w-2xl mx-auto">
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-lg">
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-4">
                <div className="p-4 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                  <Shield className="w-12 h-12 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
                {appLang === 'en' ? 'No Permissions Available' : 'لا توجد صلاحيات متاحة'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      {appLang === 'en' 
                        ? `You do not have permission to access any pages in the company "${companyName}". Please contact your company administrator to grant you the necessary permissions.`
                        : `ليس لديك صلاحية للوصول إلى أي صفحات في الشركة "${companyName}". يرجى التواصل مع مدير الشركة لمنحك الصلاحيات اللازمة.`}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {appLang === 'en' 
                    ? 'What you can do:'
                    : 'ما يمكنك فعله:'}
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400 ml-4">
                  <li>
                    {appLang === 'en' 
                      ? 'Contact your company administrator to request access permissions'
                      : 'التواصل مع مدير الشركة لطلب صلاحيات الوصول'}
                  </li>
                  <li>
                    {appLang === 'en' 
                      ? 'Switch to another company where you have permissions'
                      : 'التبديل إلى شركة أخرى لديك فيها صلاحيات'}
                  </li>
                  <li>
                    {appLang === 'en' 
                      ? 'Access your profile settings'
                      : 'الوصول إلى إعدادات ملفك الشخصي'}
                  </li>
                </ul>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleGoToSettings}
                  variant="outline"
                  className="flex-1"
                >
                  <ArrowLeft className="w-4 h-4 ml-2" />
                  {appLang === 'en' ? 'Go to Profile' : 'الذهاب إلى الملف الشخصي'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

