"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useSupabase } from "@/lib/supabase/hooks"
import { Plus, Eye, FileText, DollarSign, CheckCircle, Clock } from "lucide-react"
import { usePagination } from "@/lib/pagination"
import { DataPagination } from "@/components/data-pagination"
import { ListErrorBoundary } from "@/components/list-error-boundary"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { StatusBadge } from "@/components/DataTableFormatters"

type CustomerDebitNote = {
  id: string
  debit_note_number: string
  debit_note_date: string
  customer_id: string
  customer_name?: string
  total_amount: number
  applied_amount: number
  status: string
  approval_status: string
  reference_type: string
}

export default function CustomerDebitNotesPage() {
  const supabase = useSupabase()
  const [debitNotes, setDebitNotes] = useState<CustomerDebitNote[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [searchQuery, setSearchQuery] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [currencySymbol, setCurrencySymbol] = useState('EGP')

  // تهيئة اللغة بعد hydration
  useEffect(() => {
    try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch { }
  }, [])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: member } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', user.id)
      .single()

    if (!member?.company_id) return
    setCompanyId(member.company_id)

    // Load debit notes with customer info
    const { data: notes } = await supabase
      .from('customer_debit_notes')
      .select(`
        id,
        debit_note_number,
        debit_note_date,
        customer_id,
        total_amount,
        applied_amount,
        status,
        approval_status,
        reference_type,
        customers (name)
      `)
      .eq('company_id', member.company_id)
      .order('debit_note_date', { ascending: false })

    const formattedNotes = (notes || []).map((note: any) => ({
      ...note,
      customer_name: note.customers?.name || 'Unknown'
    }))

    setDebitNotes(formattedNotes)

    // Load currency
    const { data: company } = await supabase
      .from('companies')
      .select('default_currency_id, currencies(code)')
      .eq('id', member.company_id)
      .single()

    if (company?.currencies?.code) {
      setCurrencySymbol(company.currencies.code)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Filtered debit notes
  const filteredNotes = useMemo(() => {
    return debitNotes.filter((note) => {
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const noteNumber = (note.debit_note_number || '').toLowerCase()
        const customerName = (note.customer_name || '').toLowerCase()
        if (!noteNumber.includes(q) && !customerName.includes(q)) return false
      }
      return true
    })
  }, [debitNotes, searchQuery])

  // Pagination
  const {
    currentPage,
    totalPages,
    totalItems,
    paginatedItems: paginatedNotes,
    goToPage,
  } = usePagination(filteredNotes, { pageSize })

  // Statistics
  const stats = useMemo(() => {
    const total = filteredNotes.length
    const draft = filteredNotes.filter(n => n.approval_status === 'draft').length
    const pending = filteredNotes.filter(n => n.approval_status === 'pending_approval').length
    const approved = filteredNotes.filter(n => n.approval_status === 'approved').length
    const applied = filteredNotes.filter(n => n.status === 'applied').length
    const totalAmount = filteredNotes.reduce((sum, n) => sum + (n.total_amount || 0), 0)
    const totalApplied = filteredNotes.reduce((sum, n) => sum + (n.applied_amount || 0), 0)
    return { total, draft, pending, approved, applied, totalAmount, totalApplied }
  }, [filteredNotes])

  // Get status badge
  const getApprovalStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <StatusBadge status="draft" label={appLang === 'en' ? 'Draft' : 'مسودة'} variant="secondary" />
      case 'pending_approval':
        return <StatusBadge status="pending" label={appLang === 'en' ? 'Pending' : 'قيد الموافقة'} variant="warning" />
      case 'approved':
        return <StatusBadge status="approved" label={appLang === 'en' ? 'Approved' : 'موافق عليه'} variant="success" />
      case 'rejected':
        return <StatusBadge status="rejected" label={appLang === 'en' ? 'Rejected' : 'مرفوض'} variant="destructive" />
      default:
        return <StatusBadge status={status} label={status} variant="secondary" />
    }
  }

  // Table columns
  const tableColumns: DataTableColumn<CustomerDebitNote>[] = useMemo(() => [
    {
      key: 'debit_note_number',
      header: appLang === 'en' ? 'Debit Note #' : 'رقم الإشعار',
      type: 'text',
      align: 'left',
      width: 'w-32'
    },
    {
      key: 'debit_note_date',
      header: appLang === 'en' ? 'Date' : 'التاريخ',
      type: 'date',
      align: 'right',
      width: 'w-28',
      format: (value) => new Date(value).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')
    },
    {
      key: 'customer_name',
      header: appLang === 'en' ? 'Customer' : 'العميل',
      type: 'text',
      align: 'left',
      width: 'flex-1'
    },
    {
      key: 'reference_type',
      header: appLang === 'en' ? 'Type' : 'النوع',
      type: 'text',
      align: 'center',
      width: 'w-32',
      format: (value) => {
        const types: Record<string, { en: string; ar: string }> = {
          additional_fees: { en: 'Additional Fees', ar: 'رسوم إضافية' },
          price_difference: { en: 'Price Difference', ar: 'فرق سعر' },
          penalty: { en: 'Penalty', ar: 'غرامة' },
          correction: { en: 'Correction', ar: 'تصحيح' }
        }
        return types[value]?.[appLang] || value
      }
    },
    {
      key: 'total_amount',
      header: appLang === 'en' ? 'Amount' : 'المبلغ',
      type: 'currency',
      align: 'right',
      width: 'w-32',
      format: (value) => `${value.toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG', { minimumFractionDigits: 2 })} ${currencySymbol}`
    },
    {
      key: 'applied_amount',
      header: appLang === 'en' ? 'Applied' : 'المطبق',
      type: 'currency',
      align: 'right',
      width: 'w-32',
      format: (value) => `${value.toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG', { minimumFractionDigits: 2 })} ${currencySymbol}`
    },
    {
      key: 'approval_status',
      header: appLang === 'en' ? 'Status' : 'الحالة',
      type: 'status',
      align: 'center',
      width: 'w-32',
      format: (value) => getApprovalStatusBadge(value)
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Actions' : 'إجراءات',
      type: 'actions',
      align: 'center',
      width: 'w-24',
      format: (value) => (
        <Link href={`/customer-debit-notes/${value}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8" title={appLang === 'en' ? 'View' : 'عرض'}>
            <Eye className="h-4 w-4 text-gray-500" />
          </Button>
        </Link>
      )
    }
  ], [appLang, currencySymbol])

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        <ListErrorBoundary>
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                {appLang === 'en' ? 'Customer Debit Notes' : 'إشعارات مدين العملاء'}
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {appLang === 'en' ? 'Manage additional charges to customers' : 'إدارة الرسوم الإضافية للعملاء'}
              </p>
            </div>
            <Link href="/customer-debit-notes/new">
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                {appLang === 'en' ? 'New Debit Note' : 'إشعار جديد'}
              </Button>
            </Link>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Total Notes' : 'إجمالي الإشعارات'}</p>
                    <p className="text-2xl font-bold">{stats.total}</p>
                  </div>
                  <FileText className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Pending Approval' : 'قيد الموافقة'}</p>
                    <p className="text-2xl font-bold">{stats.pending}</p>
                  </div>
                  <Clock className="h-8 w-8 text-yellow-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Approved' : 'موافق عليه'}</p>
                    <p className="text-2xl font-bold">{stats.approved}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Total Amount' : 'المبلغ الإجمالي'}</p>
                    <p className="text-xl font-bold">{stats.totalAmount.toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG', { minimumFractionDigits: 2 })} {currencySymbol}</p>
                  </div>
                  <DollarSign className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <Card className="mb-4 dark:bg-slate-900 dark:border-slate-800">
            <CardContent className="pt-6">
              <Input
                placeholder={appLang === 'en' ? 'Search by debit note number or customer...' : 'بحث برقم الإشعار أو العميل...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-md"
              />
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  {appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}
                </div>
              ) : (
                <>
                  <DataTable
                    columns={tableColumns}
                    data={paginatedNotes}
                    keyField="id"
                    lang={appLang}
                    minWidth="min-w-[800px]"
                    emptyMessage={appLang === 'en' ? 'No debit notes found' : 'لا توجد إشعارات'}
                  />
                  {filteredNotes.length > 0 && (
                    <DataPagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={totalItems}
                      pageSize={pageSize}
                      onPageChange={goToPage}
                      onPageSizeChange={setPageSize}
                      lang={appLang}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </ListErrorBoundary>
      </main>
    </div>
  )
}

