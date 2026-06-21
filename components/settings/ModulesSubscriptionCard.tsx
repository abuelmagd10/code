"use client"

/**
 * v3.74.260 — Modules Subscription card.
 *
 * Lives inside the existing /settings/users page (no new page created).
 * Lets the owner pick which optional sidebar modules are visible to
 * everyone in the company. Phase 1 contract:
 *   - Core modules are always on and shown disabled with a lock icon.
 *   - Optional modules are switchable; switches off → group disappears
 *     from the sidebar after the user reloads.
 *   - No deletion of data, no API blocking, no trigger disabling. A user
 *     who knows a direct URL can still reach a "disabled" page.
 *
 * Why pre-existing roles only see it for owners: PUT /api/company/
 * enabled-modules already enforces owner_only server-side, so the
 * client-side hide is just to keep the UI clean.
 */

import { useEffect, useState } from "react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Lock, LayoutGrid, Info } from "lucide-react"
import {
  CORE_MODULES,
  OPTIONAL_MODULES,
  MODULE_LABELS,
  type ModuleKey,
} from "@/lib/module-manifest"

export function ModulesSubscriptionCard() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [role, setRole] = useState<string>("")
  // null → "legacy company, show all". Set → explicit picks.
  const [enabled, setEnabled] = useState<Set<string>>(new Set())
  const [isLegacy, setIsLegacy] = useState<boolean>(true)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch("/api/company/enabled-modules")
        if (!r.ok) return
        const j = await r.json()
        if (!alive) return
        setRole(String(j?.role || ""))
        const arr = j?.enabled_modules as string[] | null
        if (arr == null) {
          setIsLegacy(true)
          // Legacy default: everything optional is currently visible.
          setEnabled(new Set<string>(OPTIONAL_MODULES as readonly string[]))
        } else {
          setIsLegacy(false)
          setEnabled(new Set<string>(arr))
        }
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  // Hide entirely for non-owners — the API rejects them anyway, but
  // showing inert switches would be confusing.
  if (!loading && role && role !== "owner") return null

  const toggle = (key: ModuleKey) => {
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    // First interaction promotes the company out of "legacy / show all".
    setIsLegacy(false)
  }

  const save = async () => {
    try {
      setSaving(true)
      const body = { enabled_modules: Array.from(enabled).sort() }
      const r = await fetch("/api/company/enabled-modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        toast({
          title: "تعذّر الحفظ",
          description: j?.error || "حصل خطأ غير متوقع",
          variant: "destructive",
        })
        return
      }
      toast({
        title: "تم الحفظ",
        description: "اختياراتك حُفظت — أعد تحميل الصفحة لتظهر القائمة الجانبية بالشكل الجديد.",
      })
      setIsLegacy(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3 pb-3 border-b border-gray-100 dark:border-slate-800">
        <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg shadow shadow-emerald-500/20">
          <LayoutGrid className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-base font-semibold">الوحدات المُشتَرَك بها</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            اختر الوحدات اللى تظهر فى القائمة الجانبية لشركتك. تقدر تخفى اللى ما بتستخدمهاش.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…
          </div>
        ) : (
          <>
            {isLegacy && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 text-sm">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <span className="text-blue-900 dark:text-blue-200">
                  دلوقتى كل الوحدات ظاهرة (الوضع الافتراضى). أول ما تحفظ، الاختيار ده يبقى ثابت لشركتك.
                </span>
              </div>
            )}

            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                وحدات أساسية — مفعّلة دائماً
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(CORE_MODULES as readonly ModuleKey[]).map((k) => (
                  <div
                    key={k}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-slate-800/50 opacity-80"
                  >
                    <div className="flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-sm font-medium">{MODULE_LABELS[k].ar}</span>
                    </div>
                    <Switch checked disabled />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                وحدات اختيارية — حدّد اللى تحتاجها
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(OPTIONAL_MODULES as readonly ModuleKey[]).map((k) => {
                  const meta = MODULE_LABELS[k]
                  const on = enabled.has(k)
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggle(k)}
                      className={`flex items-start justify-between p-3 rounded-lg border text-right transition-colors
                        ${on
                          ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40"
                          : "bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700"}`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-sm font-medium">{meta.ar}</div>
                        {meta.description?.ar && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {meta.description.ar}
                          </div>
                        )}
                      </div>
                      <Switch checked={on} onCheckedChange={() => toggle(k)} />
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                onClick={save}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ الاختيار"}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
