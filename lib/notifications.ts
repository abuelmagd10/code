import type { ToastActionElement, ToastProps } from "@/components/ui/toast"
import { getErrorMessage, commonErrorMessages } from '@/lib/error-messages'

type ToastFn = (props: Partial<ToastProps> & {
  title?: string
  description?: string
  action?: ToastActionElement
}) => void

type Language = 'ar' | 'en'

/**
 * Auto-detect UI language from localStorage. Falls back to 'ar' (project default).
 * SSR-safe: returns 'ar' if window is unavailable.
 *
 * Use this when callers don't explicitly pass a `lang` parameter — prevents
 * mixed-language toast output (e.g. "تم Save بنجاح").
 */
function detectLanguage(): Language {
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
  const activeLang: Language = lang ?? detectLanguage()
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
  const activeLang: Language = lang ?? detectLanguage()
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
  const activeLang: Language = lang ?? detectLanguage()
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
  const activeLang: Language = lang ?? detectLanguage()
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

