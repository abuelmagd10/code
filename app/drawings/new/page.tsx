"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { ArrowLeft, Save } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { NumericInput } from "@/components/ui/numeric-input"
import { createDrawing, getShareholders } from "@/app/actions/drawings"

type Account = {
    id: string
    account_code: string
    account_name: string
}

export default function NewDrawingPage() {
    const router = useRouter()
    const supabase = useSupabase()
    const { toast } = useToast()
    const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
    const [hydrated, setHydrated] = useState(false)
    const [saving, setSaving] = useState(false)
    const [companyId, setCompanyId] = useState<string>("")

    // Data State
    const [shareholders, setShareholders] = useState<any[]>([])
    const [paymentAccounts, setPaymentAccounts] = useState<Account[]>([])

    // Form Fields
    const [shareholderId, setShareholderId] = useState("")
    const [amount, setAmount] = useState<number>(0)
    const [drawingDate, setDrawingDate] = useState(new Date().toISOString().split("T")[0])
    const [paymentAccountId, setPaymentAccountId] = useState("")
    const [description, setDescription] = useState("")

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

    useEffect(() => {
        loadInitialData()
    }, [])

    const loadInitialData = async () => {
        try {
            const cid = await getActiveCompanyId(supabase)
            if (!cid) return
            setCompanyId(cid)

            // Load Shareholders
            const shareholdersData = await getShareholders(cid)
            setShareholders(shareholdersData || [])

            // Load payment accounts (cash/bank)
            const { data: payAccounts } = await supabase
                .from("chart_of_accounts")
                .select("id, account_code, account_name")
                .eq("company_id", cid)
                .in("account_type", ["asset"]) // Should be more specific usually (Cash/Bank), but strict types might vary
                .eq("is_active", true)
                .order("account_code")

            setPaymentAccounts(payAccounts || [])

        } catch (error) {
            console.error("Error loading initial data:", error)
        }
    }

    const handleSave = async () => {
        if (!shareholderId) {
            toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: appLang === 'en' ? 'Shareholder is required' : 'المساهم مطلوب', variant: "destructive" })
            return
        }
        if (amount <= 0) {
            toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: appLang === 'en' ? 'Amount must be greater than 0' : 'يجب أن يكون المبلغ أكبر من 0', variant: "destructive" })
            return
        }
        if (!paymentAccountId) {
            toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: appLang === 'en' ? 'Payment account is required' : 'حساب الدفع مطلوب', variant: "destructive" })
            return
        }

        setSaving(true)
        try {
            const formData = new FormData()
            formData.append('companyId', companyId)
            formData.append('shareholderId', shareholderId)
            formData.append('amount', amount.toString())
            formData.append('drawingDate', drawingDate)
            formData.append('paymentAccountId', paymentAccountId)
            formData.append('description', description)

            // Ideally fetch drawingsAccountId logic here or let server handle it (server handles it as per action logic)

            const result = await createDrawing({ success: false, message: '' }, formData)

            if (result.success) {
                toast({
                    title: appLang === 'en' ? 'Success' : 'تم بنجاح',
                    description: appLang === 'en' ? 'Drawing recorded' : 'تم تسجيل المسحوبات'
                })
                router.push('/drawings')
            } else {
                toast({
                    title: appLang === 'en' ? 'Error' : 'خطأ',
                    description: result.message,
                    variant: 'destructive'
                })
            }

        } catch (error) {
            console.error(error)
            toast({
                title: appLang === 'en' ? 'Error' : 'خطأ',
                description: appLang === 'en' ? 'An unexpected error occurred' : 'حدث خطأ غير متوقع',
                variant: 'destructive'
            })
        } finally {
            setSaving(false)
        }
    }

    if (!hydrated) return null

    return (
        <div className={`flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 ${appLang === 'ar' ? 'rtl' : 'ltr'}`} dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
            <Sidebar />
            <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
                <div className="space-y-4 sm:space-y-6 max-w-full">
                    <div className="min-w-0">
                        <div className="mb-4">
                            <Link href="/drawings">
                                <Button variant="ghost" size="sm" className="dark:text-gray-300 dark:hover:bg-slate-800">
                                    <ArrowLeft className="h-4 w-4 ml-2" />
                                    {appLang === 'en' ? 'Back to Drawings' : 'العودة للمسحوبات'}
                                </Button>
                            </Link>
                        </div>
                        <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>
                            {appLang === 'en' ? 'New Drawing' : 'تسجيل مسحوبات جديدة'}
                        </h1>
                    </div>

                    <Card className="dark:bg-slate-900 dark:border-slate-800">
                        <CardHeader>
                            <CardTitle className="dark:text-white" suppressHydrationWarning>
                                {appLang === 'en' ? 'Drawing Details' : 'تفاصيل المسحوبات'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>{appLang === 'en' ? 'Shareholder' : 'المساهم'}</Label>
                                    <Select value={shareholderId} onValueChange={setShareholderId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={appLang === 'en' ? 'Select Shareholder' : 'اختر المساهم'} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {shareholders.map(s => (
                                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>{appLang === 'en' ? 'Date' : 'التاريخ'}</Label>
                                    <Input type="date" value={drawingDate} onChange={e => setDrawingDate(e.target.value)} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>{appLang === 'en' ? 'Amount' : 'المبلغ'}</Label>
                                    <NumericInput value={amount} onChange={setAmount} />
                                </div>
                                <div className="space-y-2">
                                    <Label>{appLang === 'en' ? 'Payment Account' : 'حساب الدفع'}</Label>
                                    <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={appLang === 'en' ? 'Select Account' : 'اختر الحساب'} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {paymentAccounts.map(Acc => (
                                                <SelectItem key={Acc.id} value={Acc.id}>{Acc.account_code} - {Acc.account_name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>{appLang === 'en' ? 'Description' : 'الوصف'}</Label>
                                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={appLang === 'en' ? 'Optional description' : 'وصف اختياري'} />
                            </div>

                            <div className="flex gap-2 justify-end pt-4 border-t dark:border-slate-700">
                                <Link href="/drawings">
                                    <Button variant="outline" disabled={saving}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
                                </Link>
                                <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                                    <Save className="h-4 w-4 ml-2" />
                                    {saving ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...') : (appLang === 'en' ? 'Save' : 'حفظ')}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    )
}
