"use client"

import { useEffect, useState } from "react"
import { useSupabase } from "@/lib/supabase/hooks"

export function CompanyHeader() {
  const supabase = useSupabase()
  const [name, setName] = useState<string>("")
  const [address, setAddress] = useState<string>("")
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    const loadCompany = async () => {
      try {
        setLoading(true)
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return
        const { data: company } = await supabase
          .from("companies")
          .select("name, address")
          .eq("user_id", user.id)
          .single()
        if (company) {
          setName(company.name || "")
          setAddress(company.address || "")
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
    <div className="rounded border bg-white dark:bg-slate-900 p-4 mb-4">
      <div className="font-semibold text-gray-900 dark:text-white">{name}</div>
      {address && <div className="text-sm text-gray-600 dark:text-gray-400">{address}</div>}
    </div>
  )
}

