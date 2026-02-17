"use client"

/**
 * Commission Run Payment Dialog
 * 
 * Mark commission run as paid and create payment journal entry
 * 
 * Features:
 * - Payment details form
 * - Payment method selection
 * - Payment account selection
 * - Validation
 * - API integration
 * 
 * CRITICAL: No journal entry creation in UI
 * All accounting happens in backend
 */

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Wallet } from "lucide-react"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"

interface PaymentAccount {
    id: string
    account_code: string
    account_name: string
    account_type: string
}

interface RunPaymentDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    runId: string
    netCommission: number
    onPaymentComplete: () => void
    lang?: 'ar' | 'en'
}

export function RunPaymentDialog({
    open,
    onOpenChange,
    runId,
    netCommission,
    onPaymentComplete,
    lang = 'ar'
}: RunPaymentDialogProps) {
    const supabase = useSupabase()
    const { toast } = useToast()

    // State
    const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0])
    const [paymentMethod, setPaymentMethod] = useState<string>("bank_transfer")
    const [paymentAccountId, setPaymentAccountId] = useState<string>("")
    const [referenceNumber, setReferenceNumber] = useState<string>("")
    const [notes, setNotes] = useState<string>("")
    const [accounts, setAccounts] = useState<PaymentAccount[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(false)

    // Validation errors
    const [errors, setErrors] = useState<Record<string, string>>({})

    /**
     * Load payment accounts
     */
    useEffect(() => {
        if (open) {
            loadAccounts()
        }
    }, [open])

    const loadAccounts = async () => {
        try {
            setIsLoadingAccounts(true)

            const activeCompanyId = await getActiveCompanyId(supabase)
            if (!activeCompanyId) return

            const { data, error } = await supabase
                .from('chart_of_accounts')
                .select('id, account_code, account_name, account_type')
                .eq('company_id', activeCompanyId)
                .eq('account_type', 'asset')
                .eq('is_active', true)
                .order('account_code')

            if (error) throw error

            setAccounts(data || [])
        } catch (error) {
            console.error('Error loading accounts:', error)
        } finally {
            setIsLoadingAccounts(false)
        }
    }

    /**
     * Validate form
     */
    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {}

        // Payment date required
        if (!paymentDate) {
            newErrors.paymentDate = lang === 'en' ? 'Payment date is required' : 'تاريخ الدفع مطلوب'
        }

        // Payment date cannot be in future
        const today = new Date().toISOString().split('T')[0]
        if (paymentDate && paymentDate > today) {
            newErrors.paymentDate = lang === 'en' ? 'Payment date cannot be in the future' : 'تاريخ الدفع لا يمكن أن يكون في المستقبل'
        }

        // Payment account required
        if (!paymentAccountId) {
            newErrors.paymentAccountId = lang === 'en' ? 'Payment account is required' : 'حساب الدفع مطلوب'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    /**
     * Handle submit
     */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!validateForm()) {
            toast({
                title: lang === 'en' ? 'Validation Error' : 'خطأ في التحقق',
                description: lang === 'en' ? 'Please fix the errors in the form' : 'يرجى إصلاح الأخطاء في النموذج',
                variant: 'destructive'
            })
            return
        }

        setIsLoading(true)

        try {
            const response = await fetch(`/api/commissions/runs/${runId}/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    payment_date: paymentDate,
                    payment_method: paymentMethod,
                    payment_account_id: paymentAccountId,
                    reference_number: referenceNumber || undefined,
                    notes: notes || undefined
                })
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to mark as paid')
            }

            toast({
                title: lang === 'en' ? 'Payment Recorded' : 'تم تسجيل الدفع',
                description: lang === 'en'
                    ? 'Commission run marked as paid successfully'
                    : 'تم وضع علامة مدفوع على تشغيل العمولة بنجاح'
            })

            onPaymentComplete()
            onOpenChange(false)

            // Reset form
            setPaymentDate(new Date().toISOString().split('T')[0])
            setPaymentMethod('bank_transfer')
            setPaymentAccountId('')
            setReferenceNumber('')
            setNotes('')
            setErrors({})
        } catch (error: any) {
            toast({
                title: lang === 'en' ? 'Error' : 'خطأ',
                description: error.message || (lang === 'en' ? 'Failed to record payment' : 'فشل تسجيل الدفع'),
                variant: 'destructive'
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Wallet className="h-5 w-5" />
                        {lang === 'en' ? 'Record Commission Payment' : 'تسجيل دفع العمولة'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Amount Display */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">
                            {lang === 'en' ? 'Net Commission to Pay' : 'صافي العمولة المستحقة'}
                        </div>
                        <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                            {netCommission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>

                    {/* Payment Date */}
                    <div className="space-y-2">
                        <Label htmlFor="payment_date">
                            {lang === 'en' ? 'Payment Date' : 'تاريخ الدفع'} *
                        </Label>
                        <Input
                            id="payment_date"
                            type="date"
                            value={paymentDate}
                            onChange={(e) => {
                                setPaymentDate(e.target.value)
                                setErrors(prev => {
                                    const updated = { ...prev }
                                    delete updated.paymentDate
                                    return updated
                                })
                            }}
                            className={errors.paymentDate ? 'border-red-500' : ''}
                        />
                        {errors.paymentDate && (
                            <p className="text-sm text-red-600 dark:text-red-400">{errors.paymentDate}</p>
                        )}
                    </div>

                    {/* Payment Method */}
                    <div className="space-y-2">
                        <Label htmlFor="payment_method">
                            {lang === 'en' ? 'Payment Method' : 'طريقة الدفع'} *
                        </Label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                            <SelectTrigger id="payment_method">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cash">
                                    {lang === 'en' ? 'Cash' : 'نقدي'}
                                </SelectItem>
                                <SelectItem value="bank_transfer">
                                    {lang === 'en' ? 'Bank Transfer' : 'تحويل بنكي'}
                                </SelectItem>
                                <SelectItem value="check">
                                    {lang === 'en' ? 'Check' : 'شيك'}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Payment Account */}
                    <div className="space-y-2">
                        <Label htmlFor="payment_account">
                            {lang === 'en' ? 'Payment Account' : 'حساب الدفع'} *
                        </Label>
                        {isLoadingAccounts ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                            </div>
                        ) : (
                            <Select
                                value={paymentAccountId}
                                onValueChange={(value) => {
                                    setPaymentAccountId(value)
                                    setErrors(prev => {
                                        const updated = { ...prev }
                                        delete updated.paymentAccountId
                                        return updated
                                    })
                                }}
                            >
                                <SelectTrigger id="payment_account" className={errors.paymentAccountId ? 'border-red-500' : ''}>
                                    <SelectValue placeholder={lang === 'en' ? 'Select account...' : 'اختر الحساب...'} />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts.map((account) => (
                                        <SelectItem key={account.id} value={account.id}>
                                            {account.account_code} - {account.account_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        {errors.paymentAccountId && (
                            <p className="text-sm text-red-600 dark:text-red-400">{errors.paymentAccountId}</p>
                        )}
                    </div>

                    {/* Reference Number */}
                    <div className="space-y-2">
                        <Label htmlFor="reference_number">
                            {lang === 'en' ? 'Reference Number' : 'رقم المرجع'}
                        </Label>
                        <Input
                            id="reference_number"
                            value={referenceNumber}
                            onChange={(e) => setReferenceNumber(e.target.value)}
                            placeholder={lang === 'en' ? 'Optional' : 'اختياري'}
                        />
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label htmlFor="notes">
                            {lang === 'en' ? 'Notes' : 'ملاحظات'}
                        </Label>
                        <Textarea
                            id="notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder={lang === 'en' ? 'Optional payment notes...' : 'ملاحظات الدفع الاختيارية...'}
                            rows={3}
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isLoading}
                        >
                            {lang === 'en' ? 'Cancel' : 'إلغاء'}
                        </Button>
                        <Button
                            type="submit"
                            disabled={isLoading || isLoadingAccounts}
                        >
                            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {lang === 'en' ? 'Record Payment' : 'تسجيل الدفع'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
