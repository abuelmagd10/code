"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { ArrowLeft, DollarSign, Calendar, Send, CheckCircle, XCircle, AlertCircle, ShieldCheck, ShieldX } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getDrawingById, submitDrawingForApproval, approveDrawing, rejectDrawing } from "@/app/actions/drawings"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { createNotification } from "@/lib/governance-layer"

const statusLabels: Record<string, { ar: string; en: string; className: string }> = {
    draft: { ar: 'مسودة', en: 'Draft', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
    pending_approval: { ar: 'بانتظار الاعتماد', en: 'Pending Approval', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
    posted: { ar: 'مرحّل', en: 'Posted', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
    rejected: { ar: 'مرفوض', en: 'Rejected', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
}

export default function DrawingDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params)
    const router = useRouter()
    const supabase = useSupabase()
    const { toast } = useToast()
    const [drawing, setDrawing] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState("")
    const [userId, setUserId] = useState("")
    const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
    const [posting, setPosting] = useState(false)
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
    const [rejectionReason, setRejectionReason] = useState("")

    const canApprove = ["owner", "admin", "general_manager", "gm", "generalmanager"].includes(userRole)
    const isCreator = drawing?.created_by === userId
    const canSubmitForApproval = isCreator && drawing && ['draft', 'rejected'].includes(drawing.status)

    useEffect(() => {
        const h = () => {
            try {
                setAppLang((document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1] || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
            } catch { }
        }
        h()
        window.addEventListener('app_language_changed', h)
        return () => window.removeEventListener('app_language_changed', h)
    }, [])

    useEffect(() => {
        loadData()
    }, [resolvedParams.id])

    const loadData = async () => {
        try {
            setLoading(true)
            const cId = await getActiveCompanyId(supabase)
            if (!cId) return
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            setUserId(user.id)
            const { data: member } = await supabase.from('company_members').select('role').eq('company_id', cId).eq('user_id', user.id).maybeSingle()
            setUserRole(member?.role || '')

            const data = await getDrawingById(resolvedParams.id)
            if (!data || ((data as any).company_id && (data as any).company_id !== cId)) {
                toast({ title: appLang === 'en' ? 'Not found' : 'غير موجود', variant: 'destructive' })
                router.push('/drawings')
                return
            }
            setDrawing(data)
        } catch (e) {
            console.error(e)
            toast({ title: appLang === 'en' ? 'Error loading' : 'خطأ في التحميل', variant: 'destructive' })
        } finally {
            setLoading(false)
        }
    }

    const handleSubmitForApproval = async () => {
        if (!drawing?.id) return
        setPosting(true)
        try {
            const result = await submitDrawingForApproval(drawing.id)
            if (result.success) {
                toast({ title: appLang === 'en' ? 'Submitted' : 'تم الإرسال', description: appLang === 'en' ? 'Drawing sent for approval' : 'تم إرسال المسحوبة للاعتماد' })
                loadData()
                const cId = await getActiveCompanyId(supabase)
                if (cId) {
                    const { data: approvers } = await supabase.from('company_members').select('user_id').eq('company_id', cId).in('role', ['owner', 'admin', 'general_manager'])
                    const timestamp = Date.now()
                    for (const a of approvers || []) {
                        await createNotification({
                            companyId: cId,
                            referenceType: 'shareholder_drawing',
                            referenceId: drawing.id,
                            title: appLang === 'en' ? 'Drawing Pending Approval' : 'طلب اعتماد مسحوبة',
                            message: appLang === 'en' ? `Shareholder drawing requires your approval` : 'مسحوبة مساهم تحتاج إلى اعتمادك',
                            createdBy: userId,
                            assignedToUser: a.user_id,
                            priority: 'high',
                            eventKey: `drawing:${drawing.id}:pending:${a.user_id}:${timestamp}`,
                            severity: 'warning',
                            category: 'approvals',
                        })
                    }
                }
            } else {
                toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: result.message, variant: 'destructive' })
            }
        } finally {
            setPosting(false)
        }
    }

    const handleApprove = async () => {
        if (!drawing?.id) return
        setPosting(true)
        try {
            const result = await approveDrawing(drawing.id)
            if (result.success) {
                toast({ title: appLang === 'en' ? 'Approved' : 'تم الاعتماد', description: appLang === 'en' ? 'Drawing approved and journal entry created' : 'تم اعتماد المسحوبة وإنشاء القيد' })
                loadData()
            } else {
                toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: result.message, variant: 'destructive' })
            }
        } finally {
            setPosting(false)
        }
    }

    const handleReject = async () => {
        if (!drawing?.id || !rejectionReason.trim()) return
        setPosting(true)
        try {
            const result = await rejectDrawing(drawing.id, rejectionReason.trim())
            if (result.success) {
                toast({ title: appLang === 'en' ? 'Rejected' : 'تم الرفض' })
                setRejectDialogOpen(false)
                setRejectionReason('')
                loadData()
            } else {
                toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: result.message, variant: 'destructive' })
            }
        } finally {
            setPosting(false)
        }
    }

    if (loading || !drawing) {
        return (
            <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
                <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
                    <div className="animate-pulse max-w-2xl mx-auto space-y-4">
                        <div className="h-8 bg-gray-200 dark:bg-slate-800 rounded w-1/3" />
                        <div className="h-48 bg-gray-200 dark:bg-slate-800 rounded" />
                    </div>
                </main>
            </div>
        )
    }

    const statusInfo = statusLabels[drawing.status] || { ar: drawing.status, en: drawing.status, className: '' }

    return (
        <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
            <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
                <div className="max-w-2xl mx-auto space-y-6">
                    <div className="flex items-center gap-4">
                        <Link href="/drawings">
                            <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 ml-2" />{appLang === 'en' ? 'Back' : 'العودة'}</Button>
                        </Link>
                        <Badge className={statusInfo.className}>{appLang === 'en' ? statusInfo.en : statusInfo.ar}</Badge>
                    </div>

                    <Card className="dark:bg-slate-900 dark:border-slate-800">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 dark:text-white">
                                <DollarSign className="w-5 h-5" />
                                {appLang === 'en' ? 'Drawing Details' : 'تفاصيل المسحوبة'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-muted-foreground">{appLang === 'en' ? 'Shareholder' : 'المساهم'}</Label>
                                    <p className="font-medium">{drawing.shareholders?.name || '-'}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">{appLang === 'en' ? 'Date' : 'التاريخ'}</Label>
                                    <p className="font-medium">{new Date(drawing.drawing_date).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}</p>
                                </div>
                                <div>
                                    <Label className="text-muted-foreground">{appLang === 'en' ? 'Amount' : 'المبلغ'}</Label>
                                    <p className="font-medium">{Number(drawing.amount).toLocaleString()} EGP</p>
                                </div>
                                {drawing.journal_entry_id && drawing.journal_entry && drawing.journal_entry.entry_number != null && (
                                    <div>
                                        <Label className="text-muted-foreground">{appLang === 'en' ? 'Journal Entry' : 'رقم القيد'}</Label>
                                        <p><Link href={`/journal-entries/${drawing.journal_entry_id}`} className="text-blue-600 hover:underline">{drawing.journal_entry.entry_number}</Link></p>
                                    </div>
                                )}
                            </div>
                            {drawing.description && (
                                <div>
                                    <Label className="text-muted-foreground">{appLang === 'en' ? 'Description' : 'الوصف'}</Label>
                                    <p className="font-medium">{drawing.description}</p>
                                </div>
                            )}
                            {drawing.status === 'rejected' && drawing.rejection_reason && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                                    <Label className="text-muted-foreground">{appLang === 'en' ? 'Rejection Reason' : 'سبب الرفض'}</Label>
                                    <p className="text-sm mt-1">{drawing.rejection_reason}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {drawing.status === 'pending_approval' && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                                <div>
                                    <h3 className="font-semibold text-amber-800 dark:text-amber-300">{appLang === 'en' ? 'Awaiting Approval' : 'بانتظار اعتماد الإدارة'}</h3>
                                    <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                                        {appLang === 'en' ? 'This drawing requires approval from Owner, Admin, or General Manager.' : 'هذه المسحوبة تحتاج إلى اعتماد المالك أو المدير أو المدير العام.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {canSubmitForApproval && (
                            <Button onClick={handleSubmitForApproval} disabled={posting} className="gap-2 bg-blue-600 hover:bg-blue-700">
                                <Send className="w-4 h-4" />
                                {appLang === 'en' ? 'Submit for Approval' : 'إرسال للاعتماد'}
                            </Button>
                        )}
                        {canApprove && drawing.status === 'pending_approval' && (
                            <>
                                <Button onClick={handleApprove} disabled={posting} className="gap-2 bg-green-600 hover:bg-green-700">
                                    <ShieldCheck className="w-4 h-4" />
                                    {appLang === 'en' ? 'Approve' : 'اعتماد'}
                                </Button>
                                <Button variant="destructive" onClick={() => setRejectDialogOpen(true)} disabled={posting} className="gap-2">
                                    <ShieldX className="w-4 h-4" />
                                    {appLang === 'en' ? 'Reject' : 'رفض'}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </main>

            <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{appLang === 'en' ? 'Reject Drawing' : 'رفض المسحوبة'}</DialogTitle>
                        <DialogDescription>{appLang === 'en' ? 'Please provide a reason. The creator will be notified.' : 'يرجى ذكر سبب الرفض. سيتم إشعار مقدم الطلب.'}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-4">
                        <Label>{appLang === 'en' ? 'Reason' : 'سبب الرفض'} *</Label>
                        <Textarea
                            placeholder={appLang === 'en' ? 'Enter reason...' : 'أدخل السبب...'}
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            className="min-h-[100px]"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setRejectDialogOpen(false); setRejectionReason('') }}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
                        <Button variant="destructive" onClick={handleReject} disabled={posting || !rejectionReason.trim()}>
                            {posting ? (appLang === 'en' ? 'Rejecting...' : 'جاري الرفض...') : (appLang === 'en' ? 'Confirm Rejection' : 'تأكيد الرفض')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
