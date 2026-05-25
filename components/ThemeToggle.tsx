/**
 * ThemeToggle — Global Light/Dark/System theme switcher
 * زر تَبديل الوضع الليلى/النهارى
 *
 * v3.44.0 — UI Phase 1 Step 5
 *
 * Three-way toggle: Light → Dark → System → Light → ...
 * Built on next-themes (already in app/layout.tsx ThemeProvider).
 *
 * Usage:
 *   <ThemeToggle />              // icon-only, default
 *   <ThemeToggle variant="full" /> // with labeled menu
 */

"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Sun, Moon, Monitor } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

interface ThemeToggleProps {
  /** Visual mode: 'icon' shows only an icon button, 'full' shows a labeled trigger */
  variant?: "icon" | "full"
  /** Show label (only with variant=full) */
  className?: string
  /** Detect Arabic language from localStorage */
  lang?: "ar" | "en"
}

function useLang(propLang?: "ar" | "en"): "ar" | "en" {
  const [lang, setLang] = React.useState<"ar" | "en">(propLang ?? "ar")
  React.useEffect(() => {
    if (propLang) return
    try {
      const v = localStorage.getItem("app_language") || localStorage.getItem("appLang") || "ar"
      setLang(v === "en" ? "en" : "ar")
    } catch {}
    const handler = () => {
      try {
        const v = localStorage.getItem("app_language") || localStorage.getItem("appLang") || "ar"
        setLang(v === "en" ? "en" : "ar")
      } catch {}
    }
    window.addEventListener("app_language_changed", handler)
    return () => window.removeEventListener("app_language_changed", handler)
  }, [propLang])
  return lang
}

export function ThemeToggle({ variant = "icon", className = "", lang: propLang }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const lang = useLang(propLang)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const labels = {
    ar: { light: "نهارى", dark: "ليلى", system: "تَلقائى", title: "السمة" },
    en: { light: "Light", dark: "Dark", system: "System", title: "Theme" },
  }[lang]

  // Avoid hydration mismatch — render placeholder until client mounts
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size={variant === "icon" ? "icon" : "sm"}
        className={cn("text-gray-300 hover:text-white hover:bg-slate-800", className)}
        aria-label={labels.title}
        disabled
      >
        <Sun className="w-5 h-5" />
      </Button>
    )
  }

  // Pick icon based on resolved theme (handles 'system' case)
  const ActiveIcon = resolvedTheme === "dark" ? Moon : Sun

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={variant === "icon" ? "icon" : "sm"}
          className={cn(
            "text-gray-300 hover:text-white hover:bg-slate-800 transition-colors",
            variant === "full" && "justify-start gap-2 w-full",
            className,
          )}
          aria-label={labels.title}
          title={labels.title}
        >
          <ActiveIcon className="w-5 h-5" />
          {variant === "full" && (
            <span suppressHydrationWarning>
              {theme === "light" ? labels.light : theme === "dark" ? labels.dark : labels.system}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={lang === "ar" ? "start" : "end"} className="min-w-[140px]">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className={cn("cursor-pointer gap-2", theme === "light" && "bg-accent")}
        >
          <Sun className="w-4 h-4" />
          <span>{labels.light}</span>
          {theme === "light" && <span className="mr-auto text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className={cn("cursor-pointer gap-2", theme === "dark" && "bg-accent")}
        >
          <Moon className="w-4 h-4" />
          <span>{labels.dark}</span>
          {theme === "dark" && <span className="mr-auto text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className={cn("cursor-pointer gap-2", theme === "system" && "bg-accent")}
        >
          <Monitor className="w-4 h-4" />
          <span>{labels.system}</span>
          {theme === "system" && <span className="mr-auto text-xs">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ThemeToggle
