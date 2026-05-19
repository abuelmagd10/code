import type { ToastActionElement, ToastProps } from "@/components/ui/toast"
import { getErrorMessage, commonErrorMessages } from '@/lib/error-messages'

type ToastFn = (props: Partial<ToastProps> & {
  title?: string
  description?: string
  action?: ToastActionElement
}) => void

type Language = 'ar' | 'en'

/**
 * Auto-detect language to use for the toast template.
 *
 * Strategy (content-first, settings-fallback):
 *   1. If any of the supplied labels contains Arabic characters → 'ar'.
 *      This preserves hard-coded Arabic callers when the UI is in English
 *      (e.g. `toastActionSuccess(toast, "التحديث", "فاتورة المورد")` stays Arabic).
 *   2. Else if labels contain only Latin characters → match active UI language
 *      from localStorage (so conditional bilingual callers render correctly).
 *   3. Else → fall back to 'ar' (project default + SSR).
 *
 * This eliminates both classes of mixed-language bugs:
 *   - "تم Save بنجاح" (English label in Arabic template — pre-existing bug)
 *   - "التحديث Successful" (Arabic label in English template — would have been a regression)
 */
const ARABIC_CHAR_RE = /[؀-ۿ]/
function detectLanguage(...labels: Array<string | undefined>): Language {
  // 1. Content-based: any Arabic char → Arabic template
  for (const label of labels) {
    if (label && ARABIC_CHAR_RE.test(label)) return 'ar'
  }
  // 2. Latin-only or no labels → respect UI language setting
  if (typeof window === 'undefined') return 'ar'
  try {
    return localStorage.getItem('app_language') === 'en' ? 'en' : 'ar'
  } catch {
    return 'ar'
  }
}

/**
 * Success toast for delete actions with bilingual support.
 * Example: "تم الحذف" / "تم حذف الفاتورة بنجاح."
 *
 * If `lang` is omitted, the active UI language is auto-detected from localStorage.
 */
export function toastDeleteSuccess(toast: ToastFn, resourceLabel: string, lang?: Language) {
  const activeLang: Language = lang ?? detectLanguage(resourceLabel)
  const messages = {
    ar: {
      title: "تم الحذف",
      description: `تم حذف ${resourceLabel} بنجاح`
    },
    en: {
      title: "Deleted Successfully",
      description: `${resourceLabel} has been deleted successfully`
    }
  }

  toast({
    title: messages[activeLang].title,
    description: messages[activeLang].description,
  })
}

/**
 * Error toast for delete actions with bilingual support.
 * You can override the description with a specific failure reason.
 *
 * If `lang` is omitted, the active UI language is auto-detected from localStorage.
 */
export function toastDeleteError(
  toast: ToastFn,
  resourceLabel: string,
  description?: string,
  lang?: Language
) {
  const activeLang: Language = lang ?? detectLanguage(resourceLabel, description)
  const messages = {
    ar: {
      title: "فشل الحذف",
      defaultDescription: `حدث خطأ أثناء حذف ${resourceLabel}`
    },
    en: {
      title: "Delete Failed",
      defaultDescription: `Failed to delete ${resourceLabel}`
    }
  }

  toast({
    title: messages[activeLang].title,
    description: description ?? messages[activeLang].defaultDescription,
    variant: "destructive",
  })
}

/**
 * Generic success toast for CRUD operations with bilingual support.
 * actionLabel examples: "الحفظ", "التحديث", "الإنشاء" / "Save", "Update", "Create".
 *
 * If `lang` is omitted, the active UI language is auto-detected from localStorage.
 * This prevents mixed-language output when callers pass an English actionLabel
 * but don't specify lang (default was previously 'ar' → "تم Save بنجاح").
 */
export function toastActionSuccess(
  toast: ToastFn,
  actionLabel: string,
  resourceLabel?: string,
  lang?: Language
) {
  const activeLang: Language = lang ?? detectLanguage(actionLabel, resourceLabel)
  const messages = {
    ar: {
      title: `تم ${actionLabel}`,
      description: resourceLabel ? `تم ${actionLabel} ${resourceLabel} بنجاح` : `تم ${actionLabel} بنجاح`
    },
    en: {
      title: `${actionLabel} Successful`,
      description: resourceLabel ? `${resourceLabel} has been ${actionLabel.toLowerCase()}d successfully` : `${actionLabel} completed successfully`
    }
  }

  toast({
    title: messages[activeLang].title,
    description: messages[activeLang].description,
  })
}

/**
 * Generic error toast for CRUD operations with bilingual support and unified error messages.
 *
 * If `lang` is omitted, the active UI language is auto-detected from localStorage.
 */
export function toastActionError(
  toast: ToastFn,
  actionLabel: string,
  resourceLabel?: string,
  description?: string,
  lang?: Language,
  errorKey?: string
) {
  const activeLang: Language = lang ?? detectLanguage(actionLabel, resourceLabel, description)
  let errorMessage = description

  // Use unified error message if errorKey is provided
  if (errorKey) {
    errorMessage = getErrorMessage(errorKey, activeLang)
  }

  const messages = {
    ar: {
      title: `فشل ${actionLabel}`,
      defaultDescription: resourceLabel
        ? `حدث خطأ أثناء ${actionLabel} ${resourceLabel}`
        : `حدث خطأ أثناء ${actionLabel}`
    },
    en: {
      title: `${actionLabel} Failed`,
      defaultDescription: resourceLabel
        ? `Failed to ${actionLabel.toLowerCase()} ${resourceLabel}`
        : `Failed to ${actionLabel.toLowerCase()}`
    }
  }

  toast({
    title: messages[activeLang].title,
    description: errorMessage ?? messages[activeLang].defaultDescription,
    variant: "destructive",
  })
}

