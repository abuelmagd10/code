"use client"

import { useState, useEffect } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { 
  FileText, ListChecks, History, Activity, 
  CheckCircle2, XCircle, Clock, UserCircle, AlertCircle
} from "lucide-react"

interface PaymentDetailsModalProps {
  paymentId: string | null
  isOpen: boolean
  onClose: () => void
  appLang: 'ar' | 'en'
}

export function PaymentDetailsModal({ paymentId, isOpen, onClose, appLang }: PaymentDetailsModalProps) {
  const supabase = useSupabase()
  const [loading, setLoading] = useState(true)
  
  const [payment, setPayment] = useState<any>(null)
  const [allocations, setAllocations] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  
  useEffect(() => {
    if (!paymentId || !isOpen) return

    async function fetchData() {
      setLoading(true)
      try {
        // 1. Fetch Payment details with relations
        const { data: pData } = await supabase
          .from("payments")
          .select(`
            *,
            supplier:suppliers(name),
            customer:customers(name),
            account:chart_of_accounts(account_name)
          `)
          .eq("id", paymentId)
          .single()
        
        setPayment(pData)

        // 2. Fetch Allocations
        const { data: allocData } = await supabase
          .from("payment_allocations")
          .select(`
            id, allocated_amount, created_at,
            bill:bills(bill_number, total_amount, status),
            invoice:invoices(invoice_number, total_amount, status)
          `)
          .eq("payment_id", paymentId)
          .order("created_at", { ascending: true })
          
        setAllocations(allocData || [])

        // 3. Fetch Audit Logs with User Names (requires join or separate fetch if auth.users is restricted)
        // Note: Using RPC or just fetching logs and falling back to IDs if users table isn't accessible
        const { data: logsData } = await supabase
          .from("payment_audit_logs")
          .select("*")
          .eq("payment_id", paymentId)
          .order("created_at", { ascending: false })
          
        // Fetch user profiles for the logs if possible (we assume there's a profiles or company_members we can use)
        // Since we don't know the full schema of users, we'll try to fetch company_members for names.
        if (logsData && logsData.length > 0) {
          const userIds = [...new Set(logsData.map(l => l.changed_by).filter(Boolean))]
          if (userIds.length > 0) {
            const { data: members } = await supabase
              .from("company_members")
              .select("user_id, profile:profiles(full_name)")
              .in("user_id", userIds)
              .catch(() => ({ data: [] })) // Safe fail
              
            const userMap = new Map()
            members?.forEach((m: any) => {
              if (m.profile?.full_name) userMap.set(m.user_id, m.profile.full_name)
            })
            
            logsData.forEach(l => {
              l.user_name = userMap.get(l.changed_by) || l.changed_by
            })
          }
        }

        setAuditLogs(logsData || [])
      } catch (err) {
        console.error("Error fetching payment details:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [paymentId, isOpen, supabase])

  if (!isOpen) return null

  const formatAmount = (amt: number | null | undefined) => {
    return (amt || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-green-100 text-green-800 border-green-200">{appLang === 'en' ? 'Approved' : 'معتمد'}</Badge>
      case 'rejected': return <Badge className="bg-red-100 text-red-800 border-red-200">{appLang === 'en' ? 'Rejected' : 'مرفوض'}</Badge>
      case 'pending_manager': return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 px-2 py-1 flex items-center gap-1"><Clock className="w-3 h-3"/> {appLang === 'en' ? 'Pending Manager' : 'بانتظار الإدارة'}</Badge>
      case 'pending_director': return <Badge className="bg-purple-100 text-purple-800 border-purple-200 px-2 py-1 flex items-center gap-1"><Clock className="w-3 h-3"/> {appLang === 'en' ? 'Pending Director' : 'بانتظار المدير العام'}</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  // Derive Approval Trail from Audit Logs
  const approvalTrail = auditLogs
    .filter(log => log.action.includes('CREATE') || log.action.includes('APPROVE') || log.action.includes('REJECT'))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
        <DialogHeader className="p-6 pb-4 border-b bg-white dark:bg-slate-900 shadow-sm flex-shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <DialogTitle className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                {appLang === 'en' ? 'Payment Details' : 'تفاصيل الدفعة المالية'}
                <span className="text-sm font-normal text-slate-500 ml-2">#{payment?.id?.substring(0,8)}</span>
              </DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-2">
                <span>{payment?.payment_date}</span>
                <span>•</span>
                <span>{payment?.supplier?.name || payment?.customer?.name || (appLang === 'en' ? 'General' : 'عام')}</span>
              </DialogDescription>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                {formatAmount(payment?.amount)} <span className="text-base font-normal text-slate-500">{payment?.currency_code || 'SAR'}</span>
              </div>
              <div className="mt-2 flex justify-end">
                {renderStatusBadge(payment?.status)}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <RefreshCcw className="w-8 h-8 animate-spin text-slate-400" />
            </div>
          ) : (
            <Tabs defaultValue="overview" className="flex-1 flex flex-col w-full h-full">
              <div className="border-b bg-white dark:bg-slate-900 px-6 flex-shrink-0">
                <TabsList className="bg-transparent border-0 p-0 h-12 w-full justify-start gap-6">
                  <TabsTrigger 
                    value="overview" 
                    className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none py-3 px-1 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-400 flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    {appLang === 'en' ? 'Overview' : 'نظرة عامة'}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="allocations" 
                    className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none py-3 px-1 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-400 flex items-center gap-2"
                  >
                    <ListChecks className="w-4 h-4" />
                    {appLang === 'en' ? 'Allocations' : 'التوزيع المالي'}
                    {(allocations?.length || 0) > 0 && (
                      <Badge className="ml-1 px-1.5 py-0 min-w-5 h-5 flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-slate-200">
                        {allocations.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="approval" 
                    className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none py-3 px-1 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-400 flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {appLang === 'en' ? 'Approval Trail' : 'مسار الاعتماد'}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="audit" 
                    className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none py-3 px-1 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-400 flex items-center gap-2"
                  >
                    <History className="w-4 h-4" />
                    {appLang === 'en' ? 'Audit Log' : 'سجل التعديلات'}
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950">
                
                {/* 1. OVERVIEW TAB */}
                <TabsContent value="overview" className="mt-0 h-full">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-8">
                    {/* Primary Details Card */}
                    <div className="bg-white dark:bg-slate-900 border rounded-xl shadow-sm overflow-hidden">
                      <div className="border-b bg-slate-50/50 dark:bg-slate-800/50 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-500" />
                        {appLang === 'en' ? 'Transaction Details' : 'تفاصيل الحركة'}
                      </div>
                      <div className="p-4 grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                        <div>
                          <p className="text-slate-500 mb-1">{appLang === 'en' ? 'Payment Method' : 'طريقة الدفع'}</p>
                          <p className="font-medium">{payment?.payment_method === 'cash' ? (appLang === 'en' ? 'Cash' : 'نقداً') : (appLang === 'en' ? 'Bank Transfer' : 'حوالة بنكية')}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 mb-1">{appLang === 'en' ? 'Reference' : 'المرجع'}</p>
                          <p className="font-medium">{payment?.reference || '—'}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-slate-500 mb-1">{appLang === 'en' ? 'Account' : 'الحساب المالي'}</p>
                          <p className="font-medium bg-slate-100 dark:bg-slate-800 inline-block px-2 py-1 rounded">{payment?.account?.account_name || 'N/A'}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-slate-500 mb-1">{appLang === 'en' ? 'Notes' : 'الملاحظات'}</p>
                          <p className="font-medium text-slate-700 dark:text-slate-300">{payment?.notes || '—'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Financial Translation Card */}
                    <div className="bg-white dark:bg-slate-900 border rounded-xl shadow-sm overflow-hidden">
                      <div className="border-b bg-slate-50/50 dark:bg-slate-800/50 px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-500" />
                        {appLang === 'en' ? 'Financial Context' : 'السياق المالي (FX & Allocation)'}
                      </div>
                      <div className="p-4 grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                        <div>
                          <p className="text-slate-500 mb-1">{appLang === 'en' ? 'Currency Used' : 'عملة الدفع'}</p>
                          <p className="font-bold text-blue-700 dark:text-blue-400">{payment?.currency_code || 'SAR'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 mb-1">{appLang === 'en' ? 'Exchange Rate' : 'سعر الصرف'}</p>
                          <p className="font-medium">{payment?.exchange_rate_used || payment?.exchange_rate || 1.0}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 mb-1">{appLang === 'en' ? 'Base Currency Amt' : 'المعادل بالعملة الأساسية'}</p>
                          <p className="font-medium">
                            {formatAmount(payment?.base_currency_amount || (payment?.amount * (payment?.exchange_rate_used || payment?.exchange_rate || 1)))}
                          </p>
                        </div>
                        
                        <div className="col-span-2 pt-4 border-t mt-2">
                          <p className="text-slate-500 mb-1">{appLang === 'en' ? 'Unallocated Amount (Advance)' : 'المبلغ غير الموزع (رصيد مقدم)'}</p>
                          <div className={`text-xl font-bold ${payment?.unallocated_amount > 0 ? 'text-green-600' : 'text-slate-700 dark:text-slate-300'}`}>
                            {formatAmount(payment?.unallocated_amount)}
                          </div>
                          {payment?.unallocated_amount > 0 && (
                            <p className="text-xs text-slate-500 mt-1">
                              {appLang === 'en' ? 'This amount can be allocated to future bills.' : 'هذا المبلغ يعتبر سلفة يمكن توزيعه على فواتير مستقبلية.'}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* 2. ALLOCATIONS TAB */}
                <TabsContent value="allocations" className="mt-0 h-full">
                  <div className="bg-white dark:bg-slate-900 border rounded-xl shadow-sm overflow-hidden">
                    <table className="w-full text-sm text-left rtl:text-right">
                      <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/80 border-b">
                        <tr>
                          <th className="px-6 py-4">{appLang === 'en' ? 'Document Type' : 'نوع المستند'}</th>
                          <th className="px-6 py-4">{appLang === 'en' ? 'Document Number' : 'رقم المستند'}</th>
                          <th className="px-6 py-4 text-right">{appLang === 'en' ? 'Doc Total' : 'إجمالي المستند'}</th>
                          <th className="px-6 py-4 text-right">{appLang === 'en' ? 'Allocated Amount' : 'المبلغ الموزع من هذه الدفعة'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {allocations.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                              <AlertCircle className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                              {appLang === 'en' ? 'No allocations found. This was a direct journal payment or advance.' : 'لم يتم توزيع الدفعة على فواتير محددة (سداد مباشر أو سلفة).'}
                            </td>
                          </tr>
                        ) : (
                          allocations.map((alloc) => {
                            const doc = alloc.bill || alloc.invoice;
                            const isBill = !!alloc.bill;
                            return (
                              <tr key={alloc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <td className="px-6 py-4 font-medium">
                                  {isBill ? (appLang === 'en' ? 'Supplier Bill' : 'فاتورة مورد') : (appLang === 'en' ? 'Customer Invoice' : 'فاتورة مبيعات')}
                                </td>
                                <td className="px-6 py-4">
                                  <Badge variant="outline" className="font-mono">{doc?.bill_number || doc?.invoice_number || 'N/A'}</Badge>
                                </td>
                                <td className="px-6 py-4 text-right">{formatAmount(doc?.total_amount)}</td>
                                <td className="px-6 py-4 text-right font-bold text-blue-600 dark:text-blue-400">
                                  {formatAmount(alloc.allocated_amount)}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                      {allocations.length > 0 && (
                        <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-semibold border-t-2">
                          <tr>
                            <td colSpan={3} className="px-6 py-4 text-right">{appLang === 'en' ? 'Total Allocated:' : 'إجمالي الموزع:'}</td>
                            <td className="px-6 py-4 text-right text-lg text-emerald-600">
                              {formatAmount(allocations.reduce((acc, a) => acc + (a.allocated_amount || 0), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </TabsContent>

                {/* 3. APPROVAL TRAIL TAB */}
                <TabsContent value="approval" className="mt-0 h-full">
                  <div className="max-w-2xl mx-auto py-8">
                    <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-4 rtl:mr-4 rtl:ml-0 rtl:border-l-0 rtl:border-r-2 space-y-8">
                      {approvalTrail.length === 0 ? (
                        <div className="pl-8 rtl:pr-8 text-slate-500 text-center py-4">
                          {appLang === 'en' ? 'No approval trail available.' : 'لا يوجد مسار زمني للاعتماد.'}
                        </div>
                      ) : (
                        approvalTrail.map((log, index) => {
                          const isCreate = log.action.includes('CREATE');
                          const isReject = log.action.includes('REJECT');
                          const isApprove = log.action.includes('APPROVE');
                          
                          let Icon = Activity;
                          let iconColor = "bg-blue-100 text-blue-600";
                          let title = log.action;
                          
                          if (isCreate) { Icon = FileText; iconColor = "bg-slate-200 text-slate-600"; title = appLang === 'en' ? 'Payment Created' : 'تم إنشاء الدفعة'; }
                          else if (isApprove) { Icon = CheckCircle2; iconColor = "bg-green-100 text-green-600"; title = appLang === 'en' ? `Approved (${log.action})` : `تم الاعتماد (${log.action})`; }
                          else if (isReject) { Icon = XCircle; iconColor = "bg-red-100 text-red-600"; title = appLang === 'en' ? 'Rejected' : 'تم الرفض'; }

                          return (
                            <div key={log.id} className="relative pl-8 rtl:pr-8 rtl:pl-0">
                              {/* Connector Ring */}
                              <div className={`absolute -left-[17px] rtl:-right-[17px] rtl:left-auto top-1 p-1 rounded-full bg-white dark:bg-slate-950 border-2 border-white dark:border-slate-950`}>
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${iconColor}`}>
                                  <Icon className="w-3.5 h-3.5" />
                                </div>
                              </div>
                              
                              <div className="bg-white dark:bg-slate-900 border rounded-lg p-4 shadow-sm">
                                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">{title}</h4>
                                <div className="flex items-center gap-4 text-sm text-slate-500">
                                  <span className="flex items-center gap-1"><UserCircle className="w-4 h-4" /> {log.user_name || 'System User'}</span>
                                  <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {new Date(log.created_at).toLocaleString(appLang === 'ar' ? 'ar-SA' : 'en-US')}</span>
                                </div>
                                {isReject && log.new_values?.rejection_reason && (
                                  <div className="mt-3 bg-red-50 text-red-700 p-3 rounded text-sm border border-red-100">
                                    <span className="font-bold">{appLang === 'en' ? 'Reason: ' : 'السبب: '}</span>
                                    {log.new_values.rejection_reason}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* 4. AUDIT LOG TAB */}
                <TabsContent value="audit" className="mt-0 h-full">
                  <div className="bg-white dark:bg-slate-900 border rounded-xl shadow-sm overflow-hidden mb-8">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left rtl:text-right">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800/80 border-b">
                          <tr>
                            <th className="px-4 py-3">{appLang === 'en' ? 'Timestamp' : 'الوقت'}</th>
                            <th className="px-4 py-3">{appLang === 'en' ? 'Action' : 'العملية'}</th>
                            <th className="px-4 py-3">{appLang === 'en' ? 'User' : 'المستخدم'}</th>
                            <th className="px-4 py-3 max-w-[200px]">{appLang === 'en' ? 'Old Values' : 'القيم القديمة'}</th>
                            <th className="px-4 py-3 max-w-[200px]">{appLang === 'en' ? 'New Values' : 'القيم الجديدة'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {auditLogs.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                {appLang === 'en' ? 'No audit records found.' : 'لا يوجد سجل تعديلات.'}
                              </td>
                            </tr>
                          ) : (
                            auditLogs.map((log) => (
                              <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                                  {new Date(log.created_at).toLocaleString()}
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant="secondary" className="font-mono text-[10px]">{log.action}</Badge>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {log.user_name || log.changed_by?.substring(0,8) || 'System'}
                                </td>
                                <td className="px-4 py-3 text-xs">
                                  {log.old_values ? (
                                    <div className="max-h-24 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-2 rounded border font-mono">
                                      {JSON.stringify(log.old_values, null, 2)}
                                    </div>
                                  ) : <span className="text-slate-300">—</span>}
                                </td>
                                <td className="px-4 py-3 text-xs">
                                  {log.new_values ? (
                                    <div className="max-h-24 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-2 rounded border font-mono">
                                      {JSON.stringify(log.new_values, null, 2)}
                                    </div>
                                  ) : <span className="text-slate-300">—</span>}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </TabsContent>

              </div>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
