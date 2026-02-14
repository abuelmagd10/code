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

interface DisposeAssetDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    assetId: string
    onSuccess: () => void
    lang: 'ar' | 'en'
}

export function DisposeAssetDialog({ open, onOpenChange, assetId, onSuccess, lang }: DisposeAssetDialogProps) {
    const supabase = useSupabase()
    const { toast } = useToast()
    const [loading, setLoading] = useState(false)
    const [accounts, setAccounts] = useState<any[]>([])
    const [formData, setFormData] = useState({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        reason: '',
        depositAccountId: ''
    })

    // Load Asset/Cash accounts for deposit
    useEffect(() => {
        if (open) {
            const loadAccounts = async () => {
                const companyId = await getActiveCompanyId(supabase)
                if (!companyId) return

                const { data } = await supabase
                    .from('chart_of_accounts')
                    .select('id, account_name, code')
                    .eq('company_id', companyId)
                    .eq('is_active', true)
                    .in('account_type', ['asset', 'cash', 'bank']) // Filter for logical deposit accounts

                if (data) setAccounts(data)
            }
            loadAccounts()
        }
    }, [open, supabase])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("No user found")

            // Call RPC
            const { error } = await supabase.rpc('dispose_asset', {
                p_asset_id: assetId,
                p_disposal_date: formData.date,
                p_disposal_amount: parseFloat(formData.amount || '0'),
                p_disposal_reason: formData.reason,
                p_deposit_account_id: formData.depositAccountId,
                p_user_id: user.id
            })

            if (error) throw error

            toast({
                title: lang === 'en' ? 'Success' : 'تم بنجاح',
                description: lang === 'en' ? 'Asset disposed successfully' : 'تم استبعاد الأصل بنجاح',
            })
            onSuccess()
            onOpenChange(false)
        } catch (error: any) {
            console.error('Error disposing asset:', error)
            toast({
                title: lang === 'en' ? 'Error' : 'خطأ',
                description: error.message || 'Failed to dispose asset',
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
                    <DialogTitle>{lang === 'en' ? 'Dispose Asset' : 'استبعاد الأصل'}</DialogTitle>
                    <DialogDescription>
                        {lang === 'en'
                            ? 'Sell or write-off the asset. This will stop depreciation and calculate gain/loss.'
                            : 'بيع أو شطب الأصل. سيتم إيقاف الإهلاك وحساب الربح/الخسارة.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label>{lang === 'en' ? 'Sale Price (0 for Write-off)' : 'سعر البيع (0 للشطب)'}</Label>
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
                        <Label>{lang === 'en' ? 'Deposit Account' : 'حساب الإيداع'}</Label>
                        <Select
                            value={formData.depositAccountId}
                            onValueChange={(val) => setFormData({ ...formData, depositAccountId: val })}
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
                        <Label>{lang === 'en' ? 'Reason / Notes' : 'السبب / ملاحظات'}</Label>
                        <Input
                            value={formData.reason}
                            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {lang === 'en' ? 'Cancel' : 'إلغاء'}
                        </Button>
                        <Button type="submit" variant="destructive" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {lang === 'en' ? 'Dispose' : 'استبعاد'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
