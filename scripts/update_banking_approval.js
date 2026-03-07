const fs = require('fs');

const file = 'c:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/app/banking/[id]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Imports
if (!content.includes('usePermissions')) {
    content = content.replace(
        'import { Filter, X, Search, Calendar } from "lucide-react"\n',
        'import { Filter, X, Search, Calendar, Check, Ban } from "lucide-react"\nimport { usePermissions } from "@/lib/permissions-context"\nimport { notifyBankVoucherRequestCreated, notifyBankVoucherApproved, notifyBankVoucherRejected } from "@/lib/notification-helpers"\nimport { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"\n'
    );
}

// 2. Types
if (!content.includes('BankVoucherRequest')) {
    content = content.replace(
        'type Line = {',
        `type BankVoucherRequest = {
  id: string;
  voucher_type: 'deposit' | 'withdraw';
  amount: number;
  currency: string;
  entry_date: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  created_at: string;
  created_by: string;
  users?: { email: string; raw_user_meta_data?: { name?: string } };
  counter_account?: { account_code?: string; account_name: string };
}

type Line = {`
    );
}

// 3. State
if (!content.includes('const { role, user } = usePermissions()')) {
    content = content.replace(
        '  const { toast } = useToast()\n  const { id: accountId } = React.use(params)\n',
        '  const { toast } = useToast()\n  const { role, user } = usePermissions()\n  const { id: accountId } = React.use(params)\n'
    );
    content = content.replace(
        '  const [lines, setLines] = useState<Line[]>([])\n',
        '  const [lines, setLines] = useState<Line[]>([])\n  const [requests, setRequests] = useState<BankVoucherRequest[]>([])\n  const [rejectingReq, setRejectingReq] = useState<BankVoucherRequest | null>(null)\n  const [rejectReason, setRejectReason] = useState("")\n'
    );
}

// 4. loadData
if (!content.includes('from(\'bank_voucher_requests\')')) {
    content = content.replace(
        'setLines((directLines || []) as any)\n      }',
        `setLines((directLines || []) as any)\n      }\n\n      const { data: reqData } = await supabase\n        .from('bank_voucher_requests')\n        .select('*, users:created_by(email, raw_user_meta_data), counter_account:chart_of_accounts!counter_id(account_code, account_name)')\n        .eq('account_id', accountId)\n        .order('created_at', { ascending: false })\n      if (reqData) setRequests(reqData as any)\n`
    );
}

// 5. recordEntry & handlers
if (!content.includes('isUpperRole = ["admin", "owner", "manager"]')) {
    // Wrap the journal_entries insertion into `else` block
    const insertStartIndex = content.indexOf('const { data: entry, error: entryErr } = await supabase\n        .from("journal_entries")');
    if (insertStartIndex !== -1) {
        const replacement = `const isUpperRole = ["admin", "owner", "manager"].includes(role || "")
      
      if (!isUpperRole) {
          const { data: newReq, error: reqErr } = await supabase.from('bank_voucher_requests').insert({
              company_id: cid,
              branch_id: account?.branch_id || null,
              voucher_type: type,
              account_id: accountId,
              counter_id: cfg.counter_id,
              amount: cfg.amount,
              currency: cfg.currency,
              base_amount: finalBaseAmount,
              exchange_rate: exRateInfo.rate,
              exchange_rate_source: exRateInfo.source,
              exchange_rate_id: exRateInfo.rateId,
              entry_date: cfg.date,
              description: cfg.description,
              cost_center_id: account?.cost_center_id || null,
              status: 'pending',
              created_by: user?.id
          }).select().single()
          
          if (reqErr) throw reqErr
          
          await notifyBankVoucherRequestCreated({
              companyId: cid,
              requestId: newReq.id,
              voucherType: type,
              amount: cfg.amount,
              currency: cfg.currency,
              branchId: account?.branch_id || undefined,
              costCenterId: account?.cost_center_id || undefined,
              createdBy: user?.id || ""
          })
          
          toast({ title: "تم الإرسال للاعتماد", description: "تم إرسال طلبك للإدارة بنجاح" })
      } else {
      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries")`;
        content = content.replace('const { data: entry, error: entryErr } = await supabase\n        .from("journal_entries")', replacement);

        // Find lines insert and close the bracket
        content = content.replace(
            `      const { error: linesErr } = await supabase.from("journal_entry_lines").insert(linesPayload)\n      if (linesErr) throw linesErr\n      await loadData()`,
            `      const { error: linesErr } = await supabase.from("journal_entry_lines").insert(linesPayload)\n      if (linesErr) throw linesErr\n      }\n      await loadData()`
        );
    }
}

if (!content.includes('approveRequest = async')) {
    content = content.replace(
        '  return (\n    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">',
        `  const approveRequest = async (req: BankVoucherRequest) => {
    try {
        setSaving(true)
        const { data, error } = await supabase.rpc('approve_bank_voucher', {
            p_request_id: req.id,
            p_approved_by: user?.id
        })
        if (error) throw error
        
        await notifyBankVoucherApproved({
            companyId: companyId!,
            requestId: req.id,
            voucherType: req.voucher_type,
            amount: req.amount,
            currency: req.currency,
            branchId: account?.branch_id || undefined,
            costCenterId: account?.cost_center_id || undefined,
            createdBy: req.created_by,
            approvedBy: user?.id || ""
        })
        
        toastActionSuccess(toast, "اعتماد", "السند")
        await loadData()
    } catch(err) {
        toastActionError(toast, "اعتماد", "السند")
    } finally { setSaving(false) }
  }

  const rejectRequest = async () => {
    if (!rejectingReq || !rejectReason.trim()) return;
    try {
        setSaving(true)
        const { error } = await supabase.rpc('reject_bank_voucher', {
            p_request_id: rejectingReq.id,
            p_rejected_by: user?.id,
            p_reason: rejectReason
        })
        if (error) throw error
        
        await notifyBankVoucherRejected({
            companyId: companyId!,
            requestId: rejectingReq.id,
            voucherType: rejectingReq.voucher_type,
            amount: rejectingReq.amount,
            currency: rejectingReq.currency,
            branchId: account?.branch_id || undefined,
            costCenterId: account?.cost_center_id || undefined,
            createdBy: rejectingReq.created_by,
            rejectedBy: user?.id || "",
            reason: rejectReason
        })
        
        toastActionSuccess(toast, "رفض", "السند")
        setRejectingReq(null)
        setRejectReason("")
        await loadData()
    } catch(err) {
        toastActionError(toast, "رفض", "السند")
    } finally { setSaving(false) }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">`
    );
}

// 6. UI for Pending Requests
if (!content.includes('RequestsSection')) {
    const isUpperRoleExpr = `const isUpperRole = ["admin", "owner", "manager"].includes(role || "")`;
    const pendingUI = `
        {/* RequestsSection */}
        {requests.length > 0 && (
          <Card className="mt-6 border-orange-200 dark:border-orange-900/50">
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4 text-orange-700 dark:text-orange-400">
                {appLang === 'en' ? 'Voucher Requests' : 'طلبات السندات'}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-orange-50 dark:bg-orange-900/20 text-orange-900 dark:text-orange-200">
                    <tr>
                      <th className="p-3 text-right">التاريخ</th>
                      <th className="p-3 text-right">النوع</th>
                      <th className="p-3 text-right">المبلغ</th>
                      <th className="p-3 text-right">المقابل</th>
                      <th className="p-3 text-right">الوصف</th>
                      <th className="p-3 text-right">الحالة</th>
                      <th className="p-3 text-right">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map(r => (
                      <tr key={r.id} className="border-b">
                        <td className="p-3">{r.entry_date}</td>
                        <td className="p-3">
                          <span className={\`px-2 py-1 rounded text-xs \${r.voucher_type === 'deposit' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}\`}>
                            {r.voucher_type === 'deposit' ? 'إيداع' : 'سحب'}
                          </span>
                        </td>
                        <td className="p-3">{new Intl.NumberFormat('ar-EG').format(r.amount)} {r.currency}</td>
                        <td className="p-3">{r.counter_account?.account_name}</td>
                        <td className="p-3">{r.description}</td>
                        <td className="p-3">
                          {r.status === 'pending' && <span className="text-orange-600">قيد المراجعة</span>}
                          {r.status === 'approved' && <span className="text-green-600">معتمد</span>}
                          {r.status === 'rejected' && <div className="text-red-600">مرفوض {(r.rejection_reason) && <span className="block text-xs text-gray-500">{r.rejection_reason}</span>}</div>}
                        </td>
                        <td className="p-3">
                          {r.status === 'pending' && ["admin", "owner", "manager"].includes(role || "") && (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50" onClick={() => approveRequest(r)} disabled={saving}><Check className="w-4 h-4 mr-1"/> اعتماد</Button>
                              <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setRejectingReq(r)} disabled={saving}><Ban className="w-4 h-4 mr-1"/> رفض</Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
        
        <Dialog open={!!rejectingReq} onOpenChange={(open) => !open && setRejectingReq(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>رفض السند</DialogTitle>
              <DialogDescription>يرجى إدخال سبب الرفض لإعلام الموظف به.</DialogDescription>
            </DialogHeader>
            <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="السبب..." />
            <DialogFooter>
              <Button onClick={() => setRejectingReq(null)} variant="outline">إلغاء</Button>
              <Button onClick={rejectRequest} disabled={!rejectReason || saving} variant="destructive">تأكيد الرفض</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    `;

    // Inject before `<div className="grid grid-cols-1 md:grid-cols-2 gap-6">`
    content = content.replace(
        '<div className="grid grid-cols-1 md:grid-cols-2 gap-6">',
        `${pendingUI}\n\n        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">`
    );
}

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully updated app/banking/[id]/page.tsx');
