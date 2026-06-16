'use client'

/**
 * DashboardCustomerSupplierBalances — v3.74.176
 *
 * Two side-by-side cards on the dashboard:
 *   - رصيد العملاء الدائن (Customer credit balance) → green
 *   - مستحقات لنا - سلفة مورد (Supplier advance) → purple
 *
 * Source numbers come straight from the operational ledgers, not from
 * GL deltas, so they mirror what /customers and /suppliers show. See
 * the widget docblock for the reasoning.
 */

import { Card, CardContent } from "@/components/ui/card"
import { Wallet, ArrowRightLeft } from "lucide-react"

interface DashboardCustomerSupplierBalancesProps {
  customerCreditBalance: number
  supplierAdvanceBalance: number
  currency: string
  appLang: "ar" | "en"
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export default function DashboardCustomerSupplierBalances({
  customerCreditBalance,
  supplierAdvanceBalance,
  currency,
  appLang,
}: DashboardCustomerSupplierBalancesProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
      {/* رصيد العملاء الدائن */}
      <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/50 border border-emerald-100 dark:border-emerald-900 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
              <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300 block truncate">
                {appLang === "en" ? "Customer Credit" : "رصيد العملاء الدائن"}
              </span>
              <span className="text-[10px] text-emerald-700/70 dark:text-emerald-300/70 block">
                {appLang === "en" ? "From customer_credit_ledger" : "من دفتر رصيد العملاء"}
              </span>
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
            {formatNumber(customerCreditBalance)}
          </p>
          <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">
            {currency}
            {customerCreditBalance <= 0 && (
              <span className="mr-1 text-emerald-500">
                · {appLang === "en" ? "No open credits" : "لا يوجد رصيد دائن"}
              </span>
            )}
          </p>
        </CardContent>
      </Card>

      {/* مستحقات لنا (سلفة مورد) */}
      <Card className="bg-gradient-to-br from-purple-50 to-fuchsia-50 dark:from-purple-950/50 dark:to-fuchsia-950/50 border border-purple-100 dark:border-purple-900 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
              <ArrowRightLeft className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300 block truncate">
                {appLang === "en" ? "Supplier Advance" : "مستحقات لنا (سلفة مورد)"}
              </span>
              <span className="text-[10px] text-purple-700/70 dark:text-purple-300/70 block">
                {appLang === "en" ? "From open vendor_credits" : "من إشعارات دائنة مفتوحة"}
              </span>
            </div>
          </div>
          <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
            {formatNumber(supplierAdvanceBalance)}
          </p>
          <p className="text-xs text-purple-600/70 dark:text-purple-400/70 mt-1">
            {currency}
            {supplierAdvanceBalance <= 0 && (
              <span className="mr-1 text-emerald-500">
                · {appLang === "en" ? "No open advances" : "لا يوجد سلف"}
              </span>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
