"use client"

import { HelpCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface FloatingHelpButtonProps {
  onClick: () => void
  lang: "ar" | "en"
  showPulse: boolean
}

const TOOLTIP_TEXT = {
  ar: "دليل الاستخدام",
  en: "Page Guide",
}

/**
 * Fixed floating help button.
 * - Positioned bottom-right for LTR, bottom-left for RTL (Arabic).
 * - Shows an animated pulse dot when ai_mode=auto and the page hasn't been seen.
 * - Uses Tooltip for hover label.
 */
export function FloatingHelpButton({ onClick, lang, showPulse }: FloatingHelpButtonProps) {
  const isRtl = lang === "ar"

  return (
    <div
      className={`fixed bottom-6 z-50 ${isRtl ? "left-6" : "right-6"}`}
      style={{ isolation: "isolate" }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            aria-label={TOOLTIP_TEXT[lang]}
            className={[
              "relative flex items-center justify-center",
              "w-12 h-12 rounded-full shadow-lg",
              "bg-blue-600 hover:bg-blue-700 active:scale-95",
              "text-white transition-all duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2",
            ].join(" ")}
          >
            <HelpCircle className="h-5 w-5" />

            {/* Pulse indicator for auto-mode unseen pages */}
            {showPulse && (
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
          {TOOLTIP_TEXT[lang]}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
