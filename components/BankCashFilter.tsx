"use client"
import React from "react"

export default function BankCashFilter({ fromDate, toDate, selectedGroups, hasGroupFilter }: { fromDate: string; toDate: string; selectedGroups: string[]; hasGroupFilter?: boolean }) {
  const groups = [
    { key: "petty", label: "المبالغ الصغيرة" },
    { key: "undeposited", label: "أموال غير مودعة" },
    { key: "shipping_wallet", label: "رصيد حساب بوسطة للشحن" },
    { key: "bank", label: "حساب بنكي" },
    { key: "main_cash", label: "الخزينة الرئيسية (نقد بالصندوق)" },
    { key: "main_bank", label: "حساب بنكي رئيسي للشركة" },
  ]

  const isChecked = (key: string) => (hasGroupFilter ? selectedGroups.includes(key) : false)

  return (
    <form method="get" action="/dashboard" className="space-y-2">
      {fromDate && <input type="hidden" name="from" value={fromDate} />}
      {toDate && <input type="hidden" name="to" value={toDate} />}
      <div className="grid grid-cols-1 gap-2">
        {groups.map((g) => (
          <label key={g.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="group" value={g.key} defaultChecked={isChecked(g.key)} />
            <span className="text-gray-700 dark:text-gray-300">{g.label}</span>
          </label>
        ))}
      </div>
      <button type="submit" className="mt-2 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">تطبيق</button>
    </form>
  )
}

