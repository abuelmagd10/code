"use client"
import React, { useRef } from "react"

export default function BankCashFilter({ fromDate, toDate, selectedAccountIds = [], accounts = [] }: { fromDate: string; toDate: string; selectedAccountIds?: string[]; accounts?: Array<{ id: string; account_code?: string; account_name?: string; sub_type?: string }> }) {
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form ref={formRef} method="get" action="/dashboard" className="space-y-2">
      {fromDate && <input type="hidden" name="from" value={fromDate} />}
      {toDate && <input type="hidden" name="to" value={toDate} />}
      <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto border rounded p-2">
        {(accounts || []).map((a) => {
          const label = [a.account_code || "", a.account_name || ""].filter(Boolean).join(" - ")
          const checked = selectedAccountIds.includes(a.id)
          return (
            <label key={a.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="acct[]" value={a.id} defaultChecked={checked} />
              <span className="text-gray-700 dark:text-gray-300">{label}</span>
            </label>
          )
        })}
        {(!accounts || accounts.length === 0) && (
          <div className="text-xs text-gray-500">لا توجد حسابات نقد/بنك. أضفها من الشجرة المحاسبية.</div>
        )}
      </div>
      <button type="submit" className="mt-2 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">تطبيق</button>
    </form>
  )
}

