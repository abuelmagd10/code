"use client"

/**
 * TaxCodeSelect — shared dropdown that reads tax codes from DB.
 *
 * Why this exists
 * ---------------
 * Until v3.74.394 every form (purchase orders, bills, sales invoices,
 * estimates, returns, credit notes, ...) was reading the tax list from
 * `localStorage.getItem("tax_codes")` and falling back to a free numeric
 * input when localStorage was empty. That meant:
 *   - Different browsers (purchasing officer vs owner) saw different
 *     tax lists, or none at all.
 *   - The list was never refreshed when /settings/taxes was edited from
 *     a different browser.
 *   - "0" appeared in the column even when the company had 3 tax codes
 *     defined server-side.
 *
 * This component centralises the read: it goes to `listTaxCodes` (which
 * hits the `tax_codes` table over Supabase) and renders one of three
 * shapes:
 *
 *   1. Active company has at least one tax_code →
 *      Select with "بدون ضريبة (0%)" + one item per active tax code.
 *   2. Active company has zero tax_codes →
 *      Inline text "بدون ضريبة" + a small "أضف ضريبة" link to
 *      /settings/taxes. The user can complete the document with no tax,
 *      but is guided to add codes for next time.
 *   3. Legacy row (a saved invoice with tax_rate > 0 but no tax_code_id) →
 *      The Select shows a disabled "قديم: X%" item for transparency, and
 *      forces the user to pick a real code if they change the value.
 *
 * Output contract
 * ---------------
 * onChange emits { tax_code_id: string | null, tax_rate: number, name: string }.
 * Callers must persist BOTH tax_code_id AND tax_rate (the rate is
 * snapshotted at write time so future tax_code edits don't retroactively
 * rewrite ledgers).
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { listTaxCodes, type TaxCode } from "@/lib/taxes"

interface TaxCodeSelectProps {
  supabase: any
  companyId?: string | null
  /** Filter the list to codes whose scope matches. "both" codes always pass. */
  scope?: "sales" | "purchase" | "both"
  value: { tax_code_id?: string | null; tax_rate?: number }
  onChange: (v: { tax_code_id: string | null; tax_rate: number; name: string }) => void
  disabled?: boolean
  lang?: "ar" | "en"
  className?: string
}

const NONE_VALUE = "__no_tax__"
const LEGACY_PREFIX = "__legacy_"

export function TaxCodeSelect({
  supabase,
  companyId,
  scope,
  value,
  onChange,
  disabled,
  lang = "ar",
  className,
}: TaxCodeSelectProps) {
  const [codes, setCodes] = useState<TaxCode[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const all = await listTaxCodes(supabase, companyId || undefined)
        if (!alive) return
        const filtered = (all || []).filter((c) => {
          if (!c.is_active) return false
          if (!scope) return true
          // "both" codes are always available; otherwise scope must match exactly
          return c.scope === "both" || c.scope === scope
        })
        // Sort by rate ascending so 0% comes first when present
        filtered.sort((a, b) => (a.rate || 0) - (b.rate || 0))
        setCodes(filtered)
      } catch {
        if (alive) setCodes([])
      } finally {
        if (alive) setLoaded(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, companyId, scope])

  // Empty state: only allow "no tax" + nudge to settings.
  if (loaded && codes.length === 0) {
    return (
      <div
        className={
          "flex flex-col items-center gap-0.5 text-center " + (className || "")
        }
      >
        <span className="text-xs text-muted-foreground">
          {lang === "en" ? "No tax" : "بدون ضريبة"}
        </span>
        <Link
          href="/settings/taxes"
          className="text-[10px] text-blue-600 hover:underline"
        >
          {lang === "en" ? "Add tax" : "أضف ضريبة"}
        </Link>
      </div>
    )
  }

  const currentRate = Number(value.tax_rate) || 0
  const linkedId = value.tax_code_id || null

  // Resolve which Select option is currently selected.
  let selectedKey: string
  if (linkedId) {
    selectedKey = linkedId
  } else if (currentRate === 0) {
    selectedKey = NONE_VALUE
  } else {
    // Legacy row: rate > 0 with no tax_code_id link.
    selectedKey = LEGACY_PREFIX + currentRate
  }

  const handleChange = (key: string) => {
    if (key === NONE_VALUE) {
      onChange({
        tax_code_id: null,
        tax_rate: 0,
        name: lang === "en" ? "No tax" : "بدون ضريبة",
      })
      return
    }
    const code = codes.find((c) => c.id === key)
    if (code) {
      onChange({
        tax_code_id: code.id,
        tax_rate: Number(code.rate) || 0,
        name: code.name,
      })
    }
  }

  return (
    <Select value={selectedKey} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger
        className={className || "bg-white dark:bg-slate-800 text-xs"}
      >
        <SelectValue
          placeholder={lang === "en" ? "Select tax" : "اختر الضريبة"}
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>
          {lang === "en" ? "No tax (0%)" : "بدون ضريبة (0%)"}
        </SelectItem>

        {/* Surface a legacy free-rate value so the user can see it before
            replacing it. Disabled — picking it would be a no-op anyway. */}
        {selectedKey.startsWith(LEGACY_PREFIX) && (
          <SelectItem value={selectedKey} disabled>
            {(lang === "en" ? "Legacy: " : "قديم: ") + currentRate + "%"}
          </SelectItem>
        )}

        {codes.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name} ({c.rate}%)
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default TaxCodeSelect
