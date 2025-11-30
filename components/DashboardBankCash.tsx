"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Banknote, Filter } from "lucide-react"
import BankCashFilter from "@/components/BankCashFilter"
import { currencySymbols, getDisplayAmount } from "./DashboardAmounts"

interface BankAccount {
  id: string
  name: string
  balance: number
  display_opening_balance?: number | null
  display_currency?: string | null
}

interface AssetAccount {
  id: string
  account_code?: string
  account_name: string
  account_type?: string
  sub_type?: string
}

interface DashboardBankCashProps {
  bankAccounts: BankAccount[]
  assetAccountsData: AssetAccount[]
  selectedAccountIds: string[]
  selectedGroups: string[]
  fromDate: string
  toDate: string
  defaultCurrency: string
  appLang: string
}

export default function DashboardBankCash({
  bankAccounts,
  assetAccountsData,
  selectedAccountIds,
  selectedGroups,
  fromDate,
  toDate,
  defaultCurrency,
  appLang
}: DashboardBankCashProps) {
  const [appCurrency, setAppCurrency] = useState(defaultCurrency)

  useEffect(() => {
    const storedCurrency = localStorage.getItem('app_currency')
    if (storedCurrency) setAppCurrency(storedCurrency)

    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('app_currency')
      if (newCurrency) setAppCurrency(newCurrency)
    }

    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [])

  const currency = currencySymbols[appCurrency] || appCurrency
  const formatNumber = (n: number) => n.toLocaleString(appLang === 'en' ? 'en' : 'ar')

  const nameIncludes = (s: string | undefined, q: string) => String(s || "").toLowerCase().includes(q.toLowerCase())
  const rawById = new Map(assetAccountsData.map((a) => [a.id, a]))

  const matchesGroup = (accId: string): boolean => {
    const acc = rawById.get(accId)
    if (!acc) return true
    if (selectedAccountIds.length > 0) return selectedAccountIds.includes(accId)
    if (selectedGroups.length === 0) return true
    const isBank = String(acc.sub_type || "").toLowerCase() === "bank"
    const isCash = String(acc.sub_type || "").toLowerCase() === "cash"
    const isMainCash = isCash && (nameIncludes(acc.account_name, "الخزينة") || nameIncludes(acc.account_name, "نقد بالصندوق") || nameIncludes(acc.account_name, "main cash") || nameIncludes(acc.account_name, "cash in hand"))
    const isMainBank = isBank && (nameIncludes(acc.account_name, "رئيسي") || nameIncludes(acc.account_name, "main"))
    const isPetty = isCash && (nameIncludes(acc.account_name, "المبالغ الصغيرة") || nameIncludes(acc.account_name, "petty"))
    const isUndep = (nameIncludes(acc.account_name, "غير مودعة") || nameIncludes(acc.account_name, "undeposited"))
    const isShipWallet = (nameIncludes(acc.account_name, "بوسطة") || nameIncludes(acc.account_name, "byosta") || nameIncludes(acc.account_name, "الشحن") || nameIncludes(acc.account_name, "shipping"))
    const isOrdinaryCash = isCash && !isMainCash && !isPetty && !isUndep
    const isOrdinaryBank = isBank && !isMainBank && !isShipWallet
    return (
      (selectedGroups.includes("bank") && isOrdinaryBank) ||
      (selectedGroups.includes("main_bank") && isMainBank) ||
      (selectedGroups.includes("main_cash") && isMainCash) ||
      (selectedGroups.includes("petty") && isPetty) ||
      (selectedGroups.includes("undeposited") && isUndep) ||
      (selectedGroups.includes("shipping_wallet") && isShipWallet) ||
      (selectedGroups.includes("cash") && isOrdinaryCash)
    )
  }

  const list = bankAccounts.filter((a) => matchesGroup(a.id))

  // Get display amount for each account
  const getAccountDisplayAmount = (acc: BankAccount) => {
    return getDisplayAmount(acc.balance, acc.display_opening_balance, acc.display_currency, appCurrency)
  }

  return (
    <Card className="lg:col-span-1 bg-white dark:bg-slate-900 border-0 shadow-sm">
      <CardHeader className="border-b border-gray-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg">
            <Banknote className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          </div>
          <CardTitle className="text-base">{appLang === 'en' ? 'Cash & Bank' : 'النقد والبنك'}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {bankAccounts.length > 0 ? (
          <div className="space-y-4">
            <details className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                {appLang === 'en' ? 'Filter accounts' : 'فلترة الحسابات'}
              </summary>
              <div className="p-3 bg-white dark:bg-slate-900">
                <BankCashFilter fromDate={fromDate} toDate={toDate} selectedAccountIds={selectedAccountIds} accounts={assetAccountsData as any} />
              </div>
            </details>
            <div className="space-y-2 mt-3">
              {list.length > 0 ? (
                <>
                  {list.map((a) => {
                    const acc = rawById.get(a.id)
                    const label = acc?.account_name || a.name
                    const displayAmount = getAccountDisplayAmount(a)
                    return (
                      <div key={a.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                        <div className="flex items-center gap-2">
                          <Banknote className="w-4 h-4 text-teal-500" />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                        </div>
                        <span className="font-bold text-gray-900 dark:text-white">{formatNumber(displayAmount)} <span className="text-xs text-gray-400">{currency}</span></span>
                      </div>
                    )
                  })}
                  <div className="flex items-center justify-between p-3 bg-teal-50 dark:bg-teal-900/30 rounded-lg border border-teal-200 dark:border-teal-800 mt-3">
                    <span className="font-medium text-teal-700 dark:text-teal-300">{appLang === 'en' ? 'Total Balance' : 'إجمالي الرصيد'}</span>
                    <span className="font-bold text-teal-700 dark:text-teal-300">{formatNumber(list.reduce((sum, a) => sum + getAccountDisplayAmount(a), 0))} <span className="text-xs">{currency}</span></span>
                  </div>
                </>
              ) : (
                <div className="text-center py-4 text-gray-400">
                  <Banknote className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{appLang === 'en' ? 'No accounts match' : 'لا توجد حسابات مطابقة'}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-gray-400">
            <Banknote className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{appLang === 'en' ? 'No cash/bank accounts yet' : 'لا توجد حسابات نقد/بنك'}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

