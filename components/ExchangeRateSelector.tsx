"use client"

/**
 * ExchangeRateSelector (v3.18.0)
 * ─────────────────────────────────────────────────────────────────────
 * Shared dropdown for selecting an exchange rate from the company's
 * /settings/exchange-rates table. Replaces manual NumericInput across
 * all forms that capture FC amounts (expenses, payments, sales orders,
 * purchase orders, journal entries, etc.).
 *
 * Behaviour:
 *   - When fromCurrency === baseCurrency: hidden (rate is always 1)
 *   - Otherwise: shows latest rate per source ('api' + 'manual')
 *     with the API rate selected by default. User can switch.
 *   - Empty state: error + link to /settings/exchange-rates
 *
 * Props:
 *   - fromCurrency: the FC code (e.g., "USD")
 *   - baseCurrency: company base currency (e.g., "EGP")
 *   - value: the currently-selected rate (controlled component)
 *   - onChange: called with the selected numeric rate
 *   - onRateMetaChange (optional): called with full rate metadata
 *     ({ rateId, source, rate_date }) — useful if the form needs
 *     to persist exchange_rate_id and rate_source columns
 *   - disabled (optional): boolean
 *   - labelEn / labelAr (optional): custom labels
 *
 * Example:
 *   <ExchangeRateSelector
 *     fromCurrency={currencyCode}
 *     baseCurrency="EGP"
 *     value={exchangeRate}
 *     onChange={setExchangeRate}
 *   />
 */

import { useEffect, useState } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { Label } from "@/components/ui/label"
import Link from "next/link"

export interface ExchangeRateOption {
  id: string
  rate: number
  source: "api" | "manual"
  rate_date: string
  label: string
}

export interface ExchangeRateMeta {
  rateId: string
  source: "api" | "manual"
  rate: number
  rate_date: string
}

export interface ExchangeRateSelectorProps {
  fromCurrency: string
  baseCurrency: string
  value: number
  onChange: (rate: number) => void
  onRateMetaChange?: (meta: ExchangeRateMeta | null) => void
  disabled?: boolean
  labelEn?: string
  labelAr?: string
  className?: string
  /** Hide the label (caller renders its own) */
  hideLabel?: boolean
  /** Show small "current selection" preview under the dropdown */
  showPreview?: boolean
}

export function ExchangeRateSelector(props: ExchangeRateSelectorProps) {
  const {
    fromCurrency,
    baseCurrency,
    value,
    onChange,
    onRateMetaChange,
    disabled,
    labelEn,
    labelAr,
    className,
    hideLabel,
    showPreview,
  } = props

  const supabase = useSupabase()
  const [appLang, setAppLang] = useState<"ar" | "en">("ar")
  const [rates, setRates] = useState<ExchangeRateOption[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string>("")

  const t = (en: string, ar: string) => (appLang === "en" ? en : ar)

  useEffect(() => {
    try { setAppLang((localStorage.getItem("app_language") || "ar") === "en" ? "en" : "ar") } catch {}
  }, [])

  const fc = (fromCurrency || "").toUpperCase()
  const base = (baseCurrency || "EGP").toUpperCase()
  const isSameCurrency = !fc || fc === base

  useEffect(() => {
    if (isSameCurrency) {
      setRates([])
      setSelectedId("")
      if (value !== 1) onChange(1)
      if (onRateMetaChange) onRateMetaChange(null)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from("exchange_rates")
          .select("id, rate, rate_date, source")
          .eq("from_currency", fc)
          .eq("to_currency", base)
          .order("rate_date", { ascending: false })
          .limit(50)
        if (cancelled) return
        if (error) {
          console.error("[ExchangeRateSelector] Failed to load rates:", error)
          setRates([])
          return
        }
        // Latest rate per source
        const seen = new Set<string>()
        const list: ExchangeRateOption[] = []
        for (const row of data || []) {
          const src = String((row as any).source || "api") as "api" | "manual"
          if (seen.has(src)) continue
          seen.add(src)
          const rate = Number((row as any).rate)
          const rate_date = String((row as any).rate_date)
          list.push({
            id: String((row as any).id),
            rate,
            source: src,
            rate_date,
            label: `${src === "manual" ? "✋ يدوى" : "🔄 لحظى (API)"} — ${rate.toFixed(4)} (${rate_date})`,
          })
        }
        setRates(list)
        // Auto-select: prefer API; otherwise first available
        const def = list.find((r) => r.source === "api") || list[0]
        if (def) {
          setSelectedId(def.id)
          onChange(def.rate)
          if (onRateMetaChange) {
            onRateMetaChange({ rateId: def.id, source: def.source, rate: def.rate, rate_date: def.rate_date })
          }
        } else {
          setSelectedId("")
          if (value !== 0) onChange(0)
          if (onRateMetaChange) onRateMetaChange(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fc, base])

  if (isSameCurrency) return null

  const handleSelect = (id: string) => {
    setSelectedId(id)
    const r = rates.find((x) => x.id === id)
    if (r) {
      onChange(r.rate)
      if (onRateMetaChange) {
        onRateMetaChange({ rateId: r.id, source: r.source, rate: r.rate, rate_date: r.rate_date })
      }
    }
  }

  return (
    <div className={`space-y-1 ${className || ""}`}>
      {!hideLabel && (
        <Label className="text-sm">
          {labelEn && labelAr
            ? t(labelEn, labelAr)
            : t(`Exchange Rate (${fc} → ${base})`, `سعر الصرف (${fc} → ${base})`)}
        </Label>
      )}
      {loading ? (
        <div className="text-xs text-gray-500 py-2">
          {t("Loading rates...", "جارى تحميل الأسعار...")}
        </div>
      ) : rates.length === 0 ? (
        <div className="text-xs space-y-1">
          <div className="text-red-600 dark:text-red-400">
            ⚠️ {t(
              `No exchange rate found for ${fc} → ${base}`,
              `لا يوجد سعر صرف لـ ${fc} → ${base}`
            )}
          </div>
          <Link href="/settings/exchange-rates" className="text-blue-600 hover:underline text-xs inline-block">
            → {t("Add rate in settings", "إضافة سعر فى الإعدادات")}
          </Link>
        </div>
      ) : (
        <>
          <select
            className="w-full border rounded px-2 py-1.5 text-sm dark:bg-slate-800 dark:border-slate-700 disabled:opacity-60"
            value={selectedId}
            disabled={disabled}
            onChange={(e) => handleSelect(e.target.value)}
          >
            {rates.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
          {showPreview && (
            <div className="text-[11px] text-gray-500">
              {t(
                `1 ${fc} = ${value.toFixed(4)} ${base}`,
                `1 ${fc} = ${value.toFixed(4)} ${base}`
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
