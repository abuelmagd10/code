'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Eye, FileText, DollarSign, CheckCircle, Clock } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CompanyHeader } from '@/components/company-header'
import { getActiveCompanyId } from '@/lib/company'
import { usePagination } from '@/lib/pagination'
import { DataPagination } from '@/components/data-pagination'
import { ListErrorBoundary } from '@/components/list-error-boundary'
import { PageHeaderList } from '@/components/PageHeader'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { StatusBadge } from '@/components/DataTableFormatters'

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
  const router = useRouter()
  const supabase = createClient()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [debitNotes, setDebitNotes] = useState<CustomerDebitNote[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [pageSize, setPageSize] = useState(20)
  const [currencySymbol, setCurrencySymbol] = useState('EGP')

  useEffect(() => {
    const lang = localStorage.getItem('appLanguage') as 'ar' | 'en' || 'ar'
    setAppLang(lang)
    loadData()
  }, [])

  async function loadData() {
    setIsLoading(true)
    const loadedCompanyId = await getActiveCompanyId()
    if (!loadedCompanyId) {
      router.push('/dashboard')
      return
    }
    setCompanyId(loadedCompanyId)

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
      .eq('company_id', loadedCompanyId)
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
      .eq('id', loadedCompanyId)
      .single()

    if (company?.currencies?.code) {
      setCurrencySymbol(company.currencies.code)
    }

    setIsLoading(false)
  }

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
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      <CompanyHeader />
      <main className="container mx-auto px-4 py-6 max-w-7xl">
        <ListErrorBoundary>
          {/* Header */}
          <PageHeaderList
            title={appLang === 'en' ? 'Customer Debit Notes' : 'إشعارات مدين العملاء'}
            description={appLang === 'en' ? 'Manage additional charges to customers' : 'إدارة الرسوم الإضافية للعملاء'}
            icon={FileText}
            actions={
              <Link href="/customer-debit-notes/new">
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  {appLang === 'en' ? 'New Debit Note' : 'إشعار جديد'}
                </Button>
              </Link>
            }
          />

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
          <Card className="mb-6">
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
          <Card>
            <CardContent className="p-0">
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
            </CardContent>
          </Card>
        </ListErrorBoundary>
      </main>
    </div>
  )
}

