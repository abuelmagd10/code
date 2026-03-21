/**
 * RecentListsWidget — Async Server Component
 * يجلب أحدث الفواتير والمشتريات (آخر 20) بشكل مستقل
 */
import { createClient } from "@/lib/supabase/server"
import DashboardRecentLists from "@/components/DashboardRecentLists"

interface RecentListsWidgetProps {
  companyId: string
  currency: string
  appLang: 'ar' | 'en'
  fromDate: string
  toDate: string
  branchId?: string | null
}

export default async function RecentListsWidget({
  companyId, currency, appLang, fromDate, toDate, branchId
}: RecentListsWidgetProps) {
  const supabase = await createClient()

  const now = new Date()
  const from = fromDate || `${now.getFullYear()}-01-01`
  const to   = toDate   || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  // جلب آخر 20 فاتورة مبيعات
  let invQ = supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, customer_id, total_amount, display_total, display_currency, display_rate, status')
    .eq('company_id', companyId)
    .in('status', ['sent', 'partially_paid', 'paid'])
    .gte('invoice_date', from)
    .lte('invoice_date', to)
    .order('invoice_date', { ascending: false })
    .limit(20)
  if (branchId) invQ = invQ.eq('branch_id', branchId)
  const { data: invoicesData } = await invQ

  // جلب آخر 20 فاتورة شراء
  let billQ = supabase
    .from('bills')
    .select('id, bill_number, bill_date, supplier_id, total_amount, display_total, display_currency, display_rate, status')
    .eq('company_id', companyId)
    .in('status', ['sent', 'partially_paid', 'paid'])
    .gte('bill_date', from)
    .lte('bill_date', to)
    .order('bill_date', { ascending: false })
    .limit(20)
  if (branchId) billQ = billQ.eq('branch_id', branchId)
  const { data: billsData } = await billQ

  // جلب أسماء العملاء
  const customerIds = [...new Set((invoicesData || []).map((i: any) => i.customer_id).filter(Boolean))]
  const supplierIds = [...new Set((billsData   || []).map((b: any) => b.supplier_id).filter(Boolean))]

  const customerNames: Record<string, string> = {}
  const supplierNames: Record<string, string> = {}

  if (customerIds.length > 0) {
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name')
      .in('id', customerIds)
    for (const c of customers || []) customerNames[c.id] = c.name
  }

  if (supplierIds.length > 0) {
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('id, name')
      .in('id', supplierIds)
    for (const s of suppliers || []) supplierNames[s.id] = s.name
  }

  return (
    <DashboardRecentLists
      invoicesData={invoicesData || []}
      billsData={billsData || []}
      customerNames={customerNames}
      supplierNames={supplierNames}
      defaultCurrency={currency}
      appLang={appLang}
    />
  )
}
