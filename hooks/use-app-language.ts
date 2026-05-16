"use client"
import { useState, useEffect } from "react"

export type AppLang = "ar" | "en"

function readLang(): AppLang {
  try {
    return (localStorage.getItem("app_language") || "ar") === "en" ? "en" : "ar"
  } catch {
    return "ar"
  }
}

/**
 * Hook موحّد لتتبع لغة التطبيق.
 * يستمع لـ app_language_changed + storage events.
 */
export function useAppLanguage() {
  const [appLang, setAppLang] = useState<AppLang>("ar")

  useEffect(() => {
    setAppLang(readLang())
    const handler = () => setAppLang(readLang())
    window.addEventListener("app_language_changed", handler)
    window.addEventListener("storage", handler)
    return () => {
      window.removeEventListener("app_language_changed", handler)
      window.removeEventListener("storage", handler)
    }
  }, [])

  const t = (ar: string, en: string) => (appLang === "ar" ? ar : en)
  const dir: "rtl" | "ltr" = appLang === "ar" ? "rtl" : "ltr"

  return { appLang, setAppLang, t, dir, isRTL: appLang === "ar" }
}
