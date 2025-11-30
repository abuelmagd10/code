"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Receipt, ShoppingCart } from "lucide-react"
import { currencySymbols, getDisplayAmount } from "./DashboardAmounts"

interface Invoice {
  id: string
  invoice_number?: string
  invoice_date?: string
  customer_id?: string
  total_amount?: number
  display_total?: number | null
  display_currency?: string | null
  status?: string
}

interface Bill {
  id: string
  bill_number?: string
  bill_date?: string
  supplier_id?: string
  total_amount?: number
  display_total?: number | null
  display_currency?: string | null
  status?: string
}

interface DashboardRecentListsProps {
  invoicesData: Invoice[]
  billsData: Bill[]
  customerNames: Record<string, string>
  supplierNames: Record<string, string>
  defaultCurrency: string
  appLang: string
}

export default function DashboardRecentLists({
  invoicesData,
  billsData,
  customerNames,
  supplierNames,
  defaultCurrency,
  appLang
}: DashboardRecentListsProps) {
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

  const formatNumber = (n: number) => n.toLocaleString(appLang === 'en' ? 'en' : 'ar')

  const statusColors: Record<string, string> = {
    paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    partially_paid: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
  }
  const statusLabels: Record<string, string> = appLang === 'en'
    ? { paid: 'Paid', partially_paid: 'Partial', sent: 'Sent', draft: 'Draft' }
    : { paid: 'مدفوعة', partially_paid: 'جزئية', sent: 'مرسلة', draft: 'مسودة' }

  const sortedInvoices = [...invoicesData].sort((a, b) => String(b.invoice_date || "").localeCompare(String(a.invoice_date || ""))).slice(0, 10)
  const sortedBills = [...billsData].sort((a, b) => String(b.bill_date || "").localeCompare(String(a.bill_date || ""))).slice(0, 10)

  return (
    <>
      {/* الفواتير الأخيرة */}
      <Card className="lg:col-span-1 bg-white dark:bg-slate-900 border-0 shadow-sm">
        <CardHeader className="border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Receipt className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle className="text-base">{appLang === 'en' ? 'Recent Invoices' : 'آخر الفواتير'}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {sortedInvoices.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {sortedInvoices.map((i) => {
                const name = i.customer_id ? (customerNames[i.customer_id] || "") : ""
                const label = i.invoice_number || i.id
                const displayAmount = getDisplayAmount(Number(i.total_amount || 0), i.display_total, i.display_currency, appCurrency)
                return (
                  <div key={i.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                    <div>
                      <a href={`/invoices/${i.id}`} className="text-sm font-medium text-blue-600 hover:underline">{label}</a>
                      <p className="text-xs text-gray-500 mt-0.5">{name}</p>
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-sm text-gray-900 dark:text-white">{formatNumber(displayAmount)}</p>
                      <Badge className={`text-[10px] mt-1 ${statusColors[i.status || ''] || statusColors.draft}`}>
                        {statusLabels[i.status || ''] || i.status}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-400">
              <Receipt className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{appLang === 'en' ? 'No invoices yet' : 'لا توجد فواتير'}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* المشتريات الأخيرة */}
      <Card className="lg:col-span-1 bg-white dark:bg-slate-900 border-0 shadow-sm">
        <CardHeader className="border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <ShoppingCart className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <CardTitle className="text-base">{appLang === 'en' ? 'Recent Purchases' : 'آخر المشتريات'}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {sortedBills.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {sortedBills.map((b) => {
                const name = b.supplier_id ? (supplierNames[b.supplier_id] || "") : ""
                const label = b.bill_number || b.id
                const displayAmount = getDisplayAmount(Number(b.total_amount || 0), b.display_total, b.display_currency, appCurrency)
                return (
                  <div key={b.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                    <div>
                      <a href={`/bills/${b.id}`} className="text-sm font-medium text-orange-600 hover:underline">{label}</a>
                      <p className="text-xs text-gray-500 mt-0.5">{name}</p>
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-sm text-gray-900 dark:text-white">{formatNumber(displayAmount)}</p>
                      <Badge className={`text-[10px] mt-1 ${statusColors[b.status || ''] || statusColors.draft}`}>
                        {statusLabels[b.status || ''] || b.status}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-400">
              <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{appLang === 'en' ? 'No purchases yet' : 'لا توجد مشتريات'}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

