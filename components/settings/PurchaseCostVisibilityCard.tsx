"use client"

/**
 * components/settings/PurchaseCostVisibilityCard.tsx
 * ---------------------------------------------------------------------------
 * v3.74.909 — واجهة قرار 906: من يرى تكلفة الشراء فى هذه الشركة.
 *
 * القاعدة نفسها فى `can_view_purchase_cost`، والتبديل فى
 * `set_purchase_cost_visibility` — **بيد المالك وحده**، لأن من يرى التكلفة
 * لا يقرر من يراها. وهذه البطاقة هى بابُه الوحيد؛ وقبلها كان الإعداد حياً
 * فى القاعدة بلا مقبضٍ يُدار، **وإعدادٌ لا يستطيع أحدٌ تغييره إعدادٌ ميت**.
 *
 * ومن ليس مالكاً يرى الوضع القائم مكتوباً ولا يستطيع تغييره: الإخفاء عن
 * المستخدم لا يُضيف أمناً — القاعدة فى الخادم هى الحارس — لكنه يُخفى عنه
 * سببَ ما يراه، فيسأل عن «عمودٍ فارغ» بدل أن يقرأ القاعدة بنفسه.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, Loader2, Lock } from "lucide-react"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"

type Mode = "open" | "restricted" | "strict"

const MODES: Array<{ value: Mode; title: string; who: string }> = [
  {
    value: "open",
    title: "مفتوح",
    who: "كل عضوٍ فى الشركة يرى تكلفة الشراء (السلوك القديم).",
  },
  {
    value: "restricted",
    title: "مقيَّد — الافتراضى",
    who: "المالك والمدير العام والمحاسب ومسئول المشتريات، ويُستثنى منشئ المستند لمستنده هو.",
  },
  {
    value: "strict",
    title: "متشدد",
    who: "المالك والمدير العام فقط، ويبقى لمنشئ المستند مستندُه هو.",
  },
]

export function PurchaseCostVisibilityCard({ language = "ar" }: { language?: string }) {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<Mode | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const cid = await getActiveCompanyId(supabase)
        if (!cid) return
        setCompanyId(cid)

        const { data: auth } = await supabase.auth.getUser()
        const uid = auth?.user?.id || null

        const { data: company } = await supabase
          .from("companies")
          .select("id, user_id, purchase_cost_visibility")
          .eq("id", cid)
          .maybeSingle()

        setMode(((company as any)?.purchase_cost_visibility as Mode) || "restricted")

        let owner = !!uid && (company as any)?.user_id === uid
        if (!owner && uid) {
          const { data: member } = await supabase
            .from("company_members")
            .select("role")
            .eq("company_id", cid)
            .eq("user_id", uid)
            .maybeSingle()
          owner = String((member as any)?.role || "").trim().toLowerCase() === "owner"
        }
        setIsOwner(owner)
      } finally {
        setLoading(false)
      }
    })()
  }, [supabase])

  const apply = async (next: Mode) => {
    if (!companyId || next === mode) return
    setSaving(next)
    try {
      const { data, error } = await supabase.rpc("set_purchase_cost_visibility", {
        p_company_id: companyId,
        p_mode: next,
      })
      const res = data as { success?: boolean; error?: string } | null
      if (error || !res?.success) {
        // الخادم يرفض بالاسم: `OWNER_ONLY` تعنى أن القاعدة تحرس نفسها.
        toast({
          title: "لم يُحفظ",
          description:
            res?.error === "OWNER_ONLY"
              ? "هذا القرار للمالك وحده."
              : res?.error || error?.message || "تعذّر حفظ الإعداد.",
          variant: "destructive",
        })
        return
      }
      setMode(next)
      toast({ title: "حُفظ", description: "سرى الإعداد على كل الشاشات فوراً." })
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
        <CardContent className="p-6 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ تحميل إعداد رؤية التكلفة…
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg">
            <Eye className="w-5 h-5 text-rose-600 dark:text-rose-400" />
          </div>
          <span>رؤية تكلفة الشراء</span>
          {!isOwner && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Lock className="w-3 h-3" /> للمالك وحده
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-6">
          تكلفة المنتج نفسها تُقاس <strong>بالدور وحده</strong> — لأن المنتج لا منشئ له،
          وتكلفته تتغيّر بمشترياتٍ لا شأن لمن أنشأه بها.
        </p>

        <div className="grid gap-2">
          {MODES.map((m) => {
            const active = mode === m.value
            return (
              <button
                key={m.value}
                type="button"
                disabled={!isOwner || saving !== null}
                onClick={() => apply(m.value)}
                className={[
                  "text-right rounded-lg border p-3 transition-all",
                  active
                    ? "border-rose-400 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-700"
                    : "border-gray-200 dark:border-slate-700 hover:border-rose-200",
                  !isOwner ? "opacity-70 cursor-not-allowed" : "cursor-pointer",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-900 dark:text-white">{m.title}</span>
                  {active && <Badge className="bg-rose-600 text-white text-[10px]">القائم الآن</Badge>}
                  {saving === m.value && <Loader2 className="w-3 h-3 animate-spin text-rose-600" />}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-5">{m.who}</p>
              </button>
            )
          })}
        </div>

        {!isOwner && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            تُعرض هنا القاعدة السارية كى تُقرأ لا كى تُغيَّر — والخادم يرفض أى تبديلٍ من غير المالك.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default PurchaseCostVisibilityCard
