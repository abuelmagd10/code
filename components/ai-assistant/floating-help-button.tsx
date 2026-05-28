"use client"

import { HelpCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface FloatingHelpButtonProps {
  onClick: () => void
  lang: "ar" | "en"
  showPulse: boolean
  alertCount?: number
  alertSeverity?: "critical" | "warning" | "info" | null
}

const TOOLTIP_TEXT = {
  ar: "مساعدك الذكى",
  en: "Your smart assistant",
}

function alertTooltip(lang: "ar" | "en", n: number): string {
  if (lang === "ar") {
    return `لديك ${n} ${n === 1 ? "تنبيه" : "تنبيهات"} تحتاج انتباهك`
  }
  return `You have ${n} alert${n === 1 ? "" : "s"} that need attention`
}

/**
 * Fixed floating help button.
 * - Positioned bottom-right for LTR, bottom-left for RTL (Arabic).
 * - Shows an animated pulse dot when ai_mode=auto and the page hasn't been seen.
 * - Shows a count badge when there are proactive alerts (v3.60.0 Phase 4).
 * - Uses Tooltip for hover label.
 */
export function FloatingHelpButton({
  onClick,
  lang,
  showPulse,
  alertCount = 0,
  alertSeverity = null,
}: FloatingHelpButtonProps) {
  const isRtl = lang === "ar"
  const hasAlerts = alertCount > 0
  const displayCount = alertCount > 99 ? "99+" : String(alertCount)

  const badgeColor =
    alertSeverity === "critical"
      ? "bg-rose-600"
      : alertSeverity === "warning"
        ? "bg-amber-500"
        : "bg-blue-600"

  const tooltipText = hasAlerts ? alertTooltip(lang, alertCount) : TOOLTIP_TEXT[lang]

  return (
    <div
      className={"fixed bottom-6 z-50 " + (isRtl ? "left-6" : "right-6")}
      style={{ isolation: "isolate" }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            aria-label={tooltipText}
            className={[
              "relative flex items-center justify-center",
              "w-12 h-12 rounded-full shadow-lg",
              "bg-blue-600 hover:bg-blue-700 active:scale-95",
              "text-white transition-all duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2",
            ].join(" ")}
          >
            <HelpCircle className="h-5 w-5" />

            {hasAlerts && (
              <span
                className={[
                  "absolute -top-1 -right-1 flex min-w-[20px] h-5 px-1",
                  "items-center justify-center rounded-full",
                  "border-2 border-white dark:border-slate-900",
                  "text-[10px] font-bold leading-none text-white",
                  badgeColor,
                ].join(" ")}
                aria-hidden="true"
              >
                {displayCount}
              </span>
            )}

            {showPulse && !hasAlerts && (
              <>
                <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-amber-400 border-2 border-white dark:border-slate-900" />
                <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-amber-400 animate-ping opacity-75" />
              </>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={isRtl ? "right" : "left"}
          className="text-xs"
        >
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
