"use client"

import { useState, useEffect } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { getActiveCompanyId } from "@/lib/company"

interface AddCapitalDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    assetId: string
    onSuccess: () => void
    lang: 'ar' | 'en'
}

export function AddCapitalDialog({ open, onOpenChange, assetId, onSuccess, lang }: AddCapitalDialogProps) {
    const supabase = useSupabase()
    const { toast } = useToast()
    const [loading, setLoading] = useState(false)
    const [accounts, setAccounts] = useState<any[]>([])
    const [formData, setFormData] = useState({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
        paymentAccountId: ''
    })

    // Load Payment Accounts (Cash/Bank)
    useEffect(() => {
        if (open) {
            const loadAccounts = async () => {
                const companyId = await getActiveCompanyId(supabase)
                if (!companyId) return

                // v3.74.42: fix wrong column (account_type IN cash,bank,liability — invalid values made dropdown empty) → sub_type IN (cash,bank) + branch-scope + is_active
                const PRIVILEGED = ['owner', 'admin', 'general_manager']
                let _userRoleForAccts = ''
                let _userBranchForAccts: string | null = null
                try {
                    const { data: { user } } = await supabase.auth.getUser()
                    if (user) {
                        const { data: m } = await supabase
                            .from('company_members')
                            .select('role, branch_id')
                            .eq('company_id', companyId)
                            .eq('user_id', user.id)
                            .maybeSingle()
                        _userRoleForAccts = String(m?.role || '').toLowerCase()
                        _userBranchForAccts = (m?.branch_id as string | undefined) || null
                    }
                } catch {}
                const _isPrivilegedForAccts = PRIVILEGED.includes(_userRoleForAccts)

                let accQuery = supabase
                    .from('chart_of_accounts')
                    .select('id, account_name, code, sub_type, branch_id')
                    .eq('company_id', companyId)
                    .eq('is_active', true)
                    .in('sub_type', ['cash', 'bank'])
                if (!_isPrivilegedForAccts && _userBranchForAccts) {
                    accQuery = accQuery.eq('branch_id', _userBranchForAccts)
                }
                const { data } = await accQuery

                if (data) setAccounts(data)
            }
            loadAccounts()
        }
    }, [open, supabase])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        if (!formData.paymentAccountId) {
            toast({
                title: lang === 'en' ? 'Error' : 'خطأ',
                description: lang === 'en' ? 'Please select a payment account' : 'يرجى اختيار حساب الدفع',
                variant: "destructive"
            })
            return
        }

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("No user found")

            // Call RPC w/ explicit account
            const { error } = await supabase.rpc('register_asset_addition', {
                p_asset_id: assetId,
                p_amount: parseFloat(formData.amount),
                p_date: formData.date,
                p_description: formData.description,
                p_user_id: user.id,
                p_payment_account_id: formData.paymentAccountId
            })

            if (error) throw error

            toast({
                title: lang === 'en' ? 'Success' : 'تم بنجاح',
                description: lang === 'en' ? 'Capital added successfully' : 'تمت إضافة الأصل الرأسمالي بنجاح',
            })
            onSuccess()
            onOpenChange(false)
            setFormData({ amount: '', date: new Date().toISOString().split('T')[0], description: '', paymentAccountId: '' })
        } catch (error: any) {
            console.error('Error adding capital:', error)
            toast({
                title: lang === 'en' ? 'Error' : 'خطأ',
                description: error.message || 'Failed to add capital',
                variant: "destructive"
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{lang === 'en' ? 'Add Capital' : 'إضافة رأسمالية'}</DialogTitle>
                    <DialogDescription>
                        {lang === 'en'
                            ? 'Increase the book value of the asset. This will recalculate future depreciation.'
                            : 'زيادة القيمة الدفترية للأصل. سيتم إعادة حساب الإهلاك المستقبلي.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>{lang === 'en' ? 'Amount' : 'المبلغ'}</Label>
                        <Input
                            type="number"
                            step="0.01"
                            required
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>{lang === 'en' ? 'Date' : 'التاريخ'}</Label>
                        <Input
                            type="date"
                            required
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>{lang === 'en' ? 'Payment Account' : 'حساب الدفع'}</Label>
                        <Select
                            value={formData.paymentAccountId}
                            onValueChange={(val) => setFormData({ ...formData, paymentAccountId: val })}
                            required
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={lang === 'en' ? "Select Account" : "اختر الحساب"} />
                            </SelectTrigger>
                            <SelectContent>
                                {accounts.map(acc => (
                                    <SelectItem key={acc.id} value={acc.id}>
                                        {acc.code} - {acc.account_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>{lang === 'en' ? 'Description' : 'الوصف'}</Label>
                        <Input
                            required
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {lang === 'en' ? 'Cancel' : 'إلغاء'}
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {lang === 'en' ? 'Save' : 'حفظ'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
