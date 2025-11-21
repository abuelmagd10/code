"use client"

import { useEffect, useState } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"

export function CompanyHeader() {
  const supabase = useSupabase()
  const [name, setName] = useState<string>("")
  const [address, setAddress] = useState<string>("")
  const [loading, setLoading] = useState<boolean>(true)
  const [logoUrl, setLogoUrl] = useState<string>("")

  useEffect(() => {
    const loadCompany = async () => {
      try {
        setLoading(true)
        const cid = await getActiveCompanyId(supabase)
        if (!cid) return
        const { data: company } = await supabase
          .from("companies")
          .select("name, address")
          .eq("id", cid)
          .maybeSingle()
        if (company) {
          setName(company.name || "")
          setAddress(company.address || "")
          const lu = (typeof window !== 'undefined' ? localStorage.getItem('company_logo_url') : '') || ''
          setLogoUrl(lu || '')
        }
      } finally {
        setLoading(false)
      }
    }
    loadCompany()
  }, [supabase])

  if (loading) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">جاري تحميل بيانات الشركة...</div>
    )
  }

  if (!name && !address) {
    return null
  }

  return (
    <div className="rounded border bg-white dark:bg-slate-900 p-4 mb-4 flex items-center gap-3">
      {logoUrl ? <img src={logoUrl} alt="Logo" className="h-10 w-10 rounded object-cover border" /> : null}
      <div>
        <div className="font-semibold text-gray-900 dark:text-white">{name}</div>
        {address && <div className="text-sm text-gray-600 dark:text-gray-400">{address}</div>}
      </div>
    </div>
  )
}

