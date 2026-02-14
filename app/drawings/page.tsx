"use client"

import { useEffect, useState, useCallback } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Plus, DollarSign, Eye } from "lucide-react"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { PageHeaderList } from "@/components/PageHeader"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { getDrawings } from "@/app/actions/drawings"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

export default function DrawingsPage() {
    const supabase = useSupabase()
    const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
    const [hydrated, setHydrated] = useState(false)
    const [loading, setLoading] = useState<boolean>(true)
    const [drawings, setDrawings] = useState<any[]>([])

    useEffect(() => {
        setHydrated(true)
        const handler = () => {
            try {
                const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
                setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
            } catch { }
        }
        handler()
        window.addEventListener('app_language_changed', handler)
        return () => { window.removeEventListener('app_language_changed', handler) }
    }, [])

    const loadDrawings = useCallback(async () => {
        try {
            setLoading(true)
            const companyId = await getActiveCompanyId(supabase)
            if (!companyId) {
                setLoading(false)
                return
            }

            const data = await getDrawings(companyId)
            setDrawings(data || [])
        } catch (error) {
            console.error("Error loading drawings:", error)
        } finally {
            setLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        loadDrawings()
    }, [loadDrawings])

    const tableColumns: DataTableColumn<any>[] = [
        {
            key: "drawing_date",
            header: appLang === 'en' ? "Date" : "التاريخ",
            sortable: true,
            format: (value, row) => new Date(row.drawing_date).toLocaleDateString(appLang === 'en' ? "en-US" : "ar-EG")
        },
        {
            key: "shareholder",
            header: appLang === 'en' ? "Shareholder" : "المساهم",
            sortable: true,
            format: (value, row) => row.shareholders?.name || "-"
        },
        {
            key: "journal_entry_id",
            header: appLang === 'en' ? "Journal Hint" : "رقم القيد",
            sortable: true,
            format: (value, row) => row.journal_entries?.entry_number ? (
                <Link href={`/journal-entries/${row.journal_entry_id}`} className="text-blue-600 hover:underline">
                    {row.journal_entries.entry_number}
                </Link>
            ) : "-"
        },
        {
            key: "amount",
            header: appLang === 'en' ? "Amount" : "المبلغ",
            sortable: true,
            format: (value, row) => `${row.amount.toLocaleString(appLang === 'en' ? "en-US" : "ar-EG")} ${row.currency_code || "EGP"}`
        },
        {
            key: "payment_account",
            header: appLang === 'en' ? "Payment Account" : "حساب الدفع",
            sortable: true,
            format: (value, row) => row.chart_of_accounts?.account_name || "-"
        },
        {
            key: "description",
            header: appLang === 'en' ? "Description" : "الوصف",
            sortable: true
        },
        {
            key: "status",
            header: appLang === 'en' ? "Status" : "الحالة",
            sortable: true,
            format: (value, row) => (
                <Badge variant={row.status === 'posted' ? 'default' : 'secondary'}>
                    {row.status === 'posted' ? (appLang === 'en' ? 'Posted' : 'مرحل') : row.status}
                </Badge>
            )
        },
        {
            key: "actions",
            header: appLang === 'en' ? "Actions" : "الإجراءات",
            format: (value, row) => (
                <div className="flex gap-2">
                    {/* View/Edit Actions if needed */}
                </div>
            )
        }
    ]

    if (!hydrated) return null

    return (
        <div className={`flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 ${appLang === 'ar' ? 'rtl' : 'ltr'}`} dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
            <Sidebar />
            <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
                {/* Page Header */}
                <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
                    <PageHeaderList
                        title={appLang === 'en' ? 'Shareholder Drawings' : 'المسحوبات الشخصية'}
                        description={appLang === 'en' ? 'Manage shareholder personal withdrawals' : 'إدارة مسحوبات المساهمين الشخصية'}
                        icon={DollarSign}
                        createHref="/drawings/new"
                        createLabel={appLang === 'en' ? 'New Drawing' : 'تسجيل مسحوب'}
                        lang={appLang}
                        userRole="admin" // Simplified for now
                    />
                </div>

                {/* Table */}
                <Card className="dark:bg-slate-900 dark:border-slate-800">
                    <CardHeader>
                        <CardTitle className="dark:text-white">
                            {appLang === 'en' ? 'Drawings History' : 'سجل المسحوبات'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <LoadingState type="table" rows={5} />
                        ) : drawings.length === 0 ? (
                            <EmptyState
                                icon={DollarSign}
                                title={appLang === 'en' ? 'No drawings found' : 'لا توجد مسحوبات'}
                                description={appLang === 'en' ? 'Record your first drawing' : 'قم بتسجيل أول عملية سحب'}
                                action={{
                                    label: appLang === 'en' ? 'New Drawing' : 'تسجيل مسحوب',
                                    onClick: () => window.location.href = '/drawings/new',
                                    icon: Plus
                                }}
                            />
                        ) : (
                            <DataTable
                                columns={tableColumns}
                                data={drawings}
                                keyField="id"
                                lang={appLang}
                                minWidth="min-w-[640px]"
                                emptyMessage={appLang === 'en' ? 'No drawings found' : 'لا توجد مسحوبات'}
                            />
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}
